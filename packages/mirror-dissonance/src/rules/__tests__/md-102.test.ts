/**
 * Tests for MD-102: Merge Queue Trust Chain Break (OSS, per-repo)
 */

import { describe, test, expect } from '@jest/globals';
import { checkMD102 } from '../md-102.js';
import type { OracleInput } from '../../schemas/types.js';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeInput(overrides: Record<string, unknown> = {}): OracleInput {
  return {
    mode: 'merge_group',
    context: {
      repositoryName: 'test/repo',
      branch: 'main',
      ...overrides,
    },
  };
}

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
  requiredStatusChecks: {
    contexts: ['ci/test', 'ci/lint'],
    strict: true,
  },
};

// ─── Tests ───────────────────────────────────────────────────────────

describe('MD-102: Merge Queue Trust Chain Break (OSS)', () => {
  // ── Guard: silent when no policy or no protection ──
  test('returns no violations when no policy is provided', async () => {
    const input = makeInput({ branchProtection: baseProtection });
    const violations = await checkMD102(input);
    expect(violations).toHaveLength(0);
  });

  test('returns no violations when no protection data is provided', async () => {
    const input = makeInput({ mergeQueuePolicy: basePolicy });
    const violations = await checkMD102(input);
    expect(violations).toHaveLength(0);
  });

  test('returns no violations when neither policy nor protection is provided', async () => {
    const input = makeInput();
    const violations = await checkMD102(input);
    expect(violations).toHaveLength(0);
  });

  // ── True Negative: all good ──
  test('returns no violations when protection matches policy', async () => {
    const input = makeInput({
      mergeQueuePolicy: basePolicy,
      branchProtection: baseProtection,
      workflowJobs: [
        { contextName: 'ci/test', filePath: '.github/workflows/ci.yml' },
        { contextName: 'ci/lint', filePath: '.github/workflows/ci.yml' },
      ],
    });
    const violations = await checkMD102(input);
    expect(violations).toHaveLength(0);
  });

  // ── Check 1: Admin bypass ──
  test('detects admin bypass when policy forbids it', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, allowBypassForAdmins: false },
      branchProtection: { ...baseProtection, allowAdminsBypass: true },
    });

    const violations = await checkMD102(input);
    expect(violations.length).toBeGreaterThanOrEqual(1);

    const finding = violations.find(v => v.context.check === 'admin-bypass');
    expect(finding).toBeDefined();
    expect(finding!.ruleId).toBe('MD-102');
    expect(finding!.severity).toBe('high');
    expect(finding!.message).toContain('Admins can bypass');
  });

  test('no admin bypass finding when policy allows it', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, allowBypassForAdmins: true },
      branchProtection: { ...baseProtection, allowAdminsBypass: true },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'admin-bypass');
    expect(finding).toBeUndefined();
  });

  // ── Check 2: Direct pushes ──
  test('detects direct pushes when policy forbids them', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, allowDirectPushes: false },
      branchProtection: { ...baseProtection, allowDirectPushes: true },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'direct-push');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
    expect(finding!.message).toContain('Direct pushes');
  });

  test('detects missing PR requirement as implicit direct push', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, allowDirectPushes: false },
      branchProtection: { ...baseProtection, requirePullRequest: false, allowDirectPushes: false },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'direct-push');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  // ── Check 3: Linear history ──
  test('detects missing linear history when policy requires it', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, requireLinearHistory: true },
      branchProtection: { ...baseProtection, requireLinearHistory: false },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'linear-history');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
    expect(finding!.message).toContain('Linear history');
  });

  test('no linear history finding when policy does not require it', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, requireLinearHistory: false },
      branchProtection: { ...baseProtection, requireLinearHistory: false },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'linear-history');
    expect(finding).toBeUndefined();
  });

  // ── Check 4: Orphaned status checks ──
  test('detects required status checks with no matching workflow jobs', async () => {
    const input = makeInput({
      mergeQueuePolicy: basePolicy,
      branchProtection: {
        ...baseProtection,
        requiredStatusChecks: {
          contexts: ['ci/test', 'ci/security-scan', 'ci/deploy-preview'],
          strict: true,
        },
      },
      workflowJobs: [
        { contextName: 'ci/test', filePath: '.github/workflows/ci.yml' },
      ],
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'orphaned-status-checks');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
    expect(finding!.context.missingContexts).toEqual(
      expect.arrayContaining(['ci/security-scan', 'ci/deploy-preview']),
    );
  });

  test('no orphaned check finding when all contexts have matching jobs', async () => {
    const input = makeInput({
      mergeQueuePolicy: basePolicy,
      branchProtection: baseProtection,
      workflowJobs: [
        { contextName: 'ci/test', filePath: '.github/workflows/ci.yml' },
        { contextName: 'ci/lint', filePath: '.github/workflows/ci.yml' },
      ],
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'orphaned-status-checks');
    expect(finding).toBeUndefined();
  });

  // ── Check 5: Protection disabled ──
  test('detects disabled branch protection when merge queue is required', async () => {
    const input = makeInput({
      mergeQueuePolicy: { ...basePolicy, requiredForDefaultBranch: true },
      branchProtection: { ...baseProtection, enabled: false },
    });

    const violations = await checkMD102(input);
    const finding = violations.find(v => v.context.check === 'protection-disabled');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  // ── Edge case: multiple violations at once ──
  test('reports multiple violations simultaneously', async () => {
    const input = makeInput({
      mergeQueuePolicy: basePolicy,
      branchProtection: {
        enabled: false,
        allowAdminsBypass: true,
        requirePullRequest: false,
        requireLinearHistory: false,
        allowDirectPushes: true,
      },
    });

    const violations = await checkMD102(input);
    // Should detect: admin-bypass, direct-push, linear-history, protection-disabled
    expect(violations.length).toBeGreaterThanOrEqual(3);

    const checks = violations.map(v => v.context.check);
    expect(checks).toContain('admin-bypass');
    expect(checks).toContain('direct-push');
    expect(checks).toContain('linear-history');
    expect(checks).toContain('protection-disabled');
  });

  // ── All violations have correct ruleId ──
  test('all violations have ruleId MD-102', async () => {
    const input = makeInput({
      mergeQueuePolicy: basePolicy,
      branchProtection: {
        enabled: false,
        allowAdminsBypass: true,
        requirePullRequest: false,
        requireLinearHistory: false,
        allowDirectPushes: true,
      },
    });

    const violations = await checkMD102(input);
    for (const v of violations) {
      expect(v.ruleId).toBe('MD-102');
    }
  });
});
