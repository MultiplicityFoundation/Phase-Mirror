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
import type { RepoGovernanceState, BranchProtectionState, CodeownersState, OrgContext } from '../rules/tier-b/MD-101.js';
import type { OrgPolicyManifest } from '../rules/tier-b/policy-manifest.js';
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
export declare class NotFoundError extends Error {
    readonly code: "GITHUB_NOT_FOUND";
    constructor(path: string);
}
export declare class RateLimitError extends Error {
    readonly code: "GITHUB_RATE_LIMITED";
    readonly resetAt: Date;
    constructor(resetAt: Date);
}
interface GitHubClientConfig {
    token: string;
    apiBaseUrl?: string;
}
/** Minimal raw shapes from the GitHub REST API — only the fields we use */
interface GitHubRepoResponse {
    name: string;
    full_name: string;
    owner: {
        login: string;
    };
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
    enforce_admins?: {
        enabled: boolean;
    };
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
export declare class GitHubClient {
    private readonly baseUrl;
    private readonly token;
    constructor(cfg: GitHubClientConfig);
    private request;
    /**
     * List repos in an org, paginated.
     * Uses per_page=100 and stops at maxRepos (default: no limit).
     */
    listOrgRepos(org: string, maxRepos?: number): Promise<GitHubRepoResponse[]>;
    /**
     * Get branch protection for a specific branch.
     * Returns null-like via NotFoundError if protection is not enabled.
     */
    getBranchProtection(owner: string, repo: string, branch: string): Promise<GitHubBranchProtectionResponse>;
    /**
     * List workflows in a repo.
     */
    listWorkflows(owner: string, repo: string): Promise<GitHubWorkflowsResponse>;
    /**
     * Attempt to fetch CODEOWNERS from a given path.
     * Returns the decoded content or null via NotFoundError.
     */
    getFileContent(owner: string, repo: string, path: string): Promise<string | null>;
}
/**
 * Maps GitHub's branch protection response into the simplified shape MD-101
 * consumes.
 */
export declare function mapBranchProtection(bp: GitHubBranchProtectionResponse, branch: string): BranchProtectionState;
/**
 * Parse CODEOWNERS content into covered paths.
 *
 * Heuristic: each non-comment, non-blank line whose first token starts with
 * '/' or '*' is considered a covered path.
 */
export declare function parseCodeowners(content: string): string[];
/**
 * Try standard CODEOWNERS locations; return coverage info.
 */
export declare function loadCodeownersCoverage(client: GitHubClient, owner: string, repo: string): Promise<CodeownersState>;
/**
 * Fetches a fresh governance snapshot from GitHub for all repos in an org.
 *
 * Degradation behaviour:
 * - Branch protection returns 404 → treated as "no protection" (not an error)
 * - Workflows return 403/404 → treated as no workflows
 * - CODEOWNERS missing → { exists: false }
 * - Rate limit → throws RateLimitError with reset time
 */
export declare function fetchLiveOrgState(config: OrgAggregatorConfig): Promise<RepoGovernanceState[]>;
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
export declare class DynamoDBGovernanceCache implements GovernanceCacheAdapter {
    private readonly tableName;
    private readonly ttlSeconds;
    private readonly dynamoClient;
    constructor(opts?: {
        tableName?: string;
        ttlSeconds?: number;
        dynamoClient?: DynamoDBLike;
    });
    persist(org: string, repos: RepoGovernanceState[]): Promise<void>;
    load(org: string): Promise<RepoGovernanceState[] | null>;
}
/**
 * Minimal abstraction over DynamoDB operations. Keeps the actual
 * `@aws-sdk/client-dynamodb` import lazy and injectable for tests.
 */
export interface DynamoDBLike {
    batchWrite(tableName: string, items: Record<string, unknown>[]): Promise<void>;
    query(tableName: string, org: string): Promise<Record<string, unknown>[] | null>;
}
/**
 * High-level convenience: loads cached governance state and wraps it into
 * the OrgContext shape MD-101 expects.
 *
 * Throws if no cached data exists — callers should run the scan job first.
 */
export declare function buildOrgContext(org: string, manifest: OrgPolicyManifest, cache?: GovernanceCacheAdapter): Promise<OrgContext>;
/** Split an array into chunks of at most `size` elements. */
export declare function chunk<T>(arr: T[], size: number): T[][];
/**
 * Standalone wrapper around DynamoDBGovernanceCache.persist() so callers
 * (CLI, Lambda) don't need to construct the class themselves.
 *
 * Uses the same env-var / default conventions as DynamoDBGovernanceCache.
 */
export declare function persistOrgState(org: string, repos: RepoGovernanceState[], cache?: GovernanceCacheAdapter): Promise<void>;
/**
 * Standalone wrapper around DynamoDBGovernanceCache.load().
 */
export declare function loadCachedOrgState(org: string, cache?: GovernanceCacheAdapter): Promise<RepoGovernanceState[] | null>;
export {};
