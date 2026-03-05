"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDBGovernanceCache = exports.GitHubClient = exports.RateLimitError = exports.NotFoundError = void 0;
exports.mapBranchProtection = mapBranchProtection;
exports.parseCodeowners = parseCodeowners;
exports.loadCodeownersCoverage = loadCodeownersCoverage;
exports.fetchLiveOrgState = fetchLiveOrgState;
exports.buildOrgContext = buildOrgContext;
exports.chunk = chunk;
exports.persistOrgState = persistOrgState;
exports.loadCachedOrgState = loadCachedOrgState;
// ─── Errors ──────────────────────────────────────────────────────────
class NotFoundError extends Error {
    code = 'GITHUB_NOT_FOUND';
    constructor(path) {
        super(`GitHub resource not found: ${path}`);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class RateLimitError extends Error {
    code = 'GITHUB_RATE_LIMITED';
    resetAt;
    constructor(resetAt) {
        super(`GitHub rate limit exceeded. Resets at ${resetAt.toISOString()}`);
        this.name = 'RateLimitError';
        this.resetAt = resetAt;
    }
}
exports.RateLimitError = RateLimitError;
class GitHubClient {
    baseUrl;
    token;
    constructor(cfg) {
        this.baseUrl = (cfg.apiBaseUrl ?? 'https://api.github.com').replace(/\/$/, '');
        this.token = cfg.token;
    }
    async request(method, path) {
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
        return res.json();
    }
    /**
     * List repos in an org, paginated.
     * Uses per_page=100 and stops at maxRepos (default: no limit).
     */
    async listOrgRepos(org, maxRepos) {
        const repos = [];
        const perPage = 100;
        let page = 1;
        const limit = maxRepos ?? Infinity;
        while (repos.length < limit) {
            const batch = await this.request('GET', `/orgs/${encodeURIComponent(org)}/repos?per_page=${perPage}&page=${page}&type=all`);
            if (batch.length === 0)
                break;
            repos.push(...batch);
            if (batch.length < perPage)
                break;
            page++;
        }
        return repos.slice(0, limit === Infinity ? undefined : limit);
    }
    /**
     * Get branch protection for a specific branch.
     * Returns null-like via NotFoundError if protection is not enabled.
     */
    async getBranchProtection(owner, repo, branch) {
        return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`);
    }
    /**
     * List workflows in a repo.
     */
    async listWorkflows(owner, repo) {
        return this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`);
    }
    /**
     * Attempt to fetch CODEOWNERS from a given path.
     * Returns the decoded content or null via NotFoundError.
     */
    async getFileContent(owner, repo, path) {
        try {
            const content = await this.request('GET', `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path)}`);
            if (content.content && content.encoding === 'base64') {
                return Buffer.from(content.content, 'base64').toString('utf-8');
            }
            return content.content ?? null;
        }
        catch (err) {
            if (err instanceof NotFoundError)
                return null;
            throw err;
        }
    }
}
exports.GitHubClient = GitHubClient;
// ─── Mapping Helpers ─────────────────────────────────────────────────
/**
 * Maps GitHub's branch protection response into the simplified shape MD-101
 * consumes.
 */
function mapBranchProtection(bp, branch) {
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
function parseCodeowners(content) {
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(line => line.split(/\s+/)[0])
        .filter(path => path.startsWith('/') || path.startsWith('*'));
}
/** Standard CODEOWNERS locations (in order of precedence). */
const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'];
/**
 * Try standard CODEOWNERS locations; return coverage info.
 */
async function loadCodeownersCoverage(client, owner, repo) {
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
async function fetchLiveOrgState(config) {
    const client = new GitHubClient({
        token: config.githubToken,
        apiBaseUrl: config.apiBaseUrl,
    });
    const repos = await client.listOrgRepos(config.org, config.maxRepos);
    const states = [];
    const nowIso = new Date().toISOString();
    for (const repo of repos) {
        const owner = repo.owner.login;
        const name = repo.name;
        const fullName = repo.full_name;
        const defaultBranch = repo.default_branch ?? config.defaultBranch ?? 'main';
        // — Branch protection (best-effort) —
        let branchProtection = null;
        try {
            const bp = await client.getBranchProtection(owner, name, defaultBranch);
            branchProtection = mapBranchProtection(bp, defaultBranch);
        }
        catch (err) {
            if (err instanceof RateLimitError)
                throw err; // propagate rate-limit
            // NotFoundError or other: treat as "no protection"
        }
        // — Workflows (names / paths only) —
        let workflows = [];
        try {
            const wf = await client.listWorkflows(owner, name);
            workflows = wf.workflows.map(w => ({
                path: w.path,
                jobNames: [], // MD-101 only needs presence; MD-100 handles YAML analysis
            }));
        }
        catch {
            // treat as no workflows
        }
        // — CODEOWNERS —
        const codeowners = await loadCodeownersCoverage(client, owner, name);
        const state = {
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
/**
 * DynamoDB-backed governance cache.
 *
 * Table schema:
 *   PK = org (string)
 *   SK = repo fullName (string)
 *   Attributes: state (JSON string), scannedAt (ISO), expiresAt (TTL epoch)
 */
class DynamoDBGovernanceCache {
    tableName;
    ttlSeconds;
    dynamoClient;
    constructor(opts = {}) {
        this.tableName = opts.tableName
            ?? process.env.MD_GOVERNANCE_CACHE_TABLE
            ?? 'mirror-governance-cache';
        this.ttlSeconds = opts.ttlSeconds ?? 2 * 60 * 60; // 2 hours
        this.dynamoClient = opts.dynamoClient ?? createDefaultDynamoClient();
    }
    async persist(org, repos) {
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
    async load(org) {
        const items = await this.dynamoClient.query(this.tableName, org);
        if (!items || items.length === 0)
            return null;
        return items.map(item => JSON.parse(item.state));
    }
}
exports.DynamoDBGovernanceCache = DynamoDBGovernanceCache;
/**
 * Creates a real DynamoDB client. Lazily imports the AWS SDK so this module
 * can be loaded without `@aws-sdk/client-dynamodb` at test time.
 */
function createDefaultDynamoClient() {
    // Lazy — actual SDK usage deferred to runtime
    return {
        async batchWrite(tableName, items) {
            const { DynamoDBClient, BatchWriteItemCommand } = await import('@aws-sdk/client-dynamodb');
            const { marshall } = await import('@aws-sdk/util-dynamodb');
            const client = new DynamoDBClient({});
            const requestItems = items.map(item => ({
                PutRequest: { Item: marshall(item) },
            }));
            await client.send(new BatchWriteItemCommand({
                RequestItems: { [tableName]: requestItems },
            }));
        },
        async query(tableName, org) {
            const { DynamoDBClient, QueryCommand } = await import('@aws-sdk/client-dynamodb');
            const { marshall, unmarshall } = await import('@aws-sdk/util-dynamodb');
            const client = new DynamoDBClient({});
            const res = await client.send(new QueryCommand({
                TableName: tableName,
                KeyConditionExpression: '#org = :org',
                ExpressionAttributeNames: { '#org': 'org' },
                ExpressionAttributeValues: marshall({ ':org': org }),
            }));
            if (!res.Items || res.Items.length === 0)
                return null;
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
async function buildOrgContext(org, manifest, cache) {
    const adapter = cache ?? new DynamoDBGovernanceCache();
    const cached = await adapter.load(org);
    if (!cached || cached.length === 0) {
        throw new Error(`No cached governance state for org "${org}". Run the org scan job first.`);
    }
    return { manifest, repos: cached };
}
// ─── Utility ─────────────────────────────────────────────────────────
/** Split an array into chunks of at most `size` elements. */
function chunk(arr, size) {
    const result = [];
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
async function persistOrgState(org, repos, cache) {
    const adapter = cache ?? new DynamoDBGovernanceCache();
    await adapter.persist(org, repos);
}
/**
 * Standalone wrapper around DynamoDBGovernanceCache.load().
 */
async function loadCachedOrgState(org, cache) {
    const adapter = cache ?? new DynamoDBGovernanceCache();
    return adapter.load(org);
}
//# sourceMappingURL=org-aggregator.js.map