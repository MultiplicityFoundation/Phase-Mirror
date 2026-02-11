/**
 * Org-Scan Lambda / CLI entrypoint
 *
 * Central tension: single control plane vs. minimizing moving parts.
 * This handler can run as an AWS Lambda on EventBridge schedule (operationally
 * simpler, close to DynamoDB) or as a CLI script invoked from GitHub Actions
 * (no Lambda infra needed, but requires OIDC to write DynamoDB).
 *
 * Responsibilities:
 *   1. For each configured org, fetch live governance state via GitHub REST API
 *   2. Persist RepoGovernanceState[] into DynamoDB with scannedAt + TTL
 *   3. Emit structured operational logs (repos scanned, duration, failures)
 *
 * Environment variables:
 *   MD_ORGS                   — comma-separated GitHub org logins
 *   GITHUB_APP_TOKEN          — GitHub App installation token (preferred)
 *   GITHUB_PAT                — GitHub PAT fallback (read:org, repo)
 *   MD_GOVERNANCE_CACHE_TABLE — DynamoDB table name (default: mirror-governance-cache)
 *
 * @license Phase Mirror Pro License v1.0
 */

import {
  fetchLiveOrgState,
  persistOrgState,
  RateLimitError,
} from '@phase-mirror/pro';
import type {
  OrgAggregatorConfig,
  GovernanceCacheAdapter,
} from '@phase-mirror/pro';

// ─── Types ───────────────────────────────────────────────────────────

export interface OrgScanEvent {
  /** Override list of orgs to scan (takes precedence over MD_ORGS env) */
  orgs?: string[];
}

export interface OrgScanResult {
  orgsScanned: number;
  totalRepos: number;
  failures: string[];
  durationMs: number;
}

interface OrgScanDeps {
  /** Override the cache adapter (for testing) */
  cache?: GovernanceCacheAdapter;
  /** Override the GitHub token (for testing) */
  githubToken?: string;
  /** Override the org list (for testing) */
  orgs?: string[];
}

// ─── Core logic (testable, injectable) ───────────────────────────────

const DEFAULT_ORGS = (): string[] =>
  (process.env.MD_ORGS ?? '').split(',').filter(Boolean);

function resolveGitHubToken(deps?: OrgScanDeps): string {
  const token =
    deps?.githubToken ??
    process.env.GITHUB_APP_TOKEN ??
    process.env.GITHUB_PAT ??
    '';
  if (!token) {
    throw new Error(
      'Missing GITHUB_APP_TOKEN or GITHUB_PAT env for GitHub API access.',
    );
  }
  return token;
}

/**
 * Run the org-scan. Extracted from `handler` so it can be called from
 * tests and CLI without Lambda plumbing.
 */
export async function runOrgScan(
  event: OrgScanEvent = {},
  deps: OrgScanDeps = {},
): Promise<OrgScanResult> {
  const orgs =
    (event.orgs && event.orgs.length > 0 ? event.orgs : null) ??
    deps.orgs ??
    DEFAULT_ORGS();

  if (orgs.length === 0) {
    console.warn('[org-scan] No orgs configured. Set MD_ORGS env or pass event.orgs.');
    return { orgsScanned: 0, totalRepos: 0, failures: [], durationMs: 0 };
  }

  const githubToken = resolveGitHubToken(deps);
  const cache: GovernanceCacheAdapter | undefined = deps.cache;

  const start = Date.now();
  const failures: string[] = [];
  let totalRepos = 0;
  let orgsScanned = 0;

  console.log(`[org-scan] Starting scan for orgs: ${orgs.join(', ')}`);

  for (const org of orgs) {
    const orgStart = Date.now();
    try {
      const config: OrgAggregatorConfig = {
        org,
        githubToken,
        defaultBranch: 'main',
      };

      const states = await fetchLiveOrgState(config);
      await persistOrgState(org, states, cache);

      totalRepos += states.length;
      orgsScanned++;

      console.log(
        `[org-scan] Org "${org}" scanned: repos=${states.length}, durationMs=${Date.now() - orgStart}`,
      );
    } catch (err) {
      const message =
        err instanceof RateLimitError
          ? `Rate limited until ${err.resetAt.toISOString()}`
          : err instanceof Error
            ? err.message
            : String(err);

      failures.push(`${org}: ${message}`);
      console.error(`[org-scan] Org "${org}" scan failed: ${message}`);
      // Continue with remaining orgs — partial success is better than full failure
    }
  }

  const durationMs = Date.now() - start;
  console.log(
    `[org-scan] Completed: orgs=${orgsScanned}/${orgs.length}, repos=${totalRepos}, failures=${failures.length}, durationMs=${durationMs}`,
  );

  return { orgsScanned, totalRepos, failures, durationMs };
}

// ─── Lambda handler ──────────────────────────────────────────────────

/**
 * AWS Lambda entry point. Invoked by EventBridge on a schedule.
 */
export const handler = async (event: OrgScanEvent = {}): Promise<OrgScanResult> => {
  return runOrgScan(event);
};

// ─── CLI entry point ─────────────────────────────────────────────────

/**
 * When run directly (e.g. `node index.js` or `ts-node index.ts`),
 * execute the scan and exit with appropriate code.
 */
const isCLI =
  typeof require !== 'undefined' &&
  require.main === module;

if (isCLI) {
  runOrgScan()
    .then(result => {
      if (result.failures.length > 0) {
        console.error(
          `[org-scan] Exiting with failures: ${result.failures.join('; ')}`,
        );
        process.exit(1);
      }
      process.exit(0);
    })
    .catch(err => {
      console.error('[org-scan] Fatal error:', err);
      process.exit(2);
    });
}
