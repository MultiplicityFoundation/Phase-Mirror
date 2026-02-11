/**
 * Tests for MD-102: Merge Queue Trust Chain Break (Proprietary, Per-Repo)
 */

import { describe, test, expect } from '@jest/globals';
import { rule } from '../../src/rules/tier-b/MD-102';

// ─── Helpers ─────────────────────────────────────────────────────────

const proLicense = {
  orgId: 'test-org',
  tier: 'pro' as const,
  features: ['tier-b-rules'],
  expiresAt: new Date(Date.now() + 86400000),
  seats: 10,
};

const basePolicy = {
  requiredForDefaultBranch: true,
  allowBypassForAdmins: false,
  requireLinearHistory: true,
  allowDirectPushes: false,
};

const baseProtection = {
  enabled: true,
  allowAdminsBypass: false,
  requirePullRequest: true,
  requireLinearHistory: true,
  allowDirectPushes: false,
  requiredStatusChecks: ['ci/test', 'ci/lint'],
};

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    license: proLicense,
    files: [],
    repo: { owner: 'test-org', name: 'test-repo' },
    mode: 'pullrequest' as const,
    ...overrides,
  };
}

const noLicenseContext = (overrides: Record<string, unknown> = {}) => ({
  files: [],
  repo: { owner: 'test', name: 'repo' },
  mode: 'pullrequest' as const,
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────

describe('MD-102: Merge Queue Trust Chain Break', () => {
  // ── Metadata ──
  test('rule metadata is correct', () => {
    expect(rule.id).toBe('MD-102');
    expect(rule.name).toBe('Merge Queue Trust Chain Break');
    expect(rule.tier).toBe('B');
    expect(rule.severity).toBe('warn');
    expect(rule.version).toBe('1.0.0');
    expect(rule.category).toBe('governance');
    expect(rule.fpTolerance.ceiling).toBe(0.02);
    expect(rule.fpTolerance.window).toBe(200);
  });

  test('promotion criteria enforces measured promotion', () => {
    expect(rule.promotionCriteria.minWindowN).toBe(200);
    expect(rule.promotionCriteria.maxObservedFPR).toBe(0.02);
    expect(rule.promotionCriteria.minDaysInWarn).toBe(14);
    expect(rule.promotionCriteria.requiredApprovers).toContain('steward');
  });

  // ── License Gate ──
  test('throws ProLicenseRequiredError without license', async () => {
    const ctx = noLicenseContext({ mergeQueuePolicy: basePolicy });
    await expect(rule.evaluate(ctx)).rejects.toThrow('Pro license');
  });

  // ── Guard: silent when no policy ──
  test('returns no findings when no policy is provided', async () => {
    const ctx = makeContext({
      branchProtection: baseProtection,
    });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── Guard: reports missing protection when policy exists ──
  test('reports missing branch protection when policy requires merge queue', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, requiredForDefaultBranch: true },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('none is configured');
    expect(findings[0].severity).toBe('high');
  });

  test('silent when no protection and policy does not require merge queue', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, requiredForDefaultBranch: false },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── True Negative ──
  test('returns no findings when protection matches policy', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: basePolicy,
      branchProtection: baseProtection,
      workflowJobs: [
        { contextName: 'ci/test', filePath: '.github/workflows/ci.yml' },
        { contextName: 'ci/lint', filePath: '.github/workflows/ci.yml' },
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ── Check 1: Admin bypass ──
  test('detects admin bypass when policy forbids it', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, allowBypassForAdmins: false },
      branchProtection: { ...baseProtection, allowAdminsBypass: true },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    const finding = findings.find(f => f.evidence[0].context.check === 'admin-bypass');
    expect(finding).toBeDefined();
    expect(finding!.ruleId).toBe('MD-102');
    expect(finding!.severity).toBe('high');
    expect(finding!.title).toContain('Admins can bypass');
    expect(finding!.remediation).toContain('Disable');
  });

  test('no admin bypass finding when policy allows it', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, allowBypassForAdmins: true },
      branchProtection: { ...baseProtection, allowAdminsBypass: true },
    });

    const findings = await rule.evaluate(ctx);
    const finding = findings.find(f => f.evidence[0].context.check === 'admin-bypass');
    expect(finding).toBeUndefined();
  });

  // ── Check 2: Direct pushes ──
  test('detects direct pushes when policy forbids them', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, allowDirectPushes: false },
      branchProtection: { ...baseProtection, allowDirectPushes: true },
    });

    const findings = await rule.evaluate(ctx);
    const finding = findings.find(f => f.evidence[0].context.check === 'direct-push');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.remediation).toContain('pull request');
  });

  test('detects missing PR requirement as implicit direct push', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, allowDirectPushes: false },
      branchProtection: {
        ...baseProtection,
        requirePullRequest: false,
        allowDirectPushes: false,
      },
    });

    const findings = await rule.evaluate(ctx);
    const finding = findings.find(f => f.evidence[0].context.check === 'direct-push');
    expect(finding).toBeDefined();
  });

  // ── Check 3: Linear history ──
  test('detects missing linear history when policy requires it', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: { ...basePolicy, requireLinearHistory: true },
      branchProtection: { ...baseProtection, requireLinearHistory: false },
    });

    const findings = await rule.evaluate(ctx);
    const finding = findings.find(f => f.evidence[0].context.check === 'linear-history');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
  });

  // ── Check 4: Orphaned status checks ──
  test('detects orphaned status checks', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: basePolicy,
      branchProtection: {
        ...baseProtection,
        requiredStatusChecks: ['ci/test', 'ci/ghost-check', 'ci/phantom'],
      },
      workflowJobs: [
        { contextName: 'ci/test', filePath: '.github/workflows/ci.yml' },
      ],
    });

    const findings = await rule.evaluate(ctx);
    const finding = findings.find(f => f.evidence[0].context.check === 'orphaned-status-checks');
    expect(finding).toBeDefined();
    expect(finding!.evidence[0].context.missingContexts).toEqual(
      expect.arrayContaining(['ci/ghost-check', 'ci/phantom']),
    );
  });

  // ── Structured findings ──
  test('findings have correct structure', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: basePolicy,
      branchProtection: { ...baseProtection, allowAdminsBypass: true },
    });

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);

    for (const finding of findings) {
      expect(finding.ruleId).toBe('MD-102');
      expect(finding.ruleName).toBe('Merge Queue Trust Chain Break');
      expect(finding.id).toBeTruthy();
      expect(finding.title).toBeTruthy();
      expect(finding.description).toBeTruthy();
      expect(finding.remediation).toBeTruthy();
      expect(finding.evidence).toBeInstanceOf(Array);
      expect(finding.evidence.length).toBeGreaterThan(0);
      expect(finding.evidence[0].path).toBeTruthy();
    }
  });

  // ── Multiple violations at once ──
  test('reports multiple violations simultaneously', async () => {
    const ctx = makeContext({
      mergeQueuePolicy: basePolicy,
      branchProtection: {
        enabled: true,
        allowAdminsBypass: true,
        requirePullRequest: false,
        requireLinearHistory: false,
        allowDirectPushes: true,
      },
    });

    const findings = await rule.evaluate(ctx);
    const checks = findings.map(f => f.evidence[0].context.check);
    expect(checks).toContain('admin-bypass');
    expect(checks).toContain('direct-push');
    expect(checks).toContain('linear-history');
  });
});
