/**
 * Policy Manifest — OSS types for per-repo governance policy
 *
 * These types define the contract for governance policy knobs that
 * Tier A and Tier B rules consume. The proprietary layer extends
 * them into OrgPolicyManifest for org-wide federation.
 *
 * @license Phase Mirror License v1.0
 */

// ─── Merge Queue Policy ──────────────────────────────────────────────

/**
 * Per-repo merge queue governance expectations.
 * MD-102 compares actual branch protection / merge queue configuration
 * against this declared policy to detect trust-chain breaks.
 */
export interface MergeQueuePolicy {
  /** Whether the default branch requires a merge queue */
  requiredForDefaultBranch: boolean;

  /** Whether administrators are allowed to bypass merge queue protections */
  allowBypassForAdmins: boolean;

  /** Whether linear history (rebase / squash only) is required */
  requireLinearHistory: boolean;

  /** Whether direct pushes to the protected branch are allowed */
  allowDirectPushes: boolean;
}

// ─── Per-Repo Policy Manifest ────────────────────────────────────────

/**
 * A per-repo policy manifest that rules can consume to compare
 * declared intent vs actual configuration.
 *
 * Lives at `.github/.phase-mirror/policy.json` in each repo,
 * or is provided programmatically via the analysis context.
 */
export interface RepoPolicyManifest {
  /** Schema version for forward compatibility */
  schemaVersion: '1.0.0';

  /** Merge queue policy expectations (consumed by MD-102) */
  mergeQueue?: MergeQueuePolicy;
}
