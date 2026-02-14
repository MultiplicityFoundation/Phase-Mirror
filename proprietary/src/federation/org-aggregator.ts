/**
 * Org Aggregator — Federation stub for GitHub governance scanning
 *
 * Central tension: API completeness vs. operational risk.
 * Pulling every detail for every repo every hour can blow rate limits and stall
 * scans, but under-fetching leads to blind spots in MD-101. This aggregator is
 * explicit about what it collects, how often, and how it degrades when GitHub is
 * slow or unavailable. Design decision: scheduled snapshot with visible
 * staleness, minimal fields required by MD-101, and clear degraded-mode
 * reporting.
 *
 * This is the single way MD-101 gets RepoGovernanceState[]. The CLI / SaaS
 * layer decides whether to use live or cached data.
 *
 * @license Phase Mirror Pro License v1.0
 */

import type {
  RepoGovernanceState,
  BranchProtectionState,
  WorkflowEntry,
  CodeownersState,
  OrgContext,
} from '../rules/tier-b/MD-101.js';
import type { OrgPolicyManifest } from '../rules/tier-b/policy-manifest.js';

// ─── Configuration ───────────────────────────────────────────────────

export interface OrgAggregatorConfig {
  /** GitHub org login, e.g. 'PhaseMirror' */
  org: string;
  /** GitHub App installation token or PAT */
  githubToken: string;
  /** Default branch to inspect when unknown */
  defaultBranch?: string;
  /** GitHub API base URL (for GHES). Defaults to https://api.github.com */
  apiBaseUrl?: string;
  /** Max repos per scan (for very large orgs). Defaults to 100. */
  maxRepos?: number;
}

// ─── OrgAggregator interface ─────────────────────────────────────────

export interface OrgAggregator {
  /** Fetches a fresh snapshot from GitHub (no cache) */
  fetchLiveOrgState(config: OrgAggregatorConfig): Promise<RepoGovernanceState[]>;

  /** Loads the cached snapshot from the persistence layer (if present) */
  loadCachedOrgState(org: string): Promise<RepoGovernanceState[] | null>;

  /** Writes a snapshot to the persistence layer with scannedAt timestamps */
  persistOrgState(org: string, repos: RepoGovernanceState[]): Promise<void>;

  /** Convenience: build a full OrgContext for MD-101 */
  buildOrgContext(org: string, manifest: OrgPolicyManifest): Promise<OrgContext>;
}

// ─── Errors ──────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly code = 'GITHUB_NOT_FOUND' as const;
  constructor(path: string) {
    super(`GitHub resource not found: ${path}`);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends Error {
  readonly code = 'GITHUB_RATE_LIMITED' as const;
  readonly resetAt: Date;
  constructor(resetAt: Date) {
    super(`GitHub rate limit exceeded. Resets at ${resetAt.toISOString()}`);
    this.name = 'RateLimitError';
    this.resetAt = resetAt;
  }
}

// ─── GitHub REST Client ──────────────────────────────────────────────

type HttpMethod = 'GET';

interface GitHubClientConfig {
  token: string;
  apiBaseUrl?: string;
}

/** Minimal raw shapes from the GitHub REST API — only the fields we use */
interface GitHubRepoResponse {
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  archived: boolean;
  visibility?: 'public' | 'private' | 'internal';
  language: string | null;
  topics?: string[];
}

interface GitHubBranchProtectionResponse {
  required_pull_request_reviews?: {
    required_approving_review_count?: number;
    dismiss_stale_reviews?: boolean;
    require_code_owner_reviews?: boolean;
  };
  enforce_admins?: { enabled: boolean };
  required_status_checks?: {
    strict: boolean;
    contexts: string[];
  };
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: Array<{
    id: number;
    name: string;
    path: string;
    state: string;
  }>;
}

interface GitHubContentResponse {
  content?: string;
  encoding?: string;
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(cfg: GitHubClientConfig) {
    this.baseUrl = (cfg.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
    this.token = cfg.token;
  }

  private async request<T>(method: HttpMethod, path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Rate-limit detection
    if (res.status === 403 || res.status === 429) {
      const resetHeader = res.headers.get('x-ratelimit-reset');
      if (resetHeader) {
        throw new RateLimitError(new Date(parseInt(resetHeader, 10) * 1000));
      }
    }

    if (res.status === 404) {
      throw new NotFoundError(path);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API ${method} ${path} failed: ${res.status} ${text}`);
    }

    return res.json() as Promise<T>;
  }

  /**
   * List repos in an org, paginated.
   * Uses per_page=100 and stops at maxRepos (default: no limit).
   */
  async listOrgRepos(org: string, maxRepos?: number): Promise<GitHubRepoResponse[]> {
    const repos: GitHubRepoResponse[] = [];
    const perPage = 100;
    let page = 1;
    const limit = maxRepos ?? Infinity;

    while (repos.length < limit) {
      const batch = await this.request<GitHubRepoResponse[]>(
        'GET',
        `/orgs/${encodeURIComponent(org)}/repos?per_page=${perPage}&page=${page}&type=all`,
      );
      if (batch.length === 0) break;
      repos.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }

    return repos.slice(0, limit === Infinity ? undefined : limit);
  }

  /**
   * Get branch protection for a specific branch.
   * Returns null-like via NotFoundError if protection is not enabled.
   */
  async getBranchProtection(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubBranchProtectionResponse> {
    return this.request<GitHubBranchProtectionResponse>(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
    );
  }

  /**
   * List workflows in a repo.
   */
  async listWorkflows(owner: string, repo: string): Promise<GitHubWorkflowsResponse> {
    return this.request<GitHubWorkflowsResponse>(
      'GET',
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`,
    );
  }

  /**
   * Attempt to fetch CODEOWNERS from a given path.
   * Returns the decoded content or null via NotFoundError.
   */
  async getFileContent(owner: string, repo: string, path: string): Promise<string | null> {
    try {
      const content = await this.request<GitHubContentResponse>(
        'GET',
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`,
      );
      if (content.content && content.encoding === 'base64') {
        return Buffer.from(content.content, 'base64').toString('utf-8');
      }
      return content.content ?? null;
    } catch (err) {
      if (err instanceof NotFoundError) return null;
      throw err;
    }
  }
}

// ─── Mapping Helpers ─────────────────────────────────────────────────

/**
 * Maps GitHub's branch protection response into the simplified shape MD-101
 * consumes.
 */
export function mapBranchProtection(
  bp: GitHubBranchProtectionResponse,
  branch: string,
): BranchProtectionState {
  const prReviews = bp.required_pull_request_reviews;
  const statusChecks = bp.required_status_checks;

  return {
    branch,
    enabled: true,
    requirePullRequest: prReviews != null,
    requiredReviewers: prReviews?.required_approving_review_count ?? 0,
    dismissStaleReviews: prReviews?.dismiss_stale_reviews ?? false,
    requireCodeOwnerReviews: prReviews?.require_code_owner_reviews ?? false,
    enforceAdmins: bp.enforce_admins?.enabled ?? false,
    requiredStatusChecks: statusChecks?.contexts ?? [],
    requireStrictStatusChecks: statusChecks?.strict ?? false,
  };
}

/**
 * Parse CODEOWNERS content into covered paths.
 *
 * Heuristic: each non-comment, non-blank line whose first token starts with
 * '/' or '*' is considered a covered path.
 */
export function parseCodeowners(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => line.split(/\s+/)[0]!)
    .filter(path => path.startsWith('/') || path.startsWith('*'));
}

/** Standard CODEOWNERS locations (in order of precedence). */
const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];

/**
 * Try standard CODEOWNERS locations; return coverage info.
 */
export async function loadCodeownersCoverage(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<CodeownersState> {
  for (const path of CODEOWNERS_PATHS) {
    const content = await client.getFileContent(owner, repo, path);
    if (content != null) {
      return { exists: true, coveredPaths: parseCodeowners(content) };
    }
  }
  return { exists: false, coveredPaths: [] };
}

// ─── Core: fetchLiveOrgState ─────────────────────────────────────────

/**
 * Fetches a fresh governance snapshot from GitHub for all repos in an org.
 *
 * Degradation behaviour:
 * - Branch protection returns 404 → treated as "no protection" (not an error)
 * - Workflows return 403/404 → treated as no workflows
 * - CODEOWNERS missing → { exists: false }
 * - Rate limit → throws RateLimitError with reset time
 */
export async function fetchLiveOrgState(
  config: OrgAggregatorConfig,
): Promise<RepoGovernanceState[]> {
  const client = new GitHubClient({
    token: config.githubToken,
    apiBaseUrl: config.apiBaseUrl,
  });

  const repos = await client.listOrgRepos(config.org, config.maxRepos);
  const states: RepoGovernanceState[] = [];
  const nowIso = new Date().toISOString();

  for (const repo of repos) {
    const owner = repo.owner.login;
    const name = repo.name;
    const fullName = repo.full_name;
    const defaultBranch = repo.default_branch ?? config.defaultBranch ?? 'main';

    // — Branch protection (best-effort) —
    let branchProtection: BranchProtectionState | null = null;
    try {
      const bp = await client.getBranchProtection(owner, name, defaultBranch);
      branchProtection = mapBranchProtection(bp, defaultBranch);
    } catch (err) {
      if (err instanceof RateLimitError) throw err; // propagate rate-limit
      // NotFoundError or other: treat as "no protection"
    }

    // — Workflows (names / paths only) —
    let workflows: WorkflowEntry[] = [];
    try {
      const wf = await client.listWorkflows(owner, name);
      workflows = wf.workflows.map(w => ({
        path: w.path,
        jobNames: [], // MD-101 only needs presence; MD-100 handles YAML analysis
      }));
    } catch {
      // treat as no workflows
    }

    // — CODEOWNERS —
    const codeowners = await loadCodeownersCoverage(client, owner, name);

    const state: RepoGovernanceState = {
      fullName,
      meta: {
        topics: repo.topics ?? [],
        language: repo.language ?? 'Unknown',
        visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
        archived: repo.archived ?? false,
        defaultBranch,
      },
      branchProtection,
      workflows,
      defaultPermissions: 'read', // TODO: read from org/repo settings if needed
      codeowners,
      scannedAt: nowIso,
    };

    states.push(state);
  }

  return states;
}

// ─── Persistence (DynamoDB) ──────────────────────────────────────────

export interface GovernanceCacheAdapter {
  /** Write a batch of repo governance states for an org */
  persist(org: string, repos: RepoGovernanceState[]): Promise<void>;
  /** Load all cached repo governance states for an org, or null if empty */
  load(org: string): Promise<RepoGovernanceState[] | null>;
}

/**
 * DynamoDB-backed governance cache.
 *
 * Table schema:
 *   PK = org (string)
 *   SK = repo fullName (string)
 *   Attributes: state (JSON string), scannedAt (ISO), expiresAt (TTL epoch)
 */
export class DynamoDBGovernanceCache implements GovernanceCacheAdapter {
  private readonly tableName: string;
  private readonly ttlSeconds: number;
  private readonly dynamoClient: DynamoDBLike;

  constructor(opts: {
    tableName?: string;
    ttlSeconds?: number;
    dynamoClient?: DynamoDBLike;
  } = {}) {
    this.tableName = opts.tableName
      ?? process.env.MD_GOVERNANCE_CACHE_TABLE
      ?? 'mirror-governance-cache';
    this.ttlSeconds = opts.ttlSeconds ?? 2 * 60 * 60; // 2 hours
    this.dynamoClient = opts.dynamoClient ?? createDefaultDynamoClient();
  }

  async persist(org: string, repos: RepoGovernanceState[]): Promise<void> {
    const now = Date.now();
    const expiresAt = Math.floor((now + this.ttlSeconds * 1000) / 1000);

    // DynamoDB BatchWriteItem supports max 25 items per call
    const chunks = chunk(repos, 25);

    for (const group of chunks) {
      const items = group.map(repo => ({
        org,
        repo: repo.fullName,
        scannedAt: repo.scannedAt,
        expiresAt,
        state: JSON.stringify(repo),
      }));

      await this.dynamoClient.batchWrite(this.tableName, items);
    }
  }

  async load(org: string): Promise<RepoGovernanceState[] | null> {
    const items = await this.dynamoClient.query(this.tableName, org);
    if (!items || items.length === 0) return null;

    return items.map(item =>
      JSON.parse(item.state as string) as RepoGovernanceState,
    );
  }
}

// ─── DynamoDB abstraction (for testability) ──────────────────────────

/**
 * Minimal abstraction over DynamoDB operations. Keeps the actual
 * `@aws-sdk/client-dynamodb` import lazy and injectable for tests.
 */
export interface DynamoDBLike {
  batchWrite(tableName: string, items: Record<string, unknown>[]): Promise<void>;
  query(tableName: string, org: string): Promise<Record<string, unknown>[] | null>;
}

/**
 * Creates a real DynamoDB client. Lazily imports the AWS SDK so this module
 * can be loaded without `@aws-sdk/client-dynamodb` at test time.
 */
function createDefaultDynamoClient(): DynamoDBLike {
  // Lazy — actual SDK usage deferred to runtime
  return {
    async batchWrite(tableName: string, items: Record<string, unknown>[]): Promise<void> {
      const { DynamoDBClient, BatchWriteItemCommand } = await import(
        '@aws-sdk/client-dynamodb'
      );
      const { marshall } = await import('@aws-sdk/util-dynamodb');
      const client = new DynamoDBClient({});

      const requestItems = items.map(item => ({
        PutRequest: { Item: marshall(item) },
      }));

      await client.send(
        new BatchWriteItemCommand({
          RequestItems: { [tableName]: requestItems },
        }),
      );
    },

    async query(tableName: string, org: string): Promise<Record<string, unknown>[] | null> {
      const { DynamoDBClient, QueryCommand } = await import(
        '@aws-sdk/client-dynamodb'
      );
      const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
      const client = new DynamoDBClient({});

      const res = await client.send(
        new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: '#org = :org',
          ExpressionAttributeNames: { '#org': 'org' },
          ExpressionAttributeValues: marshall({ ':org': org }),
        }),
      );

      if (!res.Items || res.Items.length === 0) return null;
      return res.Items.map(item => unmarshall(item));
    },
  };
}

// ─── buildOrgContext (Phase 5) ───────────────────────────────────────

/**
 * High-level convenience: loads cached governance state and wraps it into
 * the OrgContext shape MD-101 expects.
 *
 * Throws if no cached data exists — callers should run the scan job first.
 */
export async function buildOrgContext(
  org: string,
  manifest: OrgPolicyManifest,
  cache?: GovernanceCacheAdapter,
): Promise<OrgContext> {
  const adapter = cache ?? new DynamoDBGovernanceCache();
  const cached = await adapter.load(org);

  if (!cached || cached.length === 0) {
    throw new Error(
      `No cached governance state for org "${org}". Run the org scan job first.`,
    );
  }

  return { manifest, repos: cached };
}

// ─── Utility ─────────────────────────────────────────────────────────

/** Split an array into chunks of at most `size` elements. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ─── Convenience: standalone persistOrgState ─────────────────────────

/**
 * Standalone wrapper around DynamoDBGovernanceCache.persist() so callers
 * (CLI, Lambda) don't need to construct the class themselves.
 *
 * Uses the same env-var / default conventions as DynamoDBGovernanceCache.
 */
export async function persistOrgState(
  org: string,
  repos: RepoGovernanceState[],
  cache?: GovernanceCacheAdapter,
): Promise<void> {
  const adapter = cache ?? new DynamoDBGovernanceCache();
  await adapter.persist(org, repos);
}

/**
 * Standalone wrapper around DynamoDBGovernanceCache.load().
 */
export async function loadCachedOrgState(
  org: string,
  cache?: GovernanceCacheAdapter,
): Promise<RepoGovernanceState[] | null> {
  const adapter = cache ?? new DynamoDBGovernanceCache();
  return adapter.load(org);
}
