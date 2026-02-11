/**
 * org-scan — CLI command to scan GitHub org governance state
 *
 * Central tension: one codepath vs. "dev-only" shortcuts.
 * This command exercises the SAME aggregation/persistence path as the Lambda
 * handler. The --dry-run flag lets you print JSON without DynamoDB, but the
 * fetch logic is identical. Same `fetchLiveOrgState` + `persistOrgState` calls.
 *
 * This is a Pro feature — requires @phase-mirror/pro at runtime.
 *
 * Usage:
 *   oracle org-scan --org PhaseMirror --dry-run
 *   oracle org-scan --org PhaseMirror --max-repos 5
 *   oracle org-scan --org PhaseMirror
 */

import chalk from 'chalk';
import { logger } from '../utils/logger.js';

export interface OrgScanOptions {
  org: string;
  dryRun: boolean;
  maxRepos?: number;
}

export interface OrgScanResult {
  repos: number;
  durationMs: number;
  dryRun: boolean;
}

/**
 * Dynamically imports the Pro federation module.
 * Keeps the open-core CLI independent of proprietary code at compile time.
 */
async function loadProFederation() {
  try {
    const pro = await import('@phase-mirror/pro');
    return {
      fetchLiveOrgState: pro.fetchLiveOrgState,
      persistOrgState: pro.persistOrgState,
      RateLimitError: pro.RateLimitError,
    };
  } catch {
    throw new Error(
      'org-scan requires @phase-mirror/pro. ' +
      'Ensure the proprietary package is installed and built.',
    );
  }
}

export async function orgScanCommand(options: OrgScanOptions): Promise<OrgScanResult> {
  const { org, dryRun, maxRepos } = options;

  // ── Validate environment ──
  const githubToken = process.env.GITHUB_APP_TOKEN || process.env.GITHUB_PAT;
  if (!githubToken) {
    logger.error(
      chalk.red('Missing GITHUB_APP_TOKEN or GITHUB_PAT environment variable.'),
    );
    logger.info(
      chalk.dim('Set one of these to a GitHub token with read:org and repo scopes.'),
    );
    process.exit(1);
  }

  if (!dryRun) {
    const cacheTable = process.env.MD_GOVERNANCE_CACHE_TABLE;
    if (!cacheTable) {
      logger.error(
        chalk.red('Missing MD_GOVERNANCE_CACHE_TABLE environment variable.'),
      );
      logger.info(
        chalk.dim('Set this to the DynamoDB table name, or use --dry-run to print JSON.'),
      );
      process.exit(1);
    }
  }

  // ── Load Pro federation module ──
  const { fetchLiveOrgState, persistOrgState, RateLimitError } =
    await loadProFederation();

  // ── Run scan ──
  const start = Date.now();
  logger.info(
    chalk.cyan(`Scanning org "${org}"`) +
    chalk.dim(` dryRun=${dryRun} maxRepos=${maxRepos ?? '∞'}`),
  );

  try {
    const states = await fetchLiveOrgState({
      org,
      githubToken,
      defaultBranch: 'main',
      maxRepos,
    });

    if (dryRun) {
      // Print structured JSON to stdout for piping / inspection
      console.log(JSON.stringify(states, null, 2));
    } else {
      await persistOrgState(org, states);
    }

    const durationMs = Date.now() - start;

    if (!dryRun) {
      logger.info(
        chalk.green(`✓ org-scan completed`) +
        chalk.dim(` org="${org}" repos=${states.length} durationMs=${durationMs}`),
      );
    } else {
      logger.info(
        chalk.green(`✓ org-scan dry-run completed`) +
        chalk.dim(` org="${org}" repos=${states.length} durationMs=${durationMs}`),
      );
    }

    return { repos: states.length, durationMs, dryRun };
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as any).code === 'GITHUB_RATE_LIMITED') {
      const resetAt = (err as any).resetAt as Date;
      logger.error(
        chalk.red(`GitHub rate limit exceeded.`) +
        chalk.dim(` Resets at ${resetAt.toISOString()}`),
      );
    } else {
      logger.error(chalk.red(`org-scan failed: ${err instanceof Error ? err.message : String(err)}`));
    }
    throw err;
  }
}
