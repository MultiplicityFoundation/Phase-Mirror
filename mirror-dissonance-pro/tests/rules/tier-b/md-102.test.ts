/**
 * Tests for MD-102: Runner Trust Chain Break
 *
 * Covers: true positive, true negative, edge case, performance, error handling
 */

import { describe, it, expect } from '@jest/globals';
import {
  md102,
  isSelfHosted,
  hasAttestation,
  evaluateRunnerGroup,
  GITHUB_HOSTED_LABELS,
} from '../../../src/rules/tier-b/md-102';
import type { AnalysisContext, RunnerGroup, WorkflowJob } from '../../../src/rules/tier-b/index';

function makeContext(overrides: Partial<AnalysisContext> = {}): AnalysisContext {
  return {
    repositoryName: 'test-org/test-repo',
    ...overrides,
  };
}

describe('MD-102: Runner Trust Chain Break', () => {
  describe('rule metadata', () => {
    it('has correct id, tier, and version', () => {
      expect(md102.id).toBe('MD-102');
      expect(md102.tier).toBe('B');
      expect(md102.version).toBe('1.0.0');
      expect(md102.name).toBe('Runner Trust Chain Break');
    });
  });

  describe('true positive — self-hosted runner with no attestation', () => {
    it('flags self-hosted job without verification steps', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build',
            name: 'build',
            runsOn: ['self-hosted', 'linux'],
            steps: [
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Build', run: 'make build' },
            ],
          }],
        }],
      });

      const findings = await md102.evaluate(context);
      expect(findings.length).toBeGreaterThanOrEqual(1);

      const noAttestation = findings.find((f) => f.metadata?.breakType === 'no-job-attestation');
      expect(noAttestation).toBeDefined();
      expect(noAttestation!.ruleId).toBe('MD-102');
      expect(noAttestation!.severity).toBe('warn');
    });
  });

  describe('true positive — generic self-hosted label', () => {
    it('flags job using only "self-hosted" label', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'deploy',
            name: 'deploy',
            runsOn: 'self-hosted',
            steps: [
              { name: 'Deploy', run: 'kubectl apply -f .' },
            ],
          }],
        }],
      });

      const findings = await md102.evaluate(context);
      const generic = findings.find((f) => f.metadata?.breakType === 'generic-label');
      expect(generic).toBeDefined();
      expect(generic!.title).toContain('generic');
    });
  });

  describe('true positive — runner group with no restrictions', () => {
    it('flags unrestricted runner group', async () => {
      const context = makeContext({
        runnerGroups: [{
          id: 'rg-1',
          name: 'production-runners',
          labels: ['self-hosted', 'linux', 'x64'],
          isHosted: false,
          restrictedTo: [],
          attestationEnabled: false,
        }],
      });

      const findings = await md102.evaluate(context);
      const unrestricted = findings.find((f) => f.metadata?.breakType === 'unrestricted-group');
      expect(unrestricted).toBeDefined();
      expect(unrestricted!.severity).toBe('block');
    });
  });

  describe('true negative — GitHub-hosted runner', () => {
    it('returns no findings for ubuntu-latest', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'test',
            name: 'test',
            runsOn: 'ubuntu-latest',
            steps: [
              { name: 'Test', run: 'npm test' },
            ],
          }],
        }],
      });

      const findings = await md102.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('true negative — self-hosted with attestation', () => {
    it('returns no attestation finding when harden-runner is used', async () => {
      const context = makeContext({
        workflows: [{
          path: '.github/workflows/ci.yml',
          name: 'CI',
          content: '',
          jobs: [{
            id: 'build',
            name: 'build',
            runsOn: ['self-hosted', 'linux', 'production'],
            steps: [
              { name: 'Harden runner', uses: 'step-security/harden-runner@v2' },
              { name: 'Checkout', uses: 'actions/checkout@v4' },
              { name: 'Build', run: 'make build' },
            ],
          }],
        }],
      });

      const findings = await md102.evaluate(context);
      const attestationFindings = findings.filter(
        (f) => f.metadata?.breakType === 'no-job-attestation',
      );
      expect(attestationFindings).toHaveLength(0);
    });
  });

  describe('edge case — runner group that is GitHub-hosted', () => {
    it('skips hosted runner groups', async () => {
      const context = makeContext({
        runnerGroups: [{
          id: 'rg-hosted',
          name: 'GitHub Actions',
          labels: ['ubuntu-latest'],
          isHosted: true,
        }],
      });

      const findings = await md102.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('edge case — no workflows and no runner groups', () => {
    it('returns empty findings', async () => {
      const context = makeContext();
      const findings = await md102.evaluate(context);
      expect(findings).toHaveLength(0);
    });
  });

  describe('performance — handles many jobs and groups', () => {
    it('evaluates 100 jobs in under 100ms', async () => {
      const jobs: WorkflowJob[] = Array.from({ length: 100 }, (_, i) => ({
        id: `job-${i}`,
        name: `job-${i}`,
        runsOn: i % 2 === 0 ? ['self-hosted', 'linux'] : 'ubuntu-latest',
        steps: [{ name: 'Work', run: 'echo ok' }],
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
      await md102.evaluate(context);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('error handling — runner group with undefined fields', () => {
    it('handles runner group with no restrictedTo or verificationSteps', async () => {
      const group: RunnerGroup = {
        id: 'rg-2',
        name: 'legacy-runners',
        labels: ['self-hosted'],
        isHosted: false,
        // restrictedTo, attestationEnabled, verificationSteps all undefined
      };

      const findings = evaluateRunnerGroup(group);
      expect(findings.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('helper: isSelfHosted', () => {
    it('returns true for self-hosted label', () => {
      expect(isSelfHosted('self-hosted')).toBe(true);
      expect(isSelfHosted(['self-hosted', 'linux'])).toBe(true);
    });

    it('returns false for GitHub-hosted runners', () => {
      expect(isSelfHosted('ubuntu-latest')).toBe(false);
      expect(isSelfHosted('macos-14')).toBe(false);
      expect(isSelfHosted('windows-2022')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isSelfHosted(undefined)).toBe(false);
    });
  });

  describe('helper: hasAttestation', () => {
    it('detects harden-runner action', () => {
      const job: WorkflowJob = {
        id: 'j1',
        name: 'j1',
        steps: [
          { name: 'Harden', uses: 'step-security/harden-runner@v2' },
          { name: 'Build', run: 'make' },
        ],
      };
      const result = hasAttestation(job);
      expect(result.hasIt).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
    });

    it('detects cosign verification in run step', () => {
      const job: WorkflowJob = {
        id: 'j2',
        name: 'j2',
        steps: [
          { name: 'Verify', run: 'cosign verify --key cosign.pub image:tag' },
        ],
      };
      const result = hasAttestation(job);
      expect(result.hasIt).toBe(true);
    });

    it('returns false for job with no attestation', () => {
      const job: WorkflowJob = {
        id: 'j3',
        name: 'j3',
        steps: [
          { name: 'Build', run: 'make build' },
        ],
      };
      const result = hasAttestation(job);
      expect(result.hasIt).toBe(false);
    });
  });
});
