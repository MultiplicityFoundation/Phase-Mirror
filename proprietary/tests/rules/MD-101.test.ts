/**
 * Tests for MD-101: Cross-Repo Protection Gap
 */

import { rule, type OrgContext, type RepoGovernanceState } from '../../src/rules/tier-b/MD-101';
import type { OrgPolicyManifest } from '../../src/rules/tier-b/policy-manifest';
import { resolveExpectationsForRepo, validateManifest } from '../../src/rules/tier-b/policy-manifest';

// ─── Helpers ─────────────────────────────────────────────────────────

const proLicense = {
  orgId: 'test-org',
  tier: 'pro' as const,
  features: ['tier-b-rules'],
  expiresAt: new Date(Date.now() + 86400000),
  seats: 10,
};

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
      requiredStatusChecks: ['oracle-check', 'test', 'lint'],
      requireStrictStatusChecks: true,
    },
    workflows: [
      { path: '.github/workflows/ci.yml', jobNames: ['test', 'lint'] },
      { path: '.github/workflows/oracle.yml', jobNames: ['oracle-check'] },
    ],
    defaultPermissions: 'read' as const,
    codeowners: { exists: true, coveredPaths: ['.github/workflows/', 'src/'] },
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
    defaults: [
      {
        id: 'bp-main',
        name: 'Branch protection on main',
        category: 'branch-protection',
        requirement: {
          type: 'branch-protection',
          branch: 'main',
          requirePullRequest: true,
          requiredReviewers: 1,
          enforceAdmins: true,
        },
        severity: 'critical',
      },
      {
        id: 'sc-oracle',
        name: 'Oracle check required',
        category: 'status-checks',
        requirement: {
          type: 'status-checks',
          branch: 'main',
          requiredChecks: ['oracle-check'],
        },
        severity: 'high',
      },
      {
        id: 'wf-oracle',
        name: 'Oracle workflow exists',
        category: 'workflow-presence',
        requirement: {
          type: 'workflow-presence',
          workflowFile: '.github/workflows/oracle.yml',
          requiredJobs: ['oracle-check'],
        },
        severity: 'high',
      },
      {
        id: 'perm-read',
        name: 'Default permissions read-only',
        category: 'permissions',
        requirement: {
          type: 'permissions',
          maxDefaultPermissions: 'read',
        },
        severity: 'medium',
      },
    ],
    classifications: [],
    exemptions: [],
    ...overrides,
  };
}

function makeContext(orgContext?: OrgContext) {
  return {
    license: proLicense,
    files: [],
    repo: { owner: 'test-org', name: 'primary-repo' },
    mode: 'pullrequest' as const,
    ...(orgContext ? { orgContext } : {}),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('MD-101: Cross-Repo Protection Gap', () => {

  // ─── Metadata ──────────────────────────────────────────────
  test('rule metadata is correct', () => {
    expect(rule.id).toBe('MD-101');
    expect(rule.tier).toBe('B');
    expect(rule.version).toBe('1.0.0');
    expect(rule.category).toBe('governance');
  });

  // ─── License Gate ──────────────────────────────────────────
  test('throws without Pro license', async () => {
    const ctx = { files: [], repo: { owner: 'test', name: 'repo' }, mode: 'pullrequest' as const };
    await expect(rule.evaluate(ctx)).rejects.toThrow('Pro license');
  });

  // ─── No Org Context ────────────────────────────────────────
  test('emits informational finding when orgContext is missing', async () => {
    const ctx = makeContext();
    const findings = await rule.evaluate(ctx);

    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].title).toContain('requires organization context');
  });

  // ─── All Repos Compliant ───────────────────────────────────
  test('produces no gap findings when all repos comply', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest(),
      repos: [
        makeRepo({ fullName: 'test-org/api-gateway' }),
        makeRepo({ fullName: 'test-org/payment-service' }),
        makeRepo({ fullName: 'test-org/user-service' }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    // No gap findings (might have coverage summary if < 80% but with 3/3 covered it's 100%)
    const gapFindings = findings.filter(f => !f.title.includes('coverage'));
    expect(gapFindings.length).toBe(0);
  });

  // ─── Missing Branch Protection ─────────────────────────────
  test('detects repo missing branch protection', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest(),
      repos: [
        makeRepo({ fullName: 'test-org/api-gateway' }),
        makeRepo({
          fullName: 'test-org/unprotected-repo',
          branchProtection: null,
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    const bpGap = findings.find(f =>
      f.title.includes('unprotected-repo') && f.title.includes('Branch protection')
    );
    expect(bpGap).toBeDefined();
    expect(bpGap!.severity).toBe('critical');
  });

  // ─── Missing Status Check ─────────────────────────────────
  test('detects repo missing oracle-check status check', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest(),
      repos: [
        makeRepo({ fullName: 'test-org/api-gateway' }),
        makeRepo({
          fullName: 'test-org/missing-oracle',
          branchProtection: {
            branch: 'main',
            enabled: true,
            requirePullRequest: true,
            requiredReviewers: 2,
            dismissStaleReviews: true,
            requireCodeOwnerReviews: true,
            enforceAdmins: true,
            requiredStatusChecks: ['test', 'lint'], // missing oracle-check!
            requireStrictStatusChecks: true,
          },
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    const scGap = findings.find(f =>
      f.title.includes('missing-oracle') && f.title.includes('oracle-check')
    );
    expect(scGap).toBeDefined();
    expect(scGap!.severity).toBe('high');
  });

  // ─── Intentional Exemption ─────────────────────────────────
  test('respects valid exemptions — no finding for exempted repo', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest({
        exemptions: [{
          repo: 'docs-site',
          expectationIds: ['bp-main', 'sc-oracle', 'wf-oracle'],
          reason: 'Static docs site — no executable code, no governance risk',
          approvedBy: 'steward@example.com',
          expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(), // 90 days
          ticket: 'GOV-42',
        }],
      }),
      repos: [
        makeRepo({ fullName: 'test-org/api-gateway' }),
        makeRepo({
          fullName: 'test-org/docs-site',
          branchProtection: null, // Would normally trigger a finding
          workflows: [],
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    // docs-site should NOT produce bp-main, sc-oracle, or wf-oracle gaps
    const docFindings = findings.filter(f => f.title.includes('docs-site'));
    // May still have perm-read gap (not exempted)
    const exemptedGaps = docFindings.filter(f =>
      f.title.includes('Branch protection') ||
      f.title.includes('oracle-check') ||
      f.title.includes('Oracle workflow')
    );
    expect(exemptedGaps.length).toBe(0);
  });

  // ─── Expired Exemption ─────────────────────────────────────
  test('flags expired exemptions', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest({
        exemptions: [{
          repo: 'legacy-app',
          expectationIds: ['bp-main'],
          reason: 'Legacy migration — temporary bypass',
          approvedBy: 'steward@example.com',
          expiresAt: '2025-01-01T00:00:00Z', // In the past
          ticket: 'GOV-99',
        }],
      }),
      repos: [
        makeRepo({
          fullName: 'test-org/legacy-app',
          branchProtection: null,
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    // Should have both: a gap finding (exemption expired, so gap is back)
    // AND an expired exemption finding
    const expiredFinding = findings.find(f => f.title.includes('expired'));
    expect(expiredFinding).toBeDefined();
    expect(expiredFinding!.severity).toBe('medium');

    const gapFinding = findings.find(f =>
      f.title.includes('legacy-app') && f.title.includes('Branch protection')
    );
    expect(gapFinding).toBeDefined();
  });

  // ─── Classification Matching ───────────────────────────────
  test('applies classification-specific expectations', async () => {
    const manifest = makeManifest({
      classifications: [{
        name: 'Production Services',
        description: 'Services handling customer data',
        match: { patterns: ['*-service'] },
        expectations: [{
          id: 'co-security',
          name: 'CODEOWNERS for security paths',
          category: 'codeowners',
          requirement: {
            type: 'codeowners',
            requiredPaths: ['.github/workflows/', 'src/security/'],
          },
          severity: 'high',
        }],
      }],
    });

    const orgContext: OrgContext = {
      manifest,
      repos: [
        makeRepo({
          fullName: 'test-org/payment-service',
          codeowners: { exists: true, coveredPaths: ['.github/workflows/'] },
          // Missing src/security/ in CODEOWNERS
        }),
        makeRepo({
          fullName: 'test-org/docs-site', // Doesn't match *-service pattern
          codeowners: { exists: false, coveredPaths: [] },
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    // payment-service should have CODEOWNERS gap for src/security/
    const coGap = findings.find(f =>
      f.title.includes('payment-service') && f.title.includes('CODEOWNERS')
    );
    expect(coGap).toBeDefined();

    // docs-site should NOT have the CODEOWNERS-for-security gap (doesn't match classification)
    const docsCoGap = findings.find(f =>
      f.title.includes('docs-site') && f.title.includes('security')
    );
    expect(docsCoGap).toBeUndefined();
  });

  // ─── Archived Repos Skipped ────────────────────────────────
  test('skips archived repos', async () => {
    const orgContext: OrgContext = {
      manifest: makeManifest(),
      repos: [
        makeRepo({
          fullName: 'test-org/archived-repo',
          meta: {
            topics: [],
            language: 'TypeScript',
            visibility: 'private',
            archived: true,
            defaultBranch: 'main',
          },
          branchProtection: null,
        }),
      ],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    const archivedGaps = findings.filter(f => f.title.includes('archived-repo'));
    expect(archivedGaps.length).toBe(0);
  });

  // ─── Invalid Manifest ──────────────────────────────────────
  test('rejects invalid manifest with high-severity finding', async () => {
    const orgContext: OrgContext = {
      manifest: {
        schemaVersion: '1.0.0',
        orgId: '', // Invalid: empty
        updatedAt: '',
        approvedBy: '',
        defaults: [],
        classifications: [],
        exemptions: [{
          repo: 'test',
          expectationIds: ['nonexistent'],
          reason: '',  // Invalid: empty
          approvedBy: '',
          expiresAt: '',  // Invalid: empty
        }],
      },
      repos: [],
    };

    const ctx = makeContext(orgContext);
    const findings = await rule.evaluate(ctx);

    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe('high');
    expect(findings[0].title).toContain('invalid');
  });

  // ─── Performance: 50 Repos ─────────────────────────────────
  test('evaluates 50 repos in under 100ms', async () => {
    const repos = Array.from({ length: 50 }, (_, i) =>
      makeRepo({ fullName: `test-org/repo-${i}` })
    );
    // Make 10 of them have gaps
    for (let i = 0; i < 10; i++) {
      repos[i].branchProtection = null;
    }

    const orgContext: OrgContext = {
      manifest: makeManifest(),
      repos,
    };

    const ctx = makeContext(orgContext);
    const start = performance.now();
    const findings = await rule.evaluate(ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(findings.length).toBeGreaterThan(0);
  });
});

// ─── Policy Manifest Unit Tests ──────────────────────────────────────

describe('Policy Manifest', () => {
  test('resolveExpectationsForRepo applies defaults', () => {
    const manifest = makeManifest();
    const { expectations } = resolveExpectationsForRepo(manifest, 'any-repo');
    expect(expectations.length).toBe(4); // 4 defaults
  });

  test('resolveExpectationsForRepo adds classification expectations', () => {
    const manifest = makeManifest({
      classifications: [{
        name: 'Services',
        description: 'Service repos',
        match: { patterns: ['*-service'] },
        expectations: [{
          id: 'extra-1',
          name: 'Extra check',
          category: 'status-checks',
          requirement: { type: 'status-checks', branch: 'main', requiredChecks: ['extra'] },
          severity: 'medium',
        }],
      }],
    });

    const { expectations } = resolveExpectationsForRepo(manifest, 'payment-service');
    expect(expectations.length).toBe(5); // 4 defaults + 1 classification
  });

  test('resolveExpectationsForRepo removes exempted expectations', () => {
    const manifest = makeManifest({
      exemptions: [{
        repo: 'docs-site',
        expectationIds: ['bp-main', 'sc-oracle'],
        reason: 'Static site',
        approvedBy: 'admin',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }],
    });

    const { expectations } = resolveExpectationsForRepo(manifest, 'docs-site');
    expect(expectations.length).toBe(2); // 4 defaults - 2 exempted
    expect(expectations.find(e => e.id === 'bp-main')).toBeUndefined();
  });

  test('resolveExpectationsForRepo ignores expired exemptions', () => {
    const manifest = makeManifest({
      exemptions: [{
        repo: 'docs-site',
        expectationIds: ['bp-main'],
        reason: 'Expired',
        approvedBy: 'admin',
        expiresAt: '2020-01-01T00:00:00Z', // Past
      }],
    });

    const { expectations } = resolveExpectationsForRepo(manifest, 'docs-site');
    expect(expectations.length).toBe(4); // Exemption expired, so all 4 defaults apply
  });

  test('validateManifest catches errors', () => {
    const result = validateManifest({
      schemaVersion: '1.0.0',
      orgId: '',
      updatedAt: '',
      approvedBy: '',
      defaults: [],
      classifications: [],
      exemptions: [{
        repo: 'test',
        expectationIds: ['fake-id'],
        reason: '',
        approvedBy: '',
        expiresAt: '',
      }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('glob matching works for patterns', () => {
    const manifest = makeManifest({
      classifications: [{
        name: 'APIs',
        description: 'API repos',
        match: { patterns: ['api-*', '*-gateway'] },
        expectations: [{
          id: 'api-extra',
          name: 'API check',
          category: 'status-checks',
          requirement: { type: 'status-checks', branch: 'main', requiredChecks: ['api-test'] },
          severity: 'medium',
        }],
      }],
    });

    const { expectations: apiMatch } = resolveExpectationsForRepo(manifest, 'api-users');
    expect(apiMatch.find(e => e.id === 'api-extra')).toBeDefined();

    const { expectations: gwMatch } = resolveExpectationsForRepo(manifest, 'payment-gateway');
    expect(gwMatch.find(e => e.id === 'api-extra')).toBeDefined();

    const { expectations: noMatch } = resolveExpectationsForRepo(manifest, 'docs-site');
    expect(noMatch.find(e => e.id === 'api-extra')).toBeUndefined();
  });
});
