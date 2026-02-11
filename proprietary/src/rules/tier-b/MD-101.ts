/**
 * MD-101: Cross-Repo Protection Gap
 *
 * Detects protection asymmetry across repositories in the same organization:
 * repos that should share governance policies but don't. This is the first
 * rule that requires cross-repo context — making it inherently a Pro feature.
 *
 * Central Tension: Coverage completeness vs. organizational autonomy. Not every
 * repo in an org should have identical protection. A docs repo doesn't need the
 * same CI gates as the payment service. MD-101 must distinguish intentional
 * policy variation from accidental protection gaps — otherwise it becomes noise
 * that teams ignore.
 *
 * What this surfaces:
 * - Repos that match a policy classification but lack expected branch protection
 * - Required status checks (e.g., oracle-check) present in some repos but not others
 * - Required workflow files missing from repos that should have them
 * - Permission drift (write-default where read-default is expected)
 * - CODEOWNERS gaps for critical paths
 *
 * @license Phase Mirror Pro License v1.0
 */

import type {
  RuleDefinition,
  Finding,
  AnalysisContext,
} from '../types.js';
import { requirePro } from '../../license-gate.js';
import type {
  OrgPolicyManifest,
  RepoGovernanceState,
  PolicyExpectation,
  PolicyExemption,
  BranchProtectionRequirement,
  StatusCheckRequirement,
  WorkflowRequirement,
  PermissionRequirement,
  CodeownersRequirement,
} from './policy-manifest.js';
import {
  resolveExpectationsForRepo,
  validateManifest,
  matchGlob,
} from './policy-manifest.js';

// ─── Extended Context for Cross-Repo Analysis ────────────────────────

/**
 * MD-101 requires an organization-scoped context with:
 * - A policy manifest declaring what governance should look like
 * - Observed governance state for each repo in scope
 */
export interface CrossRepoContext extends AnalysisContext {
  policyManifest?: OrgPolicyManifest;
  repoStates?: RepoGovernanceState[];
}

// ─── Gap Detection ───────────────────────────────────────────────────

export interface ProtectionGap {
  repo: string;
  expectation: PolicyExpectation;
  gapType: 'missing' | 'partial' | 'misconfigured';
  detail: string;
}

/**
 * Check a single repo's governance state against its resolved expectations.
 */
export function detectGapsForRepo(
  repoName: string,
  state: RepoGovernanceState,
  expectations: PolicyExpectation[],
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];

  for (const expectation of expectations) {
    const req = expectation.requirement;

    switch (req.type) {
      case 'branch-protection':
        gaps.push(...checkBranchProtection(repoName, state, expectation, req));
        break;
      case 'status-checks':
        gaps.push(...checkStatusChecks(repoName, state, expectation, req));
        break;
      case 'workflow-presence':
        gaps.push(...checkWorkflowPresence(repoName, state, expectation, req));
        break;
      case 'permissions':
        gaps.push(...checkPermissions(repoName, state, expectation, req));
        break;
      case 'codeowners':
        gaps.push(...checkCodeowners(repoName, state, expectation, req));
        break;
    }
  }

  return gaps;
}

function checkBranchProtection(
  repo: string,
  state: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: BranchProtectionRequirement,
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];
  const protection = state.branchProtection?.find(bp => bp.branch === req.branch);

  if (!protection) {
    gaps.push({
      repo,
      expectation,
      gapType: 'missing',
      detail: `No branch protection configured for "${req.branch}"`,
    });
    return gaps;
  }

  if (req.requirePullRequest && !protection.requirePullRequest) {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Branch "${req.branch}" does not require pull requests`,
    });
  }

  if (req.requiredReviewers !== undefined && protection.requiredReviewers < req.requiredReviewers) {
    gaps.push({
      repo,
      expectation,
      gapType: 'partial',
      detail: `Branch "${req.branch}" requires ${protection.requiredReviewers} reviewers, policy requires ${req.requiredReviewers}`,
    });
  }

  if (req.dismissStaleReviews && !protection.dismissStaleReviews) {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Branch "${req.branch}" does not dismiss stale reviews`,
    });
  }

  if (req.requireCodeOwnerReviews && !protection.requireCodeOwnerReviews) {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Branch "${req.branch}" does not require code owner reviews`,
    });
  }

  if (req.enforceAdmins && !protection.enforceAdmins) {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Branch "${req.branch}" does not enforce rules for admins`,
    });
  }

  return gaps;
}

function checkStatusChecks(
  repo: string,
  state: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: StatusCheckRequirement,
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];
  const protection = state.branchProtection?.find(bp => bp.branch === req.branch);

  if (!protection) {
    gaps.push({
      repo,
      expectation,
      gapType: 'missing',
      detail: `No branch protection on "${req.branch}" — cannot enforce status checks`,
    });
    return gaps;
  }

  const configuredChecks = new Set(protection.requiredStatusChecks);
  const missingChecks = req.requiredChecks.filter(c => !configuredChecks.has(c));

  if (missingChecks.length === req.requiredChecks.length) {
    gaps.push({
      repo,
      expectation,
      gapType: 'missing',
      detail: `None of the required status checks are configured: [${missingChecks.join(', ')}]`,
    });
  } else if (missingChecks.length > 0) {
    gaps.push({
      repo,
      expectation,
      gapType: 'partial',
      detail: `Missing status checks: [${missingChecks.join(', ')}]. Present: [${req.requiredChecks.filter(c => configuredChecks.has(c)).join(', ')}]`,
    });
  }

  if (req.requireStrictStatusChecks && !protection.strictStatusChecks) {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Branch "${req.branch}" does not require branches to be up-to-date before merging`,
    });
  }

  return gaps;
}

function checkWorkflowPresence(
  repo: string,
  state: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: WorkflowRequirement,
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];
  const files = state.workflowFiles ?? [];

  // Check for exact file match
  if (req.workflowFile && !files.includes(req.workflowFile)) {
    // Also check by pattern if provided
    if (req.workflowPattern) {
      const hasMatch = files.some(f => matchGlob(req.workflowPattern!, f));
      if (!hasMatch) {
        gaps.push({
          repo,
          expectation,
          gapType: 'missing',
          detail: `Required workflow file "${req.workflowFile}" (or pattern "${req.workflowPattern}") not found`,
        });
      }
    } else {
      gaps.push({
        repo,
        expectation,
        gapType: 'missing',
        detail: `Required workflow file "${req.workflowFile}" not found`,
      });
    }
  }

  // Note: requiredJobs checking would need workflow content parsing.
  // For now, we only check file presence. Job-level checks are a future
  // extension that can reuse the parseWorkflowJobs utility from MD-100.

  return gaps;
}

function checkPermissions(
  repo: string,
  state: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: PermissionRequirement,
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];

  if (!state.defaultPermissions) {
    // If we can't determine permissions, flag as partial gap
    gaps.push({
      repo,
      expectation,
      gapType: 'partial',
      detail: `Unable to determine default workflow permissions for "${repo}"`,
    });
    return gaps;
  }

  if (req.maxDefaultPermissions === 'read' && state.defaultPermissions === 'write') {
    gaps.push({
      repo,
      expectation,
      gapType: 'misconfigured',
      detail: `Default workflow permissions are "write", policy requires "read"`,
    });
  }

  return gaps;
}

function checkCodeowners(
  repo: string,
  state: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: CodeownersRequirement,
): ProtectionGap[] {
  const gaps: ProtectionGap[] = [];
  const covered = state.codeownersPaths ?? [];

  const missingPaths = req.requiredPaths.filter(reqPath =>
    !covered.some(covPath => covPath.startsWith(reqPath) || reqPath.startsWith(covPath)),
  );

  if (missingPaths.length > 0) {
    gaps.push({
      repo,
      expectation,
      gapType: missingPaths.length === req.requiredPaths.length ? 'missing' : 'partial',
      detail: `CODEOWNERS missing coverage for: [${missingPaths.join(', ')}]`,
    });
  }

  return gaps;
}

// ─── Severity Mapping ────────────────────────────────────────────────

function manifestSeverityToFindingSeverity(
  manifestSeverity: 'critical' | 'high' | 'medium' | 'low',
  gapType: 'missing' | 'partial' | 'misconfigured',
): 'block' | 'high' | 'warn' {
  // Missing gaps are always as severe as the expectation declares
  if (gapType === 'missing') {
    switch (manifestSeverity) {
      case 'critical': return 'block';
      case 'high': return 'high';
      default: return 'warn';
    }
  }
  // Partial/misconfigured gaps are one step lower
  switch (manifestSeverity) {
    case 'critical': return 'high';
    case 'high': return 'warn';
    default: return 'warn';
  }
}

// ─── Rule Definition ─────────────────────────────────────────────────

export const rule: RuleDefinition = {
  id: 'MD-101',
  name: 'Cross-Repo Protection Gap',
  description:
    'Detects protection asymmetry across repositories in the same organization. ' +
    'Repos that should share governance policies but don\'t create invisible attack ' +
    'surfaces — a PR in an unprotected repo can introduce changes that would fail ' +
    'governance in protected repos, but passes silently because no oracle runs there. ' +
    'This rule challenges the assumption that per-repo configuration is sufficient ' +
    'for organization-level governance.',
  version: '1.0.0',
  tier: 'B',
  severity: 'warn',
  category: 'governance',
  fpTolerance: { ceiling: 0.08, window: 200 },
  promotionCriteria: {
    minWindowN: 200,
    maxObservedFPR: 0.04,
    minRedTeamCases: 5,
    minDaysInWarn: 21,
    requiredApprovers: ['steward'],
  },
  adrReferences: ['ADR-003: CI/CD Pipeline Governance', 'ADR-007: Cross-Org Policy Federation'],

  evaluate: async (context: AnalysisContext): Promise<Finding[]> => {
    requirePro(context, 'MD-101: Cross-Repo Protection Gap');

    const findings: Finding[] = [];
    const ctx = context as CrossRepoContext;

    // ── Guard: need both manifest and repo states ──
    if (!ctx.policyManifest || !ctx.repoStates || ctx.repoStates.length === 0) {
      return findings;
    }

    // ── Validate manifest ──
    const validation = validateManifest(ctx.policyManifest);
    if (!validation.valid) {
      findings.push({
        id: 'MD-101-manifest-invalid',
        ruleId: 'MD-101',
        ruleName: 'Cross-Repo Protection Gap — Invalid Manifest',
        severity: 'high',
        title: 'Policy manifest is invalid',
        description:
          `The organization policy manifest has ${validation.errors.length} error(s): ` +
          validation.errors.join('; ') +
          (validation.warnings.length > 0
            ? `. Warnings: ${validation.warnings.join('; ')}`
            : ''),
        evidence: [{
          path: '.github/.phase-mirror/policy-manifest.json',
          line: 0,
          context: {
            errors: validation.errors,
            warnings: validation.warnings,
          },
        }],
        remediation:
          'Fix the errors in the policy manifest before cross-repo governance ' +
          'analysis can proceed. Each expectation needs a unique ID, each exemption ' +
          'needs a reason and expiration date.',
        adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
      });
      // Continue analysis even with warnings — only bail on errors
      if (!validation.valid) return findings;
    }

    // ── Scan each repo against resolved expectations ──
    for (const repoState of ctx.repoStates) {
      const repoMeta = {
        topics: repoState.topics,
        language: repoState.language,
        visibility: repoState.visibility,
        archived: repoState.archived,
      };

      // Skip archived repos — they're frozen, no governance risk
      if (repoState.archived) continue;

      const { expectations, exemptions } = resolveExpectationsForRepo(
        ctx.policyManifest,
        repoState.name,
        repoMeta,
      );

      // Skip repos with no applicable expectations
      if (expectations.length === 0) continue;

      const gaps = detectGapsForRepo(repoState.name, repoState, expectations);

      for (const gap of gaps) {
        findings.push({
          id: `MD-101-${repoState.name}-${gap.expectation.id}-${gap.gapType}`,
          ruleId: 'MD-101',
          ruleName: 'Cross-Repo Protection Gap',
          severity: manifestSeverityToFindingSeverity(gap.expectation.severity, gap.gapType),
          title: `Repo "${repoState.name}" — ${gap.gapType} ${gap.expectation.category}: ${gap.expectation.name}`,
          description:
            `${gap.detail}. ` +
            `This expectation ("${gap.expectation.name}") applies to "${repoState.name}" ` +
            `based on the organization policy manifest. ` +
            `Other repos in the same org that match the same classification DO enforce this policy — ` +
            `"${repoState.name}" does not, creating a governance gap.`,
          evidence: [{
            path: '.github/.phase-mirror/policy-manifest.json',
            line: 0,
            context: {
              repo: repoState.name,
              expectationId: gap.expectation.id,
              expectationName: gap.expectation.name,
              category: gap.expectation.category,
              gapType: gap.gapType,
              detail: gap.detail,
              activeExemptions: exemptions.map(e => ({
                expectationIds: e.expectationIds,
                reason: e.reason,
                expiresAt: e.expiresAt,
              })),
            },
          }],
          remediation:
            gap.gapType === 'missing'
              ? `Add the required ${gap.expectation.category} configuration to "${repoState.name}". ` +
                `If this repo intentionally skips this requirement, add an exemption to the ` +
                `policy manifest with a reason and expiration date.`
              : gap.gapType === 'partial'
              ? `The ${gap.expectation.category} configuration in "${repoState.name}" is incomplete. ` +
                `${gap.detail}. Update the configuration to match the organization policy.`
              : `The ${gap.expectation.category} configuration in "${repoState.name}" is misconfigured. ` +
                `${gap.detail}. Correct the configuration to match the organization policy.`,
          adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
        });
      }
    }

    return findings;
  },
};

export default rule;
