/**
 * Tests for MD-100: Semantic Job Drift
 */

import { describe, test, expect } from '@jest/globals';
import { rule } from '../../src/rules/tier-b/MD-100';

// Mock license context — tests always have Pro access
const proContext = (files: Array<{ path: string; content: string }>) => ({
  license: {
    orgId: 'test-org',
    tier: 'pro' as const,
    features: ['tier-b-rules'],
    expiresAt: new Date(Date.now() + 86400000),
    seats: 10,
  },
  files,
  repo: { owner: 'test', name: 'repo' },
  mode: 'pullrequest' as const,
});

// No license context — should throw
const noLicenseContext = (files: Array<{ path: string; content: string }>) => ({
  files,
  repo: { owner: 'test', name: 'repo' },
  mode: 'pullrequest' as const,
});

describe('MD-100: Semantic Job Drift', () => {
  // ─── Metadata ────────────────────────────────────────────────
  test('rule metadata is correct', () => {
    expect(rule.id).toBe('MD-100');
    expect(rule.tier).toBe('B');
    expect(rule.severity).toBe('warn');
    expect(rule.version).toBe('1.0.0');
  });

  // ─── License Gate ────────────────────────────────────────────
  test('throws ProLicenseRequiredError without license', async () => {
    const ctx = noLicenseContext([]);
    await expect(rule.evaluate(ctx)).rejects.toThrow('Pro license');
  });

  // ─── True Positive: misnamed job ─────────────────────────────
  test('detects job named "security-scan" that only lints', async () => {
    const workflow = `
name: CI
on: push
jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run linter
        run: npm run lint
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);

    expect(findings.length).toBeGreaterThanOrEqual(1);
    const finding = findings[0];
    expect(finding.ruleId).toBe('MD-100');
    expect(finding.severity).toBe('warn');
    expect(finding.title).toContain('security-scan');
    expect(finding.title).toContain('security');
    expect(finding.description).toContain('none of its');
  });

  // ─── True Negative: correctly named job ──────────────────────
  test('passes job named "test" that runs jest', async () => {
    const workflow = `
name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - name: Run tests
        run: pnpm test
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBe(0);
  });

  // ─── True Positive: test job with no test runner ─────────────
  test('detects job named "unit-tests" that only builds', async () => {
    const workflow = `
name: CI
on: push
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: npm run build
      - name: Package
        run: npm pack
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].title).toContain('unit-tests');
    expect(findings[0].title).toContain('test');
  });

  // ─── Edge Case: empty job (no steps) ─────────────────────────
  test('skips jobs with no steps', async () => {
    const workflow = `
name: CI
on: push
jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    // Checkout-only jobs are skipped (too common, low signal)
    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBe(0);
  });

  // ─── Edge Case: job with no recognizable intent ──────────────
  test('skips jobs with opaque names', async () => {
    const workflow = `
name: CI
on: push
jobs:
  step-alpha:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo hello
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);
    expect(findings.length).toBe(0);
  });

  // ─── Performance ─────────────────────────────────────────────
  test('evaluates 20 workflow files in under 50ms', async () => {
    const workflows = Array.from({ length: 20 }, (_, i) => ({
      path: `.github/workflows/ci-${i}.yml`,
      content: `
name: CI ${i}
on: push
jobs:
  test-${i}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test
  build-${i}:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build
`,
    }));

    const ctx = proContext(workflows);
    const start = performance.now();
    await rule.evaluate(ctx);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  // ─── Edge Case: malformed YAML ───────────────────────────────
  test('handles malformed YAML without crashing', async () => {
    const ctx = proContext([{
      path: '.github/workflows/broken.yml',
      content: `
this is not: valid yaml
  - at all: {{{}}}
  definitely: broken
`,
    }]);

    // Should not throw — graceful skip
    const findings = await rule.evaluate(ctx);
    expect(Array.isArray(findings)).toBe(true);
  });

  // ─── True Positive: deploy job targeting wrong environment ───
  test('detects staging-named job deploying to production', async () => {
    const workflow = `
name: Deploy
on: push
jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: kubectl apply -f k8s/production/
`;
    const ctx = proContext([{
      path: '.github/workflows/deploy.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);
    const envFinding = findings.find(f => f.title.includes('production'));
    expect(envFinding).toBeDefined();
    expect(envFinding!.severity).toBe('high');
  });

  // ─── Multiple jobs: only flags the bad one ───────────────────
  test('only flags mismatched jobs, not correct ones', async () => {
    const workflow = `
name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm test
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run lint
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm build
`;
    const ctx = proContext([{
      path: '.github/workflows/ci.yml',
      content: workflow,
    }]);

    const findings = await rule.evaluate(ctx);

    // Only security-scan should be flagged
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain('security-scan');
  });
});
