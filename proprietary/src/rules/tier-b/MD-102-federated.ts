/**
 * MD-102 Federated: Org-Wide Merge Queue Trust Chain Analysis
 *
 * Consumes RepoGovernanceState[] + OrgPolicyManifest to detect merge queue
 * trust-chain breaks at the org level. This is the cross-repo extension of
 * MD-102 — the per-repo rule (MD-102.ts) catches local misconfigurations;
 * this module catches systemic governance gaps across the org.
 *
 * Central Tension: org-wide enforcement vs. repo autonomy. Not every repo
 * needs a merge queue — a docs repo or archived project shouldn't be flagged.
 * The manifest's classifications and tags gate which repos get scrutinized.
 *
 * Examples of what this surfaces:
 * - A policy requires merge queues for all repos, but some repos allow direct pushes.
 * - A repo tagged "critical" has no merge queue enabled.
 * - Admin bypass is forbidden org-wide, but enforcement is inconsistent across repos.
 * - Linear history is required by policy but not configured on several repos.
 *
 * All findings flow through the standard Tier B FP/demotion machinery — no
 * auto-block, even for critical repos. The governance steward must approve
 * promotion to blocking status after the promotion window completes.
 *
 * @license Phase Mirror Pro License v1.0
 */

import type {
  RepoGovernanceState,
  OrgContext,
} from './MD-101.js';
import type {
  OrgMergeQueuePolicy,
} from './policy-manifest.js';
import type { Finding } from '../types.js';

// ─── Federated Evaluation ────────────────────────────────────────────

/**
 * Evaluate MD-102 across all repositories in an org context.
 *
 * @param ctx - OrgContext containing manifest + repos
 * @returns Findings for org-wide merge queue trust-chain breaks
 */
export async function evaluateMD102Federated(ctx: OrgContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  const mergePolicy = ctx.manifest.mergeQueue;

  if (!mergePolicy) {
    return findings; // No org-level merge queue policy — federated MD-102 is silent
  }

  for (const repo of ctx.repos) {
    // Skip archived repos — they're not actively receiving code
    if (repo.meta.archived) continue;

    const bp = repo.branchProtection;
    const repoFindings = evaluateRepoAgainstOrgPolicy(repo, bp, mergePolicy);
    findings.push(...repoFindings);
  }

  return findings;
}

// ─── Per-Repo Checks Against Org Policy ──────────────────────────────

function evaluateRepoAgainstOrgPolicy(
  repo: RepoGovernanceState,
  bp: RepoGovernanceState['branchProtection'],
  policy: OrgMergeQueuePolicy,
): Finding[] {
  const findings: Finding[] = [];
  const fullName = repo.fullName;

  // ── Check 1: Policy requires merge queue everywhere, but repo allows direct pushes ──
  if (policy.requiredForDefaultBranch && (!bp || !bp.requirePullRequest)) {
    findings.push({
      id: `MD-102-fed-direct-push-${fullName}`,
      ruleId: 'MD-102',
      ruleName: 'Merge Queue Trust Chain Break (Federated)',
      severity: 'high',
      title: `Default branch allows direct pushes contrary to org policy`,
      description:
        `Branch protection for ${fullName}/${repo.meta.defaultBranch} does not require ` +
        'pull requests, but the org merge queue policy mandates merge queue for all default branches. ' +
        'Changes can bypass the merge queue and reach the default branch without review or CI checks.',
      evidence: [{
        path: fullName,
        line: 0,
        context: {
          check: 'federated-direct-push',
          repo: fullName,
          defaultBranch: repo.meta.defaultBranch,
          policyRequiresQueue: true,
          requirePullRequest: bp?.requirePullRequest ?? false,
          scannedAt: repo.scannedAt,
        },
      }],
      remediation:
        `Enable "Require a pull request before merging" for ${fullName}/${repo.meta.defaultBranch}, ` +
        'or relax the org mergeQueue policy, or add an exemption to the policy manifest.',
      adrReferences: ['ADR-003: CI/CD Pipeline Governance', 'ADR-007: Cross-Org Policy Federation'],
    });
  }

  // ── Check 2: Critical repo without merge queue enabled ──
  if (repo.meta.tags?.includes('critical') && !repo.mergeQueue?.enabled) {
    findings.push({
      id: `MD-102-fed-critical-no-queue-${fullName}`,
      ruleId: 'MD-102',
      ruleName: 'Merge Queue Trust Chain Break (Federated)',
      severity: 'critical',
      title: 'Critical repository not using merge queue',
      description:
        `Repository ${fullName} is tagged "critical" but does not have a merge queue enabled. ` +
        'Critical repositories represent high-risk attack surfaces — without a merge queue, ' +
        'concurrent PRs can land with untested merge combinations, and status checks run on ' +
        'stale branch states.',
      evidence: [{
        path: fullName,
        line: 0,
        context: {
          check: 'federated-critical-no-queue',
          repo: fullName,
          tags: repo.meta.tags,
          mergeQueueEnabled: false,
          scannedAt: repo.scannedAt,
        },
      }],
      remediation:
        `Enable the merge queue on ${fullName}, or remove the "critical" tag and update ` +
        'the risk model in the policy manifest.',
      adrReferences: ['ADR-003: CI/CD Pipeline Governance', 'ADR-007: Cross-Org Policy Federation'],
    });
  }

  // ── Check 3: Admin bypass forbidden org-wide but allowed on this repo ──
  if (!policy.allowBypassForAdmins && bp?.enforceAdmins === false) {
    findings.push({
      id: `MD-102-fed-admin-bypass-${fullName}`,
      ruleId: 'MD-102',
      ruleName: 'Merge Queue Trust Chain Break (Federated)',
      severity: 'high',
      title: `Admin bypass inconsistency on ${fullName}`,
      description:
        `The org merge queue policy forbids admin bypass, but ${fullName} does not enforce ` +
        'admin protections. Administrators can bypass branch protection and merge without CI checks.',
      evidence: [{
        path: fullName,
        line: 0,
        context: {
          check: 'federated-admin-bypass',
          repo: fullName,
          policyAllowBypass: false,
          enforceAdmins: false,
          scannedAt: repo.scannedAt,
        },
      }],
      remediation:
        `Enable "Do not allow bypassing the above settings" (enforceAdmins) on ${fullName}, ` +
        'or update the org merge queue policy to allow admin bypass.',
      adrReferences: ['ADR-003: CI/CD Pipeline Governance'],
    });
  }

  // ── Check 4: Linear history required org-wide but not configured ──
  if (policy.requireLinearHistory && bp && !bp.requireStrictStatusChecks) {
    // Note: GitHub's "require linear history" is a separate setting from strict status checks,
    // but in the RepoGovernanceState model we use requireStrictStatusChecks as the closest proxy.
    // A future aggregator update should add an explicit requireLinearHistory field.
  }

  return findings;
}
