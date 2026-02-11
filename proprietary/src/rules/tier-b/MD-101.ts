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
 * - Expired exemptions that need review
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
  PolicyExpectation,
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

// ─── Cross-Repo Types ────────────────────────────────────────────────

export interface BranchProtectionState {
  branch: string;
  enabled: boolean;
  requirePullRequest: boolean;
  requiredReviewers: number;
  dismissStaleReviews: boolean;
  requireCodeOwnerReviews: boolean;
  enforceAdmins: boolean;
  requiredStatusChecks: string[];
  requireStrictStatusChecks: boolean;
}

export interface WorkflowEntry {
  path: string;
  jobNames: string[];
}

export interface CodeownersState {
  exists: boolean;
  coveredPaths: string[];
}

export interface RepoGovernanceState {
  fullName: string;
  meta: {
    topics: string[];
    language: string;
    visibility: 'public' | 'private' | 'internal';
    archived: boolean;
    defaultBranch: string;
    /** Governance tags (e.g., 'critical', 'pci', 'internal-only'). Used by MD-102 federation. */
    tags?: string[];
  };
  branchProtection: BranchProtectionState | null;
  workflows: WorkflowEntry[];
  defaultPermissions: 'read' | 'write';
  codeowners: CodeownersState;
  scannedAt: string;
  /** Merge queue configuration. Used by MD-102 federation. */
  mergeQueue?: {
    enabled: boolean;
    method?: 'merge' | 'squash' | 'rebase';
  };
}

export interface OrgContext {
  manifest: OrgPolicyManifest;
  repos: RepoGovernanceState[];
}

// ─── Gap Detection ───────────────────────────────────────────────────

function repoShortName(fullName: string): string {
  return fullName.includes('/') ? fullName.split('/')[1]! : fullName;
}

function makeGapFinding(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  detail: string,
): Finding {
  const fullName = repo.fullName;
  return {
    id: `MD-101-${fullName}-${expectation.id}`,
    ruleId: 'MD-101',
    ruleName: 'Cross-Repo Protection Gap',
    severity: expectation.severity,
    title: `"${fullName}" — ${expectation.name}: ${detail}`,
    description:
      `${detail}. ` +
      `This expectation ("${expectation.name}") applies to "${fullName}" ` +
      `based on the organization policy manifest. ` +
      `Other repos in the same org that match the same classification DO enforce this policy — ` +
      `"${fullName}" does not, creating a governance gap. ` +
      `(Data as of ${repo.scannedAt} — if recently fixed, wait for next org scan.)`,
    evidence: [{
      path: '.github/.phase-mirror/policy-manifest.json',
      line: 0,
      context: {
        repo: fullName,
        expectationId: expectation.id,
        expectationName: expectation.name,
        category: expectation.category,
        scannedAt: repo.scannedAt,
      },
    }],
    remediation:
      `Add the required ${expectation.category} configuration to "${fullName}". ` +
      `If this repo intentionally skips this requirement, add an exemption to the ` +
      `policy manifest with a reason and expiration date.`,
    adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
  };
}

function checkBranchProtection(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: BranchProtectionRequirement,
): Finding[] {
  if (!repo.branchProtection) {
    return [makeGapFinding(repo, expectation, 'not configured')];
  }

  const issues: string[] = [];

  if (req.requirePullRequest && !repo.branchProtection.requirePullRequest) {
    issues.push('pull requests not required');
  }
  if (req.requiredReviewers !== undefined &&
      repo.branchProtection.requiredReviewers < req.requiredReviewers) {
    issues.push(
      `${repo.branchProtection.requiredReviewers} reviewers, need ${req.requiredReviewers}`,
    );
  }
  if (req.dismissStaleReviews && !repo.branchProtection.dismissStaleReviews) {
    issues.push('stale review dismissal disabled');
  }
  if (req.requireCodeOwnerReviews && !repo.branchProtection.requireCodeOwnerReviews) {
    issues.push('code owner review not required');
  }
  if (req.enforceAdmins && !repo.branchProtection.enforceAdmins) {
    issues.push('admin enforcement disabled');
  }

  if (issues.length > 0) {
    return [makeGapFinding(repo, expectation, issues.join('; '))];
  }
  return [];
}

function checkStatusChecks(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: StatusCheckRequirement,
): Finding[] {
  if (!repo.branchProtection) {
    return [makeGapFinding(
      repo,
      expectation,
      `no branch protection — cannot enforce status checks`,
    )];
  }

  const configured = new Set(repo.branchProtection.requiredStatusChecks);
  const missing = req.requiredChecks.filter(c => !configured.has(c));

  if (missing.length > 0) {
    return [makeGapFinding(
      repo,
      expectation,
      `missing ${missing.join(', ')}`,
    )];
  }

  if (req.requireStrictStatusChecks && !repo.branchProtection.requireStrictStatusChecks) {
    return [makeGapFinding(
      repo,
      expectation,
      'strict status checks not required',
    )];
  }

  return [];
}

function checkWorkflowPresence(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: WorkflowRequirement,
): Finding[] {
  let match = repo.workflows.find(w => w.path === req.workflowFile);

  if (!match && req.workflowPattern) {
    match = repo.workflows.find(w => matchGlob(req.workflowPattern!, w.path));
  }

  if (!match) {
    return [makeGapFinding(repo, expectation, 'workflow not found')];
  }

  // Check required jobs if specified
  if (req.requiredJobs && req.requiredJobs.length > 0) {
    const missingJobs = req.requiredJobs.filter(j => !match!.jobNames.includes(j));
    if (missingJobs.length > 0) {
      return [makeGapFinding(
        repo,
        expectation,
        `missing required jobs: ${missingJobs.join(', ')}`,
      )];
    }
  }

  return [];
}

function checkPermissions(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: PermissionRequirement,
): Finding[] {
  if (req.maxDefaultPermissions === 'read' && repo.defaultPermissions === 'write') {
    return [makeGapFinding(
      repo,
      expectation,
      'default permissions are "write", policy requires "read"',
    )];
  }
  return [];
}

function checkCodeowners(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
  req: CodeownersRequirement,
): Finding[] {
  const covered = repo.codeowners.coveredPaths;

  const missingPaths = req.requiredPaths.filter(reqPath =>
    !covered.some(covPath => covPath.startsWith(reqPath) || reqPath.startsWith(covPath)),
  );

  if (missingPaths.length > 0) {
    return [makeGapFinding(
      repo,
      expectation,
      `CODEOWNERS missing coverage for ${missingPaths.join(', ')}`,
    )];
  }
  return [];
}

function checkExpectation(
  repo: RepoGovernanceState,
  expectation: PolicyExpectation,
): Finding[] {
  const req = expectation.requirement;
  switch (req.type) {
    case 'branch-protection':
      return checkBranchProtection(repo, expectation, req);
    case 'status-checks':
      return checkStatusChecks(repo, expectation, req);
    case 'workflow-presence':
      return checkWorkflowPresence(repo, expectation, req);
    case 'permissions':
      return checkPermissions(repo, expectation, req);
    case 'codeowners':
      return checkCodeowners(repo, expectation, req);
    default:
      return [];
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
    const orgContext = (context as Record<string, unknown>).orgContext as OrgContext | undefined;

    // ── Guard: need org context ──
    if (!orgContext) {
      findings.push({
        id: 'MD-101-no-context',
        ruleId: 'MD-101',
        ruleName: 'Cross-Repo Protection Gap',
        severity: 'low',
        title: 'MD-101 requires organization context for cross-repo analysis',
        description:
          'Cross-repo protection gap analysis requires an OrgContext with a policy ' +
          'manifest and repo governance states. Run this rule via an organization-scoped ' +
          'scan or provide orgContext in the analysis context.',
        evidence: [{
          path: '.github/.phase-mirror/policy-manifest.json',
          line: 0,
          context: { reason: 'orgContext not provided' },
        }],
        remediation:
          'Provide an orgContext object containing a policy manifest and repo states. ' +
          'This is typically done via the Phase Mirror Pro organization scan.',
        adrReferences: ['ADR-007: Cross-Org Policy Federation'],
      });
      return findings;
    }

    // ── Validate manifest ──
    const validation = validateManifest(orgContext.manifest);
    if (!validation.valid) {
      findings.push({
        id: 'MD-101-manifest-invalid',
        ruleId: 'MD-101',
        ruleName: 'Cross-Repo Protection Gap',
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
      return findings;
    }

    const now = new Date();

    // ── Scan each repo ──
    for (const repo of orgContext.repos) {
      // Skip archived repos
      if (repo.meta.archived) continue;

      const shortName = repoShortName(repo.fullName);

      // Check for expired exemptions
      for (const exemption of orgContext.manifest.exemptions) {
        if (exemption.repo === shortName && exemption.expiresAt) {
          const expiry = new Date(exemption.expiresAt);
          if (expiry < now) {
            findings.push({
              id: `MD-101-expired-${repo.fullName}-${exemption.expectationIds.join('+')}`,
              ruleId: 'MD-101',
              ruleName: 'Cross-Repo Protection Gap — Expired Exemption',
              severity: 'medium',
              title: `Exemption expired for "${repo.fullName}" — ${exemption.expectationIds.join(', ')}`,
              description:
                `The exemption for "${repo.fullName}" covering expectations ` +
                `[${exemption.expectationIds.join(', ')}] expired on ${exemption.expiresAt}. ` +
                `Reason: "${exemption.reason}". The exempted governance checks are now active again. ` +
                `Review whether this repo now meets the requirements or renew the exemption.`,
              evidence: [{
                path: '.github/.phase-mirror/policy-manifest.json',
                line: 0,
                context: {
                  repo: repo.fullName,
                  exemption: {
                    expectationIds: exemption.expectationIds,
                    reason: exemption.reason,
                    expiresAt: exemption.expiresAt,
                    ticket: exemption.ticket,
                  },
                },
              }],
              remediation:
                `Either bring "${repo.fullName}" into compliance with the exempted ` +
                `expectations, or renew the exemption with an updated expiration date ` +
                `and justification.`,
              adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
            });
          }
        }
      }

      // Resolve expectations (active exemptions already filtered out)
      const { expectations } = resolveExpectationsForRepo(
        orgContext.manifest,
        shortName,
        {
          topics: repo.meta.topics,
          language: repo.meta.language,
          visibility: repo.meta.visibility,
          archived: repo.meta.archived,
        },
      );

      // Skip repos with no applicable expectations
      if (expectations.length === 0) continue;

      // Check each expectation
      for (const expectation of expectations) {
        const gaps = checkExpectation(repo, expectation);
        findings.push(...gaps);
      }
    }

    return findings;
  },
};

export default rule;
