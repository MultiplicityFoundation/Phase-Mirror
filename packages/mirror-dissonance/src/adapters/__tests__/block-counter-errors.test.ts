/**
 * BlockCounter Error Propagation Tests
 *
 * Validates that BlockCounterAdapter implementations throw
 * BlockCounterError on infrastructure failure instead of returning 0
 * or masking errors.
 *
 * Phase 0 contract: adapters throw structured errors, L0 callers
 * implement fail-open behavior (don't trip breaker on counter failure).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters, CloudConfig } from '../types.js';
import { BlockCounterError, AdapterError } from '../errors.js';
import { rm, mkdir, writeFile, chmod } from 'fs/promises';
import { join } from 'path';

describe('BlockCounter Error Propagation', () => {
  let adapters: CloudAdapters;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = `/tmp/test-counter-errors-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };
    adapters = createLocalAdapters(config);
  });

  afterEach(async () => {
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('increment() behavior', () => {
    it('should return 1 on first increment', async () => {
      const count = await adapters.blockCounter.increment('rule-1', 'org-1');
      expect(count).toBe(1);
    });

    it('should return incrementing counts', async () => {
      const count1 = await adapters.blockCounter.increment('rule-1', 'org-1');
      const count2 = await adapters.blockCounter.increment('rule-1', 'org-1');
      expect(count1).toBe(1);
      expect(count2).toBe(2);
    });

    it('should throw BlockCounterError on write failure', async () => {
      // Create read-only directory to force write failure
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), '[]');
      await chmod(testDataDir, 0o444);

      try {
        await expect(
          adapters.blockCounter.increment('rule-1', 'org-1'),
        ).rejects.toThrow(BlockCounterError);

        try {
          await adapters.blockCounter.increment('rule-1', 'org-1');
        } catch (error) {
          const counterError = error as BlockCounterError;
          expect(counterError.code).toBe('INCREMENT_FAILED');
          expect(counterError.context.source).toBe('local-file');
          expect(counterError.context.ruleId).toBe('rule-1');
          expect(counterError.context.orgId).toBe('org-1');
        }
      } finally {
        await chmod(testDataDir, 0o755);
      }
    });
  });

  describe('getCount() behavior', () => {
    it('should return 0 for non-existent rule (not throw)', async () => {
      const count = await adapters.blockCounter.getCount('nonexistent-rule', 'org-1');
      expect(count).toBe(0);
    });

    it('should return correct count after increments', async () => {
      await adapters.blockCounter.increment('rule-1', 'org-1');
      await adapters.blockCounter.increment('rule-1', 'org-1');
      await adapters.blockCounter.increment('rule-1', 'org-1');

      const count = await adapters.blockCounter.getCount('rule-1', 'org-1');
      expect(count).toBe(3);
    });

    it('should throw BlockCounterError on corrupt data', async () => {
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), 'not valid json{{{');

      await expect(
        adapters.blockCounter.getCount('rule-1', 'org-1'),
      ).rejects.toThrow(BlockCounterError);

      try {
        await adapters.blockCounter.getCount('rule-1', 'org-1');
      } catch (error) {
        const counterError = error as BlockCounterError;
        expect(counterError.code).toBe('READ_FAILED');
        expect(counterError.context.source).toBe('local-file');
      }
    });
  });

  describe('isCircuitBroken() behavior', () => {
    it('should return false when count is below threshold', async () => {
      const broken = await adapters.blockCounter.isCircuitBroken('rule-1', 'org-1', 5);
      expect(broken).toBe(false);
    });

    it('should return true when count reaches threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await adapters.blockCounter.increment('rule-1', 'org-1');
      }

      const broken = await adapters.blockCounter.isCircuitBroken('rule-1', 'org-1', 5);
      expect(broken).toBe(true);
    });

    it('should throw BlockCounterError on infrastructure failure', async () => {
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), 'corrupt-data!!!');

      await expect(
        adapters.blockCounter.isCircuitBroken('rule-1', 'org-1', 5),
      ).rejects.toThrow(BlockCounterError);
    });
  });

  describe('error inheritance', () => {
    it('BlockCounterError should be instanceof AdapterError', () => {
      const error = new BlockCounterError(
        'test error',
        'INCREMENT_FAILED',
        { ruleId: 'rule-1' },
      );
      expect(error).toBeInstanceOf(BlockCounterError);
      expect(error).toBeInstanceOf(AdapterError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BlockCounterError');
    });

    it('should preserve structured context for debugging', async () => {
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), '{{bad}}');

      try {
        await adapters.blockCounter.getCount('rule-test', 'org-test');
      } catch (error) {
        const counterError = error as BlockCounterError;
        expect(counterError.message).toBeTruthy();
        expect(counterError.code).toBeTruthy();
        expect(counterError.context).toBeDefined();
        expect(typeof counterError.context).toBe('object');
        expect(counterError.context.originalError).toBeDefined();
      }
    });
  });

  describe('L0 caller patterns', () => {
    it('fail-open: circuit breaker defaults to open on counter failure', async () => {
      // Simulates Oracle circuit breaker behavior
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), '{{corrupt}}');

      const shouldTripCircuitBreaker = async (
        ruleId: string,
        orgId: string,
        threshold: number,
      ): Promise<boolean> => {
        try {
          const count = await adapters.blockCounter.getCount(ruleId, orgId);
          return count >= threshold;
        } catch (error) {
          // L0 fail-open: counter failure is NOT a reason to block PRs
          // Log the error for observability
          expect(error).toBeInstanceOf(BlockCounterError);
          return false; // Don't trip breaker
        }
      };

      const tripped = await shouldTripCircuitBreaker('rule-1', 'org-1', 100);
      expect(tripped).toBe(false); // Fail-open: breaker stays open
    });

    it('fail-open: increment failure is observed but non-blocking', async () => {
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), '{{corrupt}}');

      const warnings: string[] = [];

      const incrementCounter = async (ruleId: string, orgId: string): Promise<void> => {
        try {
          await adapters.blockCounter.increment(ruleId, orgId);
        } catch (error) {
          // L0 fail-open: log warning, continue
          warnings.push(
            `Counter increment failed: ${error instanceof BlockCounterError ? error.code : 'unknown'}`,
          );
        }
      };

      await incrementCounter('rule-1', 'org-1');
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('INCREMENT_FAILED');
    });

    it('distinction: 0 count vs infrastructure failure', async () => {
      // Case 1: Rule never incremented — returns 0 successfully
      const count = await adapters.blockCounter.getCount('never-seen-rule', 'org-1');
      expect(count).toBe(0);

      // Case 2: Infrastructure failure — throws BlockCounterError
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'block-counter.json'), 'CORRUPT');

      // Re-create adapters pointing to the now-corrupted dir
      const brokenAdapters = createLocalAdapters({
        provider: 'local',
        localDataDir: testDataDir,
      });

      await expect(
        brokenAdapters.blockCounter.getCount('any-rule', 'org-1'),
      ).rejects.toThrow(BlockCounterError);
    });
  });
});
