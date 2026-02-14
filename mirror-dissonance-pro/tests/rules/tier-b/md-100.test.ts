/**
 * Tests for MD-100: Semantic Job Drift
 *
 * Covers: true positive, true negative, edge case, performance, error handling
 */

import { describe, it, expect } from '@jest/globals';
import { md100, categoriesFromName, categoriesFromSteps, tokenize } from '../../../src/rules/tier-b/md-100';
import type { AnalysisContext, WorkflowJob } from '../../../src/rules/tier-b/index';

function makeContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    repositoryName: 'test-org/test-repo',
    ...overrides,
  };
}

describe('MD-100: Semantic Job Drift', () => {
  describe('rule metadata', () => {
    it('has correct id, tier, and version', () => {
      expect(md100.id).toBe('MD-100');
      expect(md100.tier).toBe('B');
      expect(md100.version).toBe('1.0.0');
      expect(md100.name).toBe('Semantic Job Drift');
    });
  });

  describe('true positive — name implies security but steps only lint', () => {
    it('detects job named "security-scan" that only runs eslint', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'security-scan',
            name: 'security-scan',
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Lint', run: 'npx eslint .' },
            ],
          }],
        }],
      });

      const findings = await md100.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(1);

      const securityDrift = findings.find(
        (f) => f.metadata?.expectedCategory === 'security',
      );
      expect(securityDrift).toBeDefined();
      expect(securityDrift!.ruleId).toBe('MD-100');
      expect(securityDrift!.severity).toBe('warn');
      expect(securityDrift!.title).toContain('security');
      expect(securityDrift!.metadata?.driftType).toBe('name-without-substance');
    });
  });

  describe('true positive — steps do deploy but name says "test"', () => {
    it('detects undeclared deployment in a test job', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'test',
            name: 'test',
            steps: [
              { name: 'Run tests', run: 'npm test' },
              { name: 'Deploy', run: 'kubectl apply -f deploy.yml' },
            ],
          }],
        }],
      });

      const findings = await md100.evaluate(context);
      const deployDrift = findings.find(
        (f) => f.metadata?.driftType === 'undeclared-scope' &&
               (f.metadata?.undeclaredCategories as string[])?.includes('deploy'),
      );
      expect(deployDrift).toBeDefined();
      expect(deployDrift!.title).toContain('undeclared');
    });
  });

  describe('true negative — well-named job', () => {
    it('returns no findings for a build job that actually builds', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build',
            name: 'build',
            steps: [
              { name: 'Setup Node', uses: 'actions/setup-node@v4' },
              { name: 'Install', run: 'npm ci' },
              { name: 'Build', run: 'npm run build' },
            ],
          }],
        }],
      });

      const findings = await md100.evaluate(context);
      const driftFindings = findings.filter(
        (f) => f.metadata?.driftType === 'name-without-substance',
      );
      expect(driftFindings).toHaveLength(0);
    });
  });

  describe('true negative — no workflows', () => {
    it('returns empty findings when no workflows exist', async () => {
      const context = makeContext({ workflows: [] });
      const findings = await md100.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('edge case — job with no semantic name', () => {
    it('skips jobs with unrecognizable names', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'j1',
            name: 'my-custom-thing',
            steps: [
              { name: 'Do stuff', run: 'echo "hello"' },
            ],
          }],
        }],
      });

      const findings = await md100.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('edge case — multi-purpose job with correct name', () => {
    it('handles build-and-test job with both activities', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build-and-test',
            name: 'build-and-test',
            steps: [
              { name: 'Setup', uses: 'actions/setup-node@v4' },
              { name: 'Build', run: 'npm run build' },
              { name: 'Test', run: 'npm test' },
            ],
          }],
        }],
      });

      const findings = await md100.evaluate(context);
      const driftFindings = findings.filter(
        (f) => f.metadata?.driftType === 'name-without-substance',
      );
      expect(driftFindings).toHaveLength(0);
    });
  });

  describe('performance — handles large workflow sets', () => {
    it('evaluates 100 jobs in under 100ms', async () => {
      const jobs: WorkflowJob[] = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        name: i % 2 === 0 ? `build-${i}` : `test-${i}`,
        steps: [
          { name: 'Do work', run: i % 2 === 0 ? 'npm run build' : 'npm test' },
        ],
      }));

      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs,
        }],
      });

      const start = performance.now();
      await md100.evaluate(context);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('error handling — malformed job', () => {
    it('handles job with empty steps array', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build',
            name: 'build',
            steps: [],
          }],
        }],
      });

      // Should detect name-without-substance since no steps deliver "build"
      const findings = await md100.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0].metadata?.driftType).toBe('name-without-substance');
    });
  });

  describe('helper: tokenize', () => {
    it('splits kebab-case and snake_case', () => {
      expect(tokenize('build-and-test')).toEqual(['build', 'and', 'test']);
      expect(tokenize('security_scan')).toEqual(['security', 'scan']);
    });
  });

  describe('helper: categoriesFromName', () => {
    it('detects build category', () => {
      expect(categoriesFromName('build')).toContain('build');
      expect(categoriesFromName('compile-project')).toContain('build');
    });

    it('detects multiple categories', () => {
      const cats = categoriesFromName('build-and-test');
      expect(cats).toContain('build');
      expect(cats).toContain('test');
    });
  });

  describe('helper: categoriesFromSteps', () => {
    it('detects test steps', () => {
      const job: WorkflowJob = {
        id: 'j1',
        name: 'j1',
        steps: [{ name: 'Test', run: 'jest --coverage' }],
      };
      expect(categoriesFromSteps(job)).toContain('test');
    });
  });
});
