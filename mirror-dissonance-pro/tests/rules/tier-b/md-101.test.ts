/**
 * Tests for MD-101: Cross-Repo Protection Gap
 *
 * Covers: true positive, true negative, edge case, performance, error handling
 */

import { describe, it, expect } from '@jest/globals';
import {
  md101,
  extractCrossRepoTriggers,
  findProtectionGaps,
  findUnprotectedReceivers,
} from '../../../src/rules/tier-b/md-101';
import type { AnalysisContext, RepoDependencyEdge } from '../../../src/rules/tier-b/index';

function makeContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    repositoryName: 'test-org/repo-a',
    ...overrides,
  };
}

describe('MD-101: Cross-Repo Protection Gap', () => {
  describe('rule metadata', () => {
    it('has correct id, tier, and version', () => {
      expect(md101.id).toBe('MD-101');
      expect(md101.tier).toBe('B');
      expect(md101.version).toBe('1.0.0');
      expect(md101.name).toBe('Cross-Repo Protection Gap');
    });
  });

  describe('true positive — unprotected repository_dispatch', () => {
    it('flags repo graph edge with no protection', async () => {
      const context = makeContext({
        repoGraph: [{
          sourceRepo: 'test-org/repo-a',
          targetRepo: 'test-org/repo-b',
          triggerType: 'repository_dispatch',
          protectionLevel: 'none',
        }],
      });

      const findings = await md101.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(1);

      const gap = findings.find((f) => f.metadata?.gapType === 'unprotected');
      expect(gap).toBeDefined();
      expect(gap!.severity).toBe('block');
      expect(gap!.title).toContain('repo-a');
      expect(gap!.title).toContain('repo-b');
    });
  });

  describe('true positive — unvalidated dispatch receiver', () => {
    it('flags workflow that accepts repository_dispatch without token check', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/deploy.yml',
          name: 'Deploy',
          content: 'on:\n  repository_dispatch:\n    types: [deploy]\njobs:\n  deploy:\n    runs-on: ubuntu-latest',
          jobs: [{
            id: 'deploy',
            name: 'deploy',
            steps: [{ name: 'Deploy', run: 'kubectl apply -f deploy.yml' }],
          }],
        }],
      });

      const findings = await md101.evaluate(context);
      const receiver = findings.find((f) => f.metadata?.gapType === 'unvalidated-receiver');
      expect(receiver).toBeDefined();
      expect(receiver!.filePath).toBe('.github/workflows/deploy.yml');
    });
  });

  describe('true positive — transitive chain', () => {
    it('detects A → B → C transitive dependency', async () => {
      const context = makeContext({
        repoGraph: [
          {
            sourceRepo: 'org/repo-a',
            targetRepo: 'org/repo-b',
            triggerType: 'repository_dispatch',
            protectionLevel: 'none',
          },
          {
            sourceRepo: 'org/repo-b',
            targetRepo: 'org/repo-c',
            triggerType: 'workflow_call',
            protectionLevel: 'partial',
          },
        ],
      });

      const findings = await md101.evaluate(context);
      const transitive = findings.find((f) => f.metadata?.gapType === 'transitive-chain');
      expect(transitive).toBeDefined();
      expect((transitive!.metadata?.chain as string[])).toEqual([
        'org/repo-a', 'org/repo-b', 'org/repo-c',
      ]);
    });
  });

  describe('true negative — no cross-repo dependencies', () => {
    it('returns empty findings for isolated repo', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: 'on: push\njobs:\n  test:\n    runs-on: ubuntu-latest',
          jobs: [{
            id: 'test',
            name: 'test',
            steps: [{ name: 'Test', run: 'npm test' }],
          }],
        }],
      });

      const findings = await md101.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('true negative — fully protected edge', () => {
    it('returns no gap findings for fully protected dependency', async () => {
      const context = makeContext({
        repoGraph: [{
          sourceRepo: 'org/repo-a',
          targetRepo: 'org/repo-b',
          triggerType: 'workflow_call',
          protectionLevel: 'full',
        }],
      });

      const findings = await md101.evaluate(context);
      const gapFindings = findings.filter(
        (f) => f.metadata?.gapType === 'unprotected' || f.metadata?.gapType === 'weak',
      );
      expect(gapFindings).toHaveLength(0);
    });
  });

  describe('edge case — workflow_call reusable workflow detection', () => {
    it('detects cross-repo reusable workflow calls in steps', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build',
            name: 'build',
            steps: [{
              name: 'Call shared workflow',
              uses: 'shared-org/shared-repo/.github/workflows/build.yml@main',
            }],
          }],
        }],
      });

      const edges = extractCrossRepoTriggers(context);
      expect(edges.length).toBeGreaterThanOrEqual(1);
      const edge = edges.find((e) => e.targetRepo === 'shared-org/shared-repo');
      expect(edge).toBeDefined();
      expect(edge!.triggerType).toBe('workflow_call');
    });
  });

  describe('performance — handles large dependency graph', () => {
    it('evaluates 50 edges in under 100ms', async () => {
      const edges: RepoDependencyEdge[] = Array.from({ length: 50 }, (_, i) => ({
        sourceRepo: `org/repo-${i}`,
        targetRepo: `org/repo-${i + 1}`,
        triggerType: 'repository_dispatch' as const,
        protectionLevel: i % 3 === 0 ? 'none' as const : 'partial' as const,
      }));

      const context = makeContext({ repoGraph: edges });

      const start = performance.now();
      await md101.evaluate(context);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('error handling — empty workflows and graph', () => {
    it('handles undefined workflows gracefully', async () => {
      const context = makeContext({ workflows: undefined, repoGraph: undefined });
      const findings = await md101.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('helper: findProtectionGaps', () => {
    it('identifies unprotected edges', () => {
      const edges: RepoDependencyEdge[] = [
        { sourceRepo: 'a', targetRepo: 'b', triggerType: 'repository_dispatch', protectionLevel: 'none' },
        { sourceRepo: 'b', targetRepo: 'c', triggerType: 'workflow_call', protectionLevel: 'full' },
      ];

      const gaps = findProtectionGaps(edges);
      expect(gaps).toHaveLength(1);
      expect(gaps[0].edge.sourceRepo).toBe('a');
    });
  });
});
