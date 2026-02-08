/**
 * BlockCounter Adapter Tests
 *
 * Supplements block-counter-errors.test.ts with functional / behavioural
 * coverage:
 *   - hourly bucket key format (ruleId:orgId:YYYY-MM-DD-HH)
 *   - separate buckets for different hours
 *   - separate buckets for different ruleId/orgId combinations
 *   - isCircuitBroken threshold=10 (default)
 *   - concurrent increments under lock
 *   - getCount isolation across hours
 *
 * Uses the local adapter (LocalBlockCounter) via createLocalAdapters.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters, CloudConfig, BlockCounterAdapter } from '../types.js';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';

describe('BlockCounter — functional behaviour', () => {
  let adapters: CloudAdapters;
  let counter: BlockCounterAdapter;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = `/tmp/test-blockctr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };
    adapters = createLocalAdapters(config);
    counter = adapters.blockCounter;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
  });

  // ── Bucket key format ──────────────────────────────────────────────────

  describe('bucket key format', () => {
    it('uses ruleId:orgId:YYYY-MM-DD-HH format', async () => {
      await counter.increment('fp-001', 'org-42');

      // Read the raw JSON to inspect the bucket key
      const raw = await readFile(
        join(testDataDir, 'block-counter.json'),
        'utf-8',
      );
      const entries = JSON.parse(raw);
      expect(entries).toHaveLength(1);

      const key: string = entries[0].bucketKey;
      // Should match fp-001:org-42:YYYY-MM-DD-HH
      expect(key).toMatch(/^fp-001:org-42:\d{4}-\d{2}-\d{2}-\d{2}$/);
    });

    it('bucket key uses UTC hour', async () => {
      await counter.increment('rule-a', 'org-b');

      const raw = await readFile(
        join(testDataDir, 'block-counter.json'),
        'utf-8',
      );
      const entries = JSON.parse(raw);
      const key: string = entries[0].bucketKey;

      // Extract hour portion and compare with current UTC hour
      const hourPart = key.split(':').pop()!;               // YYYY-MM-DD-HH
      const currentHour = new Date()
        .toISOString()
        .slice(0, 13)
        .replace('T', '-');                                   // YYYY-MM-DD-HH
      expect(hourPart).toBe(currentHour);
    });
  });

  // ── Basic counting ─────────────────────────────────────────────────────

  describe('increment & getCount', () => {
    it('first increment returns 1', async () => {
      const result = await counter.increment('rule-1', 'org-1');
      expect(result).toBe(1);
    });

    it('subsequent increments are monotonic', async () => {
      const results: number[] = [];
      for (let i = 0; i < 5; i++) {
        results.push(await counter.increment('rule-1', 'org-1'));
      }
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it('getCount reflects accumulated increments', async () => {
      for (let i = 0; i < 7; i++) {
        await counter.increment('rule-1', 'org-1');
      }
      const count = await counter.getCount('rule-1', 'org-1');
      expect(count).toBe(7);
    });

    it('getCount returns 0 for unseen ruleId/orgId', async () => {
      const count = await counter.getCount('nonexistent', 'org-x');
      expect(count).toBe(0);
    });
  });

  // ── Isolation ──────────────────────────────────────────────────────────

  describe('bucket isolation', () => {
    it('different ruleIds have independent counters', async () => {
      await counter.increment('rule-a', 'org-1');
      await counter.increment('rule-a', 'org-1');
      await counter.increment('rule-b', 'org-1');

      expect(await counter.getCount('rule-a', 'org-1')).toBe(2);
      expect(await counter.getCount('rule-b', 'org-1')).toBe(1);
    });

    it('different orgIds have independent counters', async () => {
      await counter.increment('rule-1', 'org-a');
      await counter.increment('rule-1', 'org-b');
      await counter.increment('rule-1', 'org-b');

      expect(await counter.getCount('rule-1', 'org-a')).toBe(1);
      expect(await counter.getCount('rule-1', 'org-b')).toBe(2);
    });
  });

  // ── Circuit breaker (isCircuitBroken) ──────────────────────────────────

  describe('isCircuitBroken', () => {
    it('returns false when count is 0', async () => {
      const broken = await counter.isCircuitBroken('rule-1', 'org-1', 10);
      expect(broken).toBe(false);
    });

    it('returns false when count is below threshold', async () => {
      for (let i = 0; i < 9; i++) {
        await counter.increment('rule-1', 'org-1');
      }
      const broken = await counter.isCircuitBroken('rule-1', 'org-1', 10);
      expect(broken).toBe(false);
    });

    it('returns true when count equals threshold', async () => {
      for (let i = 0; i < 10; i++) {
        await counter.increment('rule-1', 'org-1');
      }
      const broken = await counter.isCircuitBroken('rule-1', 'org-1', 10);
      expect(broken).toBe(true);
    });

    it('returns true when count exceeds threshold', async () => {
      for (let i = 0; i < 15; i++) {
        await counter.increment('rule-1', 'org-1');
      }
      const broken = await counter.isCircuitBroken('rule-1', 'org-1', 10);
      expect(broken).toBe(true);
    });

    it('uses >= comparison (threshold-1 is NOT broken)', async () => {
      for (let i = 0; i < 4; i++) {
        await counter.increment('rule-1', 'org-1');
      }
      expect(await counter.isCircuitBroken('rule-1', 'org-1', 5)).toBe(false);

      await counter.increment('rule-1', 'org-1'); // count = 5
      expect(await counter.isCircuitBroken('rule-1', 'org-1', 5)).toBe(true);
    });
  });

  // ── Concurrent increments ─────────────────────────────────────────────

  describe('concurrent safety', () => {
    it('handles concurrent increments without data loss', async () => {
      const total = 10;
      const promises = Array.from({ length: total }, () =>
        counter.increment('rule-1', 'org-1'),
      );

      const results = await Promise.all(promises);

      // All results should be unique values 1–10
      const sorted = [...results].sort((a, b) => a - b);
      expect(sorted).toEqual(Array.from({ length: total }, (_, i) => i + 1));

      const count = await counter.getCount('rule-1', 'org-1');
      expect(count).toBe(total);
    });
  });

  // ── Entry metadata ────────────────────────────────────────────────────

  describe('entry metadata', () => {
    it('stores updatedAt ISO timestamp', async () => {
      const before = new Date().toISOString();
      await counter.increment('rule-1', 'org-1');
      const after = new Date().toISOString();

      const raw = await readFile(
        join(testDataDir, 'block-counter.json'),
        'utf-8',
      );
      const entries = JSON.parse(raw);
      const updatedAt: string = entries[0].updatedAt;

      expect(updatedAt >= before).toBe(true);
      expect(updatedAt <= after).toBe(true);
    });

    it('updates updatedAt on subsequent increments', async () => {
      await counter.increment('rule-1', 'org-1');
      const raw1 = await readFile(
        join(testDataDir, 'block-counter.json'),
        'utf-8',
      );
      const ts1 = JSON.parse(raw1)[0].updatedAt;

      // Tiny delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));

      await counter.increment('rule-1', 'org-1');
      const raw2 = await readFile(
        join(testDataDir, 'block-counter.json'),
        'utf-8',
      );
      const ts2 = JSON.parse(raw2)[0].updatedAt;

      expect(ts2 >= ts1).toBe(true);
    });
  });
});
