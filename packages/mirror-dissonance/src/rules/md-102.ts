/**
 * MD-102: Merge Queue Trust Chain Break (Per-Repo, OSS)
 *
 * Detects inconsistent branch protection and status check configuration
 * that allows bypassing the merge queue. Operates at a single-repo scope
 * using locally available data: the OracleInput context, branch protection
 * settings, and workflow job names.
 *
 * Central Tension: local fidelity vs. federated completeness. This OSS
 * rule catches per-repo trust-chain breaks (e.g., "admins can bypass," or
 * "required status checks reference non-existent jobs"). The full org-wide
 * analysis — "is the merge queue enabled for every critical repo?" — lives
 * in the proprietary MD-102-federated extension because it requires
 * RepoGovernanceState[] and OrgContext.
 *
 * Default outcome: warn (not block). MD-102 starts as warn-only until FP
 * behavior is measured via the standard Tier B promotion path.
 *
 * What this surfaces (per-repo):
 * - Admins can bypass merge queue protections when policy forbids it
 * - Required status checks reference job contexts that no workflow defines
 * - Direct pushes are allowed when the merge queue policy forbids them
 * - Linear history is not required when the policy mandates it
 * - No merge queue policy is declared but merge_group mode is in use
 *
 * @license Phase Mirror License v1.0
 */

import { RuleViolation, OracleInput } from '../schemas/types.js';
import type { MergeQueuePolicy } from '../policy/manifest.js';

// ─── Input Shape ─────────────────────────────────────────────────────

/**
 * Extended context fields that MD-102 looks for on OracleInput.context.
 * These are optional — MD-102 is silent when data is unavailable.
 */
export interface MD102Context {
  /** Branch protection configuration for the default branch */
  branchProtection?: {
    enabled?: boolean;
    allowAdminsBypass?: boolean;
    requirePullRequest?: boolean;
    requireLinearHistory?: boolean;
    allowDirectPushes?: boolean;
    requiredStatusChecks?: {
      contexts: string[];
      strict?: boolean;
    };
  };

  /** Workflow jobs discovered in .github/workflows/ */
  workflowJobs?: Array<{
    /** The context name this job emits (usually <workflow>/<job-key>) */
    contextName: string;
    /** The file this job lives in */
    filePath: string;
  }>;

  /** Per-repo merge queue policy (from .github/.phase-mirror/policy.json) */
  mergeQueuePolicy?: MergeQueuePolicy;
}

// ─── Rule Implementation ─────────────────────────────────────────────

export async function checkMD102(input: OracleInput): Promise<RuleViolation[]> {
  const violations: RuleViolation[] = [];

  // Pull extended context (best-effort; callers populate if available)
  const ctx = input.context as OracleInput['context'] & MD102Context;
  const policy = ctx.mergeQueuePolicy;
  const protection = ctx.branchProtection;

  // ── Guard: MD-102 is silent when no policy or no protection data ──
  if (!policy || !protection) {
    return violations;
  }

  // ── Check 1: Admins can bypass, but policy forbids it ──
  if (!policy.allowBypassForAdmins && protection.allowAdminsBypass) {
    violations.push({
      ruleId: 'MD-102',
      severity: 'high',
      message:
        'Admins can bypass merge queue protections, but the repo policy forbids admin bypass. ' +
        'This allows trusted insiders to circumvent the trust chain.',
      context: {
        check: 'admin-bypass',
        policyAllowBypass: false,
        actualAllowBypass: true,
      },
    });
  }

  // ── Check 2: Direct pushes allowed when policy forbids them ──
  if (!policy.allowDirectPushes && (protection.allowDirectPushes || !protection.requirePullRequest)) {
    violations.push({
      ruleId: 'MD-102',
      severity: 'high',
      message:
        'Direct pushes to the default branch are possible, but the merge queue policy forbids them. ' +
        'Changes can enter the branch without passing through the merge queue.',
      context: {
        check: 'direct-push',
        policyAllowDirectPushes: false,
        requirePullRequest: protection.requirePullRequest ?? false,
        allowDirectPushes: protection.allowDirectPushes ?? false,
      },
    });
  }

  // ── Check 3: Linear history not required when policy mandates it ──
  if (policy.requireLinearHistory && !protection.requireLinearHistory) {
    violations.push({
      ruleId: 'MD-102',
      severity: 'medium',
      message:
        'Linear history is not enforced on the default branch, but the merge queue policy requires it. ' +
        'Merge commits can obscure the trust chain provenance.',
      context: {
        check: 'linear-history',
        policyRequireLinear: true,
        actualRequireLinear: false,
      },
    });
  }

  // ── Check 4: Required status checks reference non-existent jobs ──
  if (ctx.workflowJobs && protection.requiredStatusChecks?.contexts) {
    const requiredContexts = new Set(protection.requiredStatusChecks.contexts);
    const stableJobs = new Set(ctx.workflowJobs.map(j => j.contextName));

    const missingContexts = [...requiredContexts].filter(c => !stableJobs.has(c));
    if (missingContexts.length > 0) {
      violations.push({
        ruleId: 'MD-102',
        severity: 'medium',
        message:
          `Required status checks [${missingContexts.join(', ')}] are not wired to any stable workflow job. ` +
          'These checks will never pass, stalling the merge queue — or if made non-required, silently bypassing protection.',
        context: {
          check: 'orphaned-status-checks',
          missingContexts,
          knownJobs: [...stableJobs],
        },
      });
    }
  }

  // ── Check 5: Merge queue required but no protection enabled ──
  if (policy.requiredForDefaultBranch && !protection.enabled) {
    violations.push({
      ruleId: 'MD-102',
      severity: 'high',
      message:
        'The merge queue policy requires branch protection on the default branch, but branch protection is not enabled. ' +
        'The merge queue cannot function without underlying branch protection.',
      context: {
        check: 'protection-disabled',
        policyRequiresMergeQueue: true,
        branchProtectionEnabled: false,
      },
    });
  }

  return violations;
}
