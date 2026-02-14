/**
 * Tests for MD-102 Federated: Org-Wide Merge Queue Trust Chain Analysis
 */

import { describe, test, expect } from '@jest/globals';
import { evaluateMD102Federated } from '../../src/rules/tier-b/MD-102-federated';
import type { OrgContext, RepoGovernanceState } from '../../src/rules/tier-b/MD-101';
import type { OrgPolicyManifest } from '../../src/rules/tier-b/policy-manifest';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeRepo(overrides: Partial<RepoGovernanceState> & { fullName: string }): RepoGovernanceState {
  return {
    meta: {
      topics: [],
      language: 'TypeScript',
      visibility: 'private',
      archived: false,
      defaultBranch: 'main',
    },
    branchProtection: {
      branch: 'main',
      enabled: true,
      requirePullRequest: true,
      requiredReviewers: 2,
      dismissStaleReviews: true,
      requireCodeOwnerReviews: true,
      enforceAdmins: true,
      requiredStatusChecks: ['oracle-check', 'test'],
      requireStrictStatusChecks: true,
    },
    workflows: [
      { path: '.github/workflows/ci.yml', jobNames: ['test', 'lint'] },
    ],
    defaultPermissions: 'read' as const,
    codeowners: { exists: true, coveredPaths: ['src/'] },
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeManifest(overrides?: Partial<OrgPolicyManifest>): OrgPolicyManifest {
  return {
    schemaVersion: '1.0.0',
    orgId: 'test-org',
    updatedAt: new Date().toISOString(),
    approvedBy: 'steward@example.com',
    defaults: [],
    classifications: [],
    exemptions: [],
    mergeQueue: {
      requiredForDefaultBranch: true,
      allowBypassForAdmins: false,
      requireLinearHistory: true,
      allowDirectPushes: false,
    },
    ...overrides,
  };
}

function makeOrgContext(repos: RepoGovernanceState[], manifestOverrides?: Partial<OrgPolicyManifest>): OrgContext {
  return {
    manifest: makeManifest(manifestOverrides),
    repos,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('MD-102 Federated: Org-Wide Merge Queue Trust Chain', () => {
  // ── Guard: silent when no merge queue policy ──
  test('returns no findings when no mergeQueue policy in manifest', async () => {
    const ctx = makeOrgContext(
      [makeRepo({ fullName: 'org/repo-a' })],
      { mergeQueue: undefined },
    );

    const findings = await evaluateMD102Federated(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── Guard: skips archived repos ──
  test('skips archived repositories', async () => {
    const archived = makeRepo({
      fullName: 'org/old-repo',
      meta: {
        topics: [],
        language: 'TypeScript',
        visibility: 'private',
        archived: true,
        defaultBranch: 'main',
      },
      branchProtection: null,
    });

    const ctx = makeOrgContext([archived]);
    const findings = await evaluateMD102Federated(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── True Negative: compliant org ──
  test('returns no findings for fully compliant org', async () => {
    const repos = [
      makeRepo({ fullName: 'org/api-service', mergeQueue: { enabled: true } }),
      makeRepo({ fullName: 'org/web-app', mergeQueue: { enabled: true } }),
    ];

    const ctx = makeOrgContext(repos);
    const findings = await evaluateMD102Federated(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── Check 1: Direct pushes allowed when policy requires merge queue ──
  test('detects repo allowing direct pushes when policy requires merge queue', async () => {
    const repo = makeRepo({
      fullName: 'org/unprotected-service',
      branchProtection: {
        branch: 'main',
        enabled: true,
        requirePullRequest: false, // ← Gap
        requiredReviewers: 0,
        dismissStaleReviews: false,
        requireCodeOwnerReviews: false,
        enforceAdmins: false,
        requiredStatusChecks: [],
        requireStrictStatusChecks: false,
      },
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const pushFinding = findings.find(f => f.evidence[0].context.check === 'federated-direct-push');
    expect(pushFinding).toBeDefined();
    expect(pushFinding!.severity).toBe('high');
    expect(pushFinding!.title).toContain('direct pushes');
    expect(pushFinding!.remediation).toContain('org/unprotected-service');
  });

  test('detects repo with no branch protection when policy requires merge queue', async () => {
    const repo = makeRepo({
      fullName: 'org/no-protection',
      branchProtection: null,
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const pushFinding = findings.find(f => f.evidence[0].context.check === 'federated-direct-push');
    expect(pushFinding).toBeDefined();
    expect(pushFinding!.severity).toBe('high');
  });

  // ── Check 2: Critical repo without merge queue ──
  test('detects critical repo without merge queue enabled', async () => {
    const repo = makeRepo({
      fullName: 'org/payment-gateway',
      meta: {
        topics: ['production'],
        language: 'TypeScript',
        visibility: 'private',
        archived: false,
        defaultBranch: 'main',
        tags: ['critical', 'pci'],
      },
      mergeQueue: { enabled: false },
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const criticalFinding = findings.find(
      f => f.evidence[0].context.check === 'federated-critical-no-queue',
    );
    expect(criticalFinding).toBeDefined();
    expect(criticalFinding!.severity).toBe('critical');
    expect(criticalFinding!.title).toContain('Critical repository');
    expect(criticalFinding!.remediation).toContain('payment-gateway');
  });

  test('no critical finding when critical repo has merge queue', async () => {
    const repo = makeRepo({
      fullName: 'org/payment-gateway',
      meta: {
        topics: ['production'],
        language: 'TypeScript',
        visibility: 'private',
        archived: false,
        defaultBranch: 'main',
        tags: ['critical'],
      },
      mergeQueue: { enabled: true },
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const criticalFinding = findings.find(
      f => f.evidence[0].context.check === 'federated-critical-no-queue',
    );
    expect(criticalFinding).toBeUndefined();
  });

  test('no critical finding when repo is not tagged critical', async () => {
    const repo = makeRepo({
      fullName: 'org/docs',
      meta: {
        topics: [],
        language: 'Markdown',
        visibility: 'public',
        archived: false,
        defaultBranch: 'main',
        tags: ['documentation'],
      },
      mergeQueue: undefined, // No merge queue
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const criticalFinding = findings.find(
      f => f.evidence[0].context.check === 'federated-critical-no-queue',
    );
    expect(criticalFinding).toBeUndefined();
  });

  // ── Check 3: Admin bypass inconsistency ──
  test('detects admin bypass inconsistency', async () => {
    const repo = makeRepo({
      fullName: 'org/api-service',
      branchProtection: {
        branch: 'main',
        enabled: true,
        requirePullRequest: true,
        requiredReviewers: 2,
        dismissStaleReviews: true,
        requireCodeOwnerReviews: true,
        enforceAdmins: false, // ← Policy forbids admin bypass
        requiredStatusChecks: ['test'],
        requireStrictStatusChecks: true,
      },
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    const bypassFinding = findings.find(
      f => f.evidence[0].context.check === 'federated-admin-bypass',
    );
    expect(bypassFinding).toBeDefined();
    expect(bypassFinding!.severity).toBe('high');
    expect(bypassFinding!.title).toContain('Admin bypass');
  });

  test('no admin bypass finding when policy allows it', async () => {
    const repo = makeRepo({
      fullName: 'org/api-service',
      branchProtection: {
        branch: 'main',
        enabled: true,
        requirePullRequest: true,
        requiredReviewers: 2,
        dismissStaleReviews: true,
        requireCodeOwnerReviews: true,
        enforceAdmins: false,
        requiredStatusChecks: ['test'],
        requireStrictStatusChecks: true,
      },
    });

    const ctx = makeOrgContext([repo], {
      mergeQueue: {
        requiredForDefaultBranch: true,
        allowBypassForAdmins: true, // ← Policy allows
        requireLinearHistory: false,
        allowDirectPushes: false,
      },
    });

    const findings = await evaluateMD102Federated(ctx);
    const bypassFinding = findings.find(
      f => f.evidence[0].context.check === 'federated-admin-bypass',
    );
    expect(bypassFinding).toBeUndefined();
  });

  // ── Cross-repo: multiple repos with mixed compliance ──
  test('detects findings across multiple repos', async () => {
    const repos = [
      makeRepo({
        fullName: 'org/compliant-service',
        mergeQueue: { enabled: true },
      }),
      makeRepo({
        fullName: 'org/gaps-service',
        branchProtection: {
          branch: 'main',
          enabled: true,
          requirePullRequest: false, // ← direct push gap
          requiredReviewers: 0,
          dismissStaleReviews: false,
          requireCodeOwnerReviews: false,
          enforceAdmins: false, // ← admin bypass gap
          requiredStatusChecks: [],
          requireStrictStatusChecks: false,
        },
      }),
      makeRepo({
        fullName: 'org/critical-nq',
        meta: {
          topics: [],
          language: 'TypeScript',
          visibility: 'private',
          archived: false,
          defaultBranch: 'main',
          tags: ['critical'],
        },
        mergeQueue: undefined, // ← no merge queue on critical
      }),
    ];

    const ctx = makeOrgContext(repos);
    const findings = await evaluateMD102Federated(ctx);

    // Should have findings for gaps-service and critical-nq, not compliant-service
    const repoNames = findings.map(f => f.evidence[0].context.repo);
    expect(repoNames).not.toContain('org/compliant-service');
    expect(repoNames).toContain('org/gaps-service');
    expect(repoNames).toContain('org/critical-nq');
  });

  // ── All findings have correct ruleId ──
  test('all findings reference MD-102', async () => {
    const repo = makeRepo({
      fullName: 'org/bad-repo',
      branchProtection: {
        branch: 'main',
        enabled: true,
        requirePullRequest: false,
        requiredReviewers: 0,
        dismissStaleReviews: false,
        requireCodeOwnerReviews: false,
        enforceAdmins: false,
        requiredStatusChecks: [],
        requireStrictStatusChecks: false,
      },
      meta: {
        topics: [],
        language: 'TypeScript',
        visibility: 'private',
        archived: false,
        defaultBranch: 'main',
        tags: ['critical'],
      },
      mergeQueue: undefined,
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    for (const f of findings) {
      expect(f.ruleId).toBe('MD-102');
      expect(f.ruleName).toContain('Merge Queue Trust Chain Break');
      expect(f.adrReferences).toContain('ADR-003: CI/CD Pipeline Governance');
    }
  });

  // ── Finding structure is valid ──
  test('findings have valid structure', async () => {
    const repo = makeRepo({
      fullName: 'org/test',
      branchProtection: null,
    });

    const ctx = makeOrgContext([repo]);
    const findings = await evaluateMD102Federated(ctx);

    for (const f of findings) {
      expect(f.id).toBeTruthy();
      expect(f.ruleId).toBe('MD-102');
      expect(f.ruleName).toBeTruthy();
      expect(f.severity).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.remediation).toBeTruthy();
      expect(f.evidence).toBeInstanceOf(Array);
      expect(f.evidence.length).toBeGreaterThan(0);
    }
  });
});
