/**
 * Tests for MD-101: Cross-Repo Protection Gap
 */

import { describe, test, expect } from '@jest/globals';
import { rule, detectGapsForRepo } from '../../src/rules/tier-b/MD-101';
import type { CrossRepoContext } from '../../src/rules/tier-b/MD-101';
import {
  resolveExpectationsForRepo,
  validateManifest,
  matchGlob,
  matchesRepo,
} from '../../src/rules/tier-b/policy-manifest';
import type {
  OrgPolicyManifest,
  RepoGovernanceState,
  PolicyExpectation,
} from '../../src/rules/tier-b/policy-manifest';
import type { ProLicense } from '../../src/license-gate';

// ─── Test Helpers ────────────────────────────────────────────────────

const validLicense: ProLicense = {
  orgId: 'test-org',
  tier: 'pro',
  features: ['tier-b-rules'],
  expiresAt: new Date(Date.now() + 86400000 * 365),
  seats: 10,
};

const futureDate = new Date(Date.now() + 86400000 * 365).toISOString();

function makeManifest(overrides: Partial<OrgPolicyManifest> = {}): OrgPolicyManifest {
  return {
    schemaVersion: '1.0.0',
    orgId: 'test-org',
    updatedAt: new Date().toISOString(),
    approvedBy: 'security-team',
    defaults: [
      {
        id: 'bp-main',
        name: 'Main branch protection',
        category: 'branch-protection',
        severity: 'high',
        requirement: {
          type: 'branch-protection',
          branch: 'main',
          requirePullRequest: true,
          requiredReviewers: 1,
          enforceAdmins: true,
        },
      },
      {
        id: 'sc-oracle',
        name: 'Oracle status check',
        category: 'status-checks',
        severity: 'critical',
        requirement: {
          type: 'status-checks',
          branch: 'main',
          requiredChecks: ['oracle-check', 'test'],
        },
      },
    ],
    classifications: [],
    exemptions: [],
    ...overrides,
  };
}

function makeRepoState(name: string, overrides: Partial<RepoGovernanceState> = {}): RepoGovernanceState {
  return { name, ...overrides };
}

function makeContext(overrides: Partial<CrossRepoContext> = {}): CrossRepoContext {
  return {
    license: validLicense,
    repo: { owner: 'test-org', name: 'meta' },
    mode: 'schedule',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('MD-101: Cross-Repo Protection Gap', () => {
  // ─── Metadata ──────────────────────────────────────────────

  test('rule metadata is correct', () => {
    expect(rule.id).toBe('MD-101');
    expect(rule.tier).toBe('B');
    expect(rule.severity).toBe('warn');
    expect(rule.version).toBe('1.0.0');
    expect(rule.category).toBe('governance');
    expect(rule.fpTolerance.ceiling).toBe(0.08);
    expect(rule.adrReferences).toContain('ADR-003: CI/CD Pipeline Governance');
  });

  // ─── License Gate ──────────────────────────────────────────

  test('throws ProLicenseRequiredError without license', async () => {
    const ctx = makeContext({ license: undefined });
    await expect(rule.evaluate(ctx)).rejects.toThrow('Pro license');
  });

  // ─── Guard Conditions ─────────────────────────────────────

  test('returns empty when no policy manifest provided', async () => {
    const ctx = makeContext({
      repoStates: [makeRepoState('some-repo')],
    });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  test('returns empty when no repo states provided', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
    });
    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ─── True Positive: missing branch protection ─────────────

  test('detects repo missing required branch protection', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates: [
        makeRepoState('payment-service'),  // No branchProtection at all
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);

    const bpGap = findings.find(f => f.title.includes('payment-service') && f.title.includes('branch-protection'));
    expect(bpGap).toBeDefined();
    expect(bpGap!.ruleId).toBe('MD-101');
    expect(bpGap!.description).toContain('payment-service');
  });

  // ─── True Positive: missing status checks ─────────────────

  test('detects repo missing required status checks', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates: [
        makeRepoState('api-service', {
          branchProtection: [{
            branch: 'main',
            requirePullRequest: true,
            requiredReviewers: 1,
            dismissStaleReviews: false,
            requireCodeOwnerReviews: false,
            enforceAdmins: true,
            requiredStatusChecks: ['test'],  // Missing oracle-check
            strictStatusChecks: false,
          }],
        }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    const scGap = findings.find(f =>
      f.title.includes('api-service') && f.title.includes('status-checks'),
    );
    expect(scGap).toBeDefined();
    expect(scGap!.description).toContain('oracle-check');
  });

  // ─── True Negative: fully compliant repo ──────────────────

  test('returns no findings for a fully compliant repo', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates: [
        makeRepoState('compliant-service', {
          branchProtection: [{
            branch: 'main',
            requirePullRequest: true,
            requiredReviewers: 1,
            dismissStaleReviews: false,
            requireCodeOwnerReviews: false,
            enforceAdmins: true,
            requiredStatusChecks: ['oracle-check', 'test'],
            strictStatusChecks: false,
          }],
        }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ─── True Negative: exempted repo ─────────────────────────

  test('respects policy exemptions', async () => {
    const manifest = makeManifest({
      exemptions: [{
        repo: 'docs-only',
        expectationIds: ['bp-main', 'sc-oracle'],
        reason: 'Documentation repo — no deployable code',
        approvedBy: 'security-lead',
        expiresAt: futureDate,
        ticket: 'SEC-1234',
      }],
    });

    const ctx = makeContext({
      policyManifest: manifest,
      repoStates: [
        makeRepoState('docs-only'),  // No protection, but exempted
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ─── Expired exemptions should re-flag ─────────────────────

  test('does not honor expired exemptions', async () => {
    const manifest = makeManifest({
      exemptions: [{
        repo: 'old-repo',
        expectationIds: ['bp-main', 'sc-oracle'],
        reason: 'Temporary exemption',
        approvedBy: 'someone',
        expiresAt: '2020-01-01T00:00:00Z',  // Expired
      }],
    });

    const ctx = makeContext({
      policyManifest: manifest,
      repoStates: [
        makeRepoState('old-repo'),  // No protection, expired exemption
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Skips archived repos ─────────────────────────────────

  test('skips archived repos', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates: [
        makeRepoState('old-project', { archived: true }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(0);
  });

  // ─── Classification-based expectations ─────────────────────

  test('applies classification-specific expectations to matching repos', async () => {
    const manifest = makeManifest({
      defaults: [],  // No defaults
      classifications: [{
        name: 'service',
        description: 'Production services',
        match: { patterns: ['*-service'] },
        expectations: [{
          id: 'wf-oracle',
          name: 'Oracle workflow required',
          category: 'workflow-presence',
          severity: 'high',
          requirement: {
            type: 'workflow-presence',
            workflowFile: '.github/workflows/oracle.yml',
          },
        }],
      }],
    });

    const ctx = makeContext({
      policyManifest: manifest,
      repoStates: [
        makeRepoState('payment-service', {
          workflowFiles: ['.github/workflows/ci.yml'],  // Missing oracle.yml
        }),
        makeRepoState('docs', {
          workflowFiles: [],  // Not a service — shouldn't be flagged
        }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].title).toContain('payment-service');
    expect(findings[0].title).toContain('workflow-presence');
  });

  // ─── Permissions gap ──────────────────────────────────────

  test('detects write permissions where read is required', async () => {
    const manifest = makeManifest({
      defaults: [{
        id: 'perm-read',
        name: 'Restrict workflow permissions',
        category: 'permissions',
        severity: 'medium',
        requirement: {
          type: 'permissions',
          maxDefaultPermissions: 'read',
        },
      }],
    });

    const ctx = makeContext({
      policyManifest: manifest,
      repoStates: [
        makeRepoState('leaky-repo', { defaultPermissions: 'write' }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    const permGap = findings.find(f => f.title.includes('permissions'));
    expect(permGap).toBeDefined();
    expect(permGap!.description).toContain('write');
  });

  // ─── CODEOWNERS gap ───────────────────────────────────────

  test('detects missing CODEOWNERS coverage', async () => {
    const manifest = makeManifest({
      defaults: [{
        id: 'co-critical',
        name: 'CODEOWNERS for critical paths',
        category: 'codeowners',
        severity: 'medium',
        requirement: {
          type: 'codeowners',
          requiredPaths: ['.github/workflows/', 'src/security/'],
        },
      }],
    });

    const ctx = makeContext({
      policyManifest: manifest,
      repoStates: [
        makeRepoState('my-repo', {
          codeownersPaths: ['.github/workflows/'],  // Missing src/security/
        }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    const coGap = findings.find(f => f.title.includes('codeowners'));
    expect(coGap).toBeDefined();
    expect(coGap!.description).toContain('src/security/');
  });

  // ─── Multiple repos: flags only non-compliant ones ────────

  test('flags only repos with gaps, not compliant ones', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates: [
        makeRepoState('good-repo', {
          branchProtection: [{
            branch: 'main',
            requirePullRequest: true,
            requiredReviewers: 1,
            dismissStaleReviews: false,
            requireCodeOwnerReviews: false,
            enforceAdmins: true,
            requiredStatusChecks: ['oracle-check', 'test'],
            strictStatusChecks: false,
          }],
        }),
        makeRepoState('bad-repo'),  // No protection at all
      ],
    });

    const findings = await rule.evaluate(ctx);
    const badFindings = findings.filter(f => f.title.includes('bad-repo'));
    const goodFindings = findings.filter(f => f.title.includes('good-repo'));

    expect(badFindings.length).toBeGreaterThanOrEqual(1);
    expect(goodFindings).toHaveLength(0);
  });

  // ─── Performance: 50+ repos ────────────────────────────────

  test('evaluates 50 repos in under 50ms', async () => {
    const repoStates = Array.from({ length: 50 }, (_, i) =>
      makeRepoState(`repo-${i}`, {
        branchProtection: i % 3 === 0 ? [{
          branch: 'main',
          requirePullRequest: true,
          requiredReviewers: 1,
          dismissStaleReviews: false,
          requireCodeOwnerReviews: false,
          enforceAdmins: true,
          requiredStatusChecks: ['oracle-check', 'test'],
          strictStatusChecks: false,
        }] : undefined,
      }),
    );

    const ctx = makeContext({
      policyManifest: makeManifest(),
      repoStates,
    });

    const start = performance.now();
    const findings = await rule.evaluate(ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    // 2/3 of 50 repos have no protection → at least 33 should be flagged
    expect(findings.length).toBeGreaterThanOrEqual(30);
  });

  // ─── Severity mapping ─────────────────────────────────────

  test('missing critical expectation produces block severity', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),  // sc-oracle is severity: critical
      repoStates: [
        makeRepoState('unprotected-repo'),  // No protection at all
      ],
    });

    const findings = await rule.evaluate(ctx);
    const criticalFinding = findings.find(f =>
      f.evidence[0]?.context?.expectationId === 'sc-oracle',
    );
    expect(criticalFinding).toBeDefined();
    // Missing + critical → block
    expect(criticalFinding!.severity).toBe('block');
  });

  test('partial high expectation produces warn severity', async () => {
    const ctx = makeContext({
      policyManifest: makeManifest(),  // bp-main is severity: high
      repoStates: [
        makeRepoState('partial-repo', {
          branchProtection: [{
            branch: 'main',
            requirePullRequest: true,
            requiredReviewers: 0,  // Fewer than required 1
            dismissStaleReviews: false,
            requireCodeOwnerReviews: false,
            enforceAdmins: true,
            requiredStatusChecks: ['oracle-check', 'test'],
            strictStatusChecks: false,
          }],
        }),
      ],
    });

    const findings = await rule.evaluate(ctx);
    const partialFinding = findings.find(f =>
      f.evidence[0]?.context?.gapType === 'partial',
    );
    expect(partialFinding).toBeDefined();
    // Partial + high → warn
    expect(partialFinding!.severity).toBe('warn');
  });
});

// ─── Policy Manifest Utility Tests ───────────────────────────────────

describe('policy-manifest utilities', () => {
  describe('matchGlob', () => {
    test('matches exact strings', () => {
      expect(matchGlob('foo', 'foo')).toBe(true);
      expect(matchGlob('foo', 'bar')).toBe(false);
    });

    test('matches * wildcard', () => {
      expect(matchGlob('*-service', 'payment-service')).toBe(true);
      expect(matchGlob('api-*', 'api-gateway')).toBe(true);
      expect(matchGlob('*-service', 'docs')).toBe(false);
    });

    test('matches ? single-char wildcard', () => {
      expect(matchGlob('repo-?', 'repo-1')).toBe(true);
      expect(matchGlob('repo-?', 'repo-12')).toBe(false);
    });
  });

  describe('matchesRepo', () => {
    test('matches by explicit repo list', () => {
      expect(matchesRepo({ repos: ['foo', 'bar'] }, 'foo')).toBe(true);
      expect(matchesRepo({ repos: ['foo', 'bar'] }, 'baz')).toBe(false);
    });

    test('matches by pattern', () => {
      expect(matchesRepo({ patterns: ['*-service'] }, 'auth-service')).toBe(true);
    });

    test('matches by topic', () => {
      expect(matchesRepo(
        { topics: ['production'] },
        'some-repo',
        { topics: ['production', 'service'] },
      )).toBe(true);
    });

    test('matches by visibility', () => {
      expect(matchesRepo(
        { visibility: 'private' },
        'secret-repo',
        { visibility: 'private' },
      )).toBe(true);
    });

    test('returns false with no meta and no repo/pattern match', () => {
      expect(matchesRepo({ topics: ['prod'] }, 'my-repo')).toBe(false);
    });
  });

  describe('resolveExpectationsForRepo', () => {
    const manifest = makeManifest({
      classifications: [{
        name: 'service',
        description: 'Services',
        match: { patterns: ['*-service'] },
        expectations: [{
          id: 'svc-workflow',
          name: 'Service workflow',
          category: 'workflow-presence',
          severity: 'high',
          requirement: {
            type: 'workflow-presence',
            workflowFile: '.github/workflows/deploy.yml',
          },
        }],
      }],
      exemptions: [{
        repo: 'legacy-service',
        expectationIds: ['bp-main'],
        reason: 'Legacy system, migration planned',
        approvedBy: 'cto',
        expiresAt: futureDate,
      }],
    });

    test('returns defaults for non-classified repo', () => {
      const { expectations } = resolveExpectationsForRepo(manifest, 'my-lib');
      expect(expectations.map(e => e.id)).toEqual(['bp-main', 'sc-oracle']);
    });

    test('adds classification expectations for matching repos', () => {
      const { expectations } = resolveExpectationsForRepo(manifest, 'auth-service');
      const ids = expectations.map(e => e.id);
      expect(ids).toContain('bp-main');
      expect(ids).toContain('sc-oracle');
      expect(ids).toContain('svc-workflow');
    });

    test('removes exempted expectations', () => {
      const { expectations, exemptions } = resolveExpectationsForRepo(manifest, 'legacy-service');
      expect(expectations.map(e => e.id)).not.toContain('bp-main');
      expect(exemptions).toHaveLength(1);
      expect(exemptions[0].reason).toContain('Legacy');
    });
  });

  describe('validateManifest', () => {
    test('valid manifest passes', () => {
      const result = validateManifest(makeManifest());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('detects missing required fields', () => {
      const result = validateManifest({
        ...makeManifest(),
        orgId: '',
      } as OrgPolicyManifest);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing orgId');
    });

    test('warns on expired exemptions', () => {
      const result = validateManifest(makeManifest({
        exemptions: [{
          repo: 'old-repo',
          expectationIds: ['bp-main'],
          reason: 'temporary',
          approvedBy: 'someone',
          expiresAt: '2020-01-01T00:00:00Z',
        }],
      }));
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('expired');
    });

    test('errors on exemption referencing unknown expectation', () => {
      const result = validateManifest(makeManifest({
        exemptions: [{
          repo: 'some-repo',
          expectationIds: ['nonexistent-id'],
          reason: 'test',
          approvedBy: 'someone',
          expiresAt: futureDate,
        }],
      }));
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('nonexistent-id');
    });
  });
});

// ─── detectGapsForRepo unit tests ────────────────────────────────────

describe('detectGapsForRepo', () => {
  test('detects missing workflow file', () => {
    const expectations: PolicyExpectation[] = [{
      id: 'wf-1',
      name: 'Oracle workflow',
      category: 'workflow-presence',
      severity: 'high',
      requirement: {
        type: 'workflow-presence',
        workflowFile: '.github/workflows/oracle.yml',
      },
    }];

    const gaps = detectGapsForRepo(
      'my-repo',
      makeRepoState('my-repo', { workflowFiles: ['.github/workflows/ci.yml'] }),
      expectations,
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapType).toBe('missing');
    expect(gaps[0].detail).toContain('oracle.yml');
  });

  test('passes when workflow file exists', () => {
    const expectations: PolicyExpectation[] = [{
      id: 'wf-1',
      name: 'Oracle workflow',
      category: 'workflow-presence',
      severity: 'high',
      requirement: {
        type: 'workflow-presence',
        workflowFile: '.github/workflows/oracle.yml',
      },
    }];

    const gaps = detectGapsForRepo(
      'my-repo',
      makeRepoState('my-repo', {
        workflowFiles: ['.github/workflows/oracle.yml', '.github/workflows/ci.yml'],
      }),
      expectations,
    );

    expect(gaps).toHaveLength(0);
  });

  test('returns empty for repos with no applicable expectations', () => {
    const gaps = detectGapsForRepo('my-repo', makeRepoState('my-repo'), []);
    expect(gaps).toHaveLength(0);
  });
});
