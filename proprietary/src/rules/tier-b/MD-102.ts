/**
 * MD-102: Merge Queue Trust Chain Break (Proprietary, Per-Repo)
 *
 * Tier B semantic rule that detects when branch protection and merge queue
 * configuration allows bypassing the intended trust chain. This is the
 * Pro version of the OSS MD-102 — it uses the full RuleDefinition contract,
 * structured evidence (FindingEvidence[]), FP tolerance, promotion criteria,
 * and the license gate.
 *
 * Central Tension: safety vs. enforcement. MD-102 starts as warn-only.
 * All findings — even critical severity for federated checks — pass through
 * the FP/demotion machinery. No auto-block until the rule has completed
 * its promotion window (200 evaluations, <2% observed FPR, 14 days, steward
 * approval).
 *
 * Per-repo scope: Analyzes one repository's branch protection + workflow
 * configuration against its declared policy manifest. For org-wide analysis,
 * see MD-102-federated.ts.
 *
 * @license Phase Mirror Pro License v1.0
 */

import type {
  RuleDefinition,
  Finding,
  AnalysisContext,
} from '../types.js';
import { requirePro } from '../../license-gate.js';

// ─── Rule Definition ─────────────────────────────────────────────────

export const rule: RuleDefinition = {
  id: 'MD-102',
  name: 'Merge Queue Trust Chain Break',
  description:
    'Detects inconsistent branch protection and status check configuration ' +
    'that allows bypassing the merge queue. When a merge queue is declared as ' +
    'required by the policy manifest but the actual branch protection allows ' +
    'admin bypass, direct pushes, or references non-existent status checks, ' +
    'the trust chain is breakable — PRs can reach the default branch without ' +
    'passing through the intended governance gates.',
  version: '1.0.0',
  tier: 'B',
  severity: 'warn',
  category: 'governance',
  fpTolerance: { ceiling: 0.02, window: 200 },
  promotionCriteria: {
    minWindowN: 200,
    maxObservedFPR: 0.02,
    minRedTeamCases: 3,
    minDaysInWarn: 14,
    requiredApprovers: ['steward'],
  },
  adrReferences: ['ADR-003: CI/CD Pipeline Governance'],

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    requirePro(context, 'MD-102: Merge Queue Trust Chain Break');

    const findings: Finding[] = [];

    // Extract extended context fields
    const branchProtection = (context as Record<string, unknown>).branchProtection as
      | BranchProtectionInput
      | undefined;
    const workflowJobs = (context as Record<string, unknown>).workflowJobs as
      | WorkflowJobInput[]
      | undefined;
    const mergeQueuePolicy = (context as Record<string, unknown>).mergeQueuePolicy as
      | MergeQueuePolicyInput
      | undefined;

    // ── Guard: need both policy and protection data ──
    if (!mergeQueuePolicy) {
      return findings; // Silent when no policy declared
    }

    if (!branchProtection) {
      if (mergeQueuePolicy.requiredForDefaultBranch) {
        findings.push({
          id: 'MD-102-no-branch-protection',
          ruleId: 'MD-102',
          ruleName: 'Merge Queue Trust Chain Break',
          severity: 'high',
          title: 'Merge queue policy requires branch protection, but none is configured',
          description:
            'The merge queue policy declares that branch protection is required for the ' +
            'default branch, but no branch protection data is available. The merge queue ' +
            'cannot function without underlying branch protection.',
          evidence: [{
            path: '.github/.phase-mirror/policy.json',
            line: 0,
            context: {
              check: 'protection-missing',
              policyRequiresMergeQueue: true,
            },
          }],
          remediation:
            'Enable branch protection on the default branch and configure the merge queue, ' +
            'or remove the mergeQueue policy from the policy manifest.',
          adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
        });
      }
      return findings;
    }

    // ── Check 1: Admins can bypass, but policy forbids it ──
    if (!mergeQueuePolicy.allowBypassForAdmins && branchProtection.allowAdminsBypass) {
      findings.push({
        id: `MD-102-admin-bypass-${context.repo?.name ?? 'unknown'}`,
        ruleId: 'MD-102',
        ruleName: 'Merge Queue Trust Chain Break',
        severity: 'high',
        title: 'Admins can bypass merge queue protections',
        description:
          'The branch protection allows administrators to bypass all protection rules, ' +
          'but the merge queue policy explicitly forbids admin bypass. This allows trusted ' +
          'insiders to circumvent the trust chain — changes can reach the default branch ' +
          'without passing through required checks or the merge queue.',
        evidence: [{
          path: '.github/branch-protection',
          line: 0,
          context: {
            check: 'admin-bypass',
            policyAllowBypass: false,
            actualAllowBypass: true,
          },
        }],
        remediation:
          'Disable "Allow administrators to bypass branch protection rules" for the default branch, ' +
          'or update the merge queue policy to explicitly allow admin bypass.',
        adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
      });
    }

    // ── Check 2: Direct pushes allowed when policy forbids them ──
    if (!mergeQueuePolicy.allowDirectPushes &&
        (branchProtection.allowDirectPushes || !branchProtection.requirePullRequest)) {
      findings.push({
        id: `MD-102-direct-push-${context.repo?.name ?? 'unknown'}`,
        ruleId: 'MD-102',
        ruleName: 'Merge Queue Trust Chain Break',
        severity: 'high',
        title: 'Direct pushes to default branch bypass merge queue',
        description:
          'Direct pushes to the default branch are possible (either explicitly allowed ' +
          'or pull requests are not required), but the merge queue policy forbids direct pushes. ' +
          'Changes can enter the branch without merge queue validation.',
        evidence: [{
          path: '.github/branch-protection',
          line: 0,
          context: {
            check: 'direct-push',
            policyAllowDirectPushes: false,
            requirePullRequest: branchProtection.requirePullRequest ?? false,
            allowDirectPushes: branchProtection.allowDirectPushes ?? false,
          },
        }],
        remediation:
          'Enable "Require a pull request before merging" and disable "Allow direct pushes" ' +
          'in branch protection settings for the default branch.',
        adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
      });
    }

    // ── Check 3: Linear history not required when policy mandates it ──
    if (mergeQueuePolicy.requireLinearHistory && !branchProtection.requireLinearHistory) {
      findings.push({
        id: `MD-102-linear-history-${context.repo?.name ?? 'unknown'}`,
        ruleId: 'MD-102',
        ruleName: 'Merge Queue Trust Chain Break',
        severity: 'medium',
        title: 'Linear history not enforced on default branch',
        description:
          'The merge queue policy requires linear history (rebase or squash merges only), ' +
          'but branch protection does not enforce it. Merge commits can obscure the trust ' +
          'chain provenance and make audit trails harder to follow.',
        evidence: [{
          path: '.github/branch-protection',
          line: 0,
          context: {
            check: 'linear-history',
            policyRequireLinear: true,
            actualRequireLinear: false,
          },
        }],
        remediation:
          'Enable "Require linear history" in branch protection settings, or relax the ' +
          'merge queue policy to not require linear history.',
        adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
      });
    }

    // ── Check 4: Required status checks reference non-existent jobs ──
    if (workflowJobs && branchProtection.requiredStatusChecks) {
      const requiredContexts = new Set(branchProtection.requiredStatusChecks);
      const stableJobs = new Set(workflowJobs.map(j => j.contextName));

      const missingContexts = [...requiredContexts].filter(c => !stableJobs.has(c));
      if (missingContexts.length > 0) {
        findings.push({
          id: `MD-102-orphaned-checks-${context.repo?.name ?? 'unknown'}`,
          ruleId: 'MD-102',
          ruleName: 'Merge Queue Trust Chain Break',
          severity: 'medium',
          title: 'Required status checks are not wired to stable jobs',
          description:
            `Required status checks [${missingContexts.join(', ')}] are not produced by ` +
            'any known workflow job. These checks will either block the merge queue indefinitely ' +
            '(if truly required) or create false safety if configured as non-blocking.',
          evidence: [{
            path: '.github/workflows',
            line: 0,
            context: {
              check: 'orphaned-status-checks',
              missingContexts,
              knownJobs: [...stableJobs],
            },
          }],
          remediation:
            'Align branch protection required checks to job contexts that exist in .github/workflows/, ' +
            'or update workflows to emit the expected status check contexts.',
          adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
        });
      }
    }

    return findings;
  },
};

export default rule;

// ─── Input Types (per-repo context extensions) ────────────────────────

interface BranchProtectionInput {
  enabled?: boolean;
  allowAdminsBypass?: boolean;
  requirePullRequest?: boolean;
  requireLinearHistory?: boolean;
  allowDirectPushes?: boolean;
  requiredStatusChecks?: string[];
}

interface WorkflowJobInput {
  contextName: string;
  filePath: string;
}

interface MergeQueuePolicyInput {
  requiredForDefaultBranch: boolean;
  allowBypassForAdmins: boolean;
  requireLinearHistory: boolean;
  allowDirectPushes: boolean;
}
