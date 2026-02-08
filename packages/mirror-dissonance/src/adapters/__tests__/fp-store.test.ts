/**
 * FP Store Adapter Tests
 *
 * Tests the FPStoreAdapter contract against:
 *   1. AwsFPStore (mocked DynamoDB) — verifies DynamoDB key schema,
 *      error wrapping, conditional writes, and query structure
 *   2. LocalFPStore (via createLocalAdapters) — verifies behavioral
 *      correctness of windowing, FPR computation, and markFalsePositive
 *
 * Coverage targets:
 * - recordEvent: correct structure, duplicate prevention, fail-closed errors
 * - getWindowByCount: windowing, FPR calculation, version filtering
 * - getWindowBySince: time-based windowing
 * - markFalsePositive: flips isFalsePositive flag
 * - computeWindow: dominant-version logic, observedFPR formula
 * - isFalsePositive: single-arg and two-arg lookups
 * - Performance: getWindowByCount < 50ms (local)
 *
 * @ts-nocheck — AWS mock tests use dynamic imports and untyped mock payloads
 */
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters, CloudConfig, FPStoreAdapter, FPEvent, FPWindow } from '../types.js';
import { rm } from 'fs/promises';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeFPEvent(overrides: Partial<FPEvent> = {}): FPEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2, 10)}`,
    ruleId: 'MD-001',
    ruleVersion: '1.0.0',
    findingId: `fnd-${Math.random().toString(36).slice(2, 10)}`,
    outcome: 'block',
    isFalsePositive: false,
    timestamp: new Date(),
    context: {
      repo: 'test/repo',
      branch: 'main',
      eventType: 'pullrequest',
    },
    ...overrides,
  };
}

function seedEvents(
  count: number,
  overrides: Partial<FPEvent> = {},
): FPEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeFPEvent({
      eventId: `evt-${i}`,
      findingId: `fnd-${i}`,
      // Offset each event by 1 second so ordering is deterministic
      timestamp: new Date(Date.now() - (count - i) * 1000),
      ...overrides,
    }),
  );
}

// ─── Part 1: Local FP Store (behavioral correctness) ──────────────────────

describe('FPStoreAdapter — local adapter', () => {
  let adapters: CloudAdapters;
  let store: FPStoreAdapter;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = `/tmp/test-fp-store-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };
    adapters = createLocalAdapters(config);
    store = adapters.fpStore;
  });

  afterEach(async () => {
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
  });

  // ── recordEvent ────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('stores event and retrieves it via getWindowByCount', async () => {
      const event = makeFPEvent();
      await store.recordEvent(event);

      const window = await store.getWindowByCount(event.ruleId, 10);
      expect(window.events).toHaveLength(1);
      expect(window.events[0].eventId).toBe(event.eventId);
      expect(window.events[0].ruleId).toBe(event.ruleId);
      expect(window.events[0].ruleVersion).toBe(event.ruleVersion);
      expect(window.events[0].findingId).toBe(event.findingId);
      expect(window.events[0].outcome).toBe(event.outcome);
      expect(window.events[0].isFalsePositive).toBe(false);
    });

    it('stores multiple events and retrieves all', async () => {
      const events = seedEvents(5);
      for (const event of events) {
        await store.recordEvent(event);
      }

      const window = await store.getWindowByCount('MD-001', 100);
      expect(window.events).toHaveLength(5);
      expect(window.statistics.total).toBe(5);
    });

    it('preserves event context fields', async () => {
      const event = makeFPEvent({
        context: {
          repo: 'org/critical-repo',
          branch: 'release/v2',
          eventType: 'drift',
        },
      });
      await store.recordEvent(event);

      const window = await store.getWindowByCount(event.ruleId, 1);
      expect(window.events[0].context).toEqual({
        repo: 'org/critical-repo',
        branch: 'release/v2',
        eventType: 'drift',
      });
    });
  });

  // ── getWindowByCount ───────────────────────────────────────────────────

  describe('getWindowByCount', () => {
    it('seeds 100 events; requesting 50 returns windowSize 50', async () => {
      const events = seedEvents(100);
      for (const event of events) {
        await store.recordEvent(event);
      }

      const window = await store.getWindowByCount('MD-001', 50);
      expect(window.windowSize).toBe(50);
      expect(window.events).toHaveLength(50);
      expect(window.statistics.total).toBe(50);
    });

    it('returns most recent events when count is less than total', async () => {
      const events = seedEvents(10);
      for (const event of events) {
        await store.recordEvent(event);
      }

      const window = await store.getWindowByCount('MD-001', 3);
      // Most recent 3 events should be returned
      expect(window.events).toHaveLength(3);
      // Verify they're the latest ones (sorted desc by timestamp)
      const timestamps = window.events.map((e) => e.timestamp.getTime());
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });

    it('computes observedFPR correctly (10 FPs out of 100 → 0.1)', async () => {
      const events = seedEvents(100);
      // Mark first 10 as false positives
      for (let i = 0; i < 10; i++) {
        events[i].isFalsePositive = true;
      }
      for (const event of events) {
        await store.recordEvent(event);
      }

      const window = await store.getWindowByCount('MD-001', 100);
      expect(window.statistics.total).toBe(100);
      expect(window.statistics.falsePositives).toBe(10);
      expect(window.statistics.observedFPR).toBeCloseTo(0.1, 4);
    });

    it('returns observedFPR 0 when no events exist', async () => {
      const window = await store.getWindowByCount('MD-001', 50);
      expect(window.windowSize).toBe(0);
      expect(window.events).toHaveLength(0);
      expect(window.statistics.observedFPR).toBe(0);
    });

    it('filters by ruleId (does not mix rules)', async () => {
      const rule1Events = seedEvents(5, { ruleId: 'MD-001' });
      const rule2Events = seedEvents(5, {
        ruleId: 'MD-002',
        eventId: undefined, // let the factory generate
      });
      // Re-generate unique IDs for rule2
      for (let i = 0; i < rule2Events.length; i++) {
        rule2Events[i].eventId = `evt-r2-${i}`;
      }
      for (const e of [...rule1Events, ...rule2Events]) {
        await store.recordEvent(e);
      }

      const window = await store.getWindowByCount('MD-001', 100);
      expect(window.events).toHaveLength(5);
      expect(window.events.every((e) => e.ruleId === 'MD-001')).toBe(true);
    });

    it('returns correct ruleId in window metadata', async () => {
      const events = seedEvents(3);
      for (const event of events) {
        await store.recordEvent(event);
      }

      const window = await store.getWindowByCount('MD-001', 10);
      expect(window.ruleId).toBe('MD-001');
    });
  });

  // ── getWindowBySince ───────────────────────────────────────────────────

  describe('getWindowBySince', () => {
    it('returns only events after the given date', async () => {
      const oldEvent = makeFPEvent({
        eventId: 'evt-old',
        timestamp: new Date('2025-01-01T00:00:00Z'),
      });
      const recentEvent = makeFPEvent({
        eventId: 'evt-recent',
        timestamp: new Date('2026-02-01T00:00:00Z'),
      });
      await store.recordEvent(oldEvent);
      await store.recordEvent(recentEvent);

      const window = await store.getWindowBySince(
        'MD-001',
        new Date('2026-01-01T00:00:00Z'),
      );
      expect(window.events).toHaveLength(1);
      expect(window.events[0].eventId).toBe('evt-recent');
    });

    it('returns empty window for future since date', async () => {
      const event = makeFPEvent();
      await store.recordEvent(event);

      const window = await store.getWindowBySince(
        'MD-001',
        new Date('2099-01-01T00:00:00Z'),
      );
      expect(window.events).toHaveLength(0);
      expect(window.statistics.total).toBe(0);
    });
  });

  // ── markFalsePositive ──────────────────────────────────────────────────

  describe('markFalsePositive', () => {
    it('flips isFalsePositive to true', async () => {
      const event = makeFPEvent({ eventId: 'evt-mark-test' });
      await store.recordEvent(event);

      // Before marking
      let window = await store.getWindowByCount('MD-001', 10);
      expect(window.events[0].isFalsePositive).toBe(false);

      await store.markFalsePositive('evt-mark-test', 'reviewer@example.com');

      // After marking
      window = await store.getWindowByCount('MD-001', 10);
      expect(window.events[0].isFalsePositive).toBe(true);
    });

    it('updates FPR after marking', async () => {
      const events = seedEvents(10);
      for (const event of events) {
        await store.recordEvent(event);
      }

      // Before: 0% FPR
      let window = await store.getWindowByCount('MD-001', 10);
      expect(window.statistics.observedFPR).toBe(0);

      // Mark 3 as false positives
      await store.markFalsePositive('evt-0', 'reviewer');
      await store.markFalsePositive('evt-1', 'reviewer');
      await store.markFalsePositive('evt-2', 'reviewer');

      // After: 3/10 = 0.3 FPR
      window = await store.getWindowByCount('MD-001', 10);
      expect(window.statistics.falsePositives).toBe(3);
      expect(window.statistics.observedFPR).toBeCloseTo(0.3, 4);
    });

    it('is idempotent (marking twice does not error)', async () => {
      const event = makeFPEvent({ eventId: 'evt-idem' });
      await store.recordEvent(event);

      await store.markFalsePositive('evt-idem', 'reviewer');
      await expect(
        store.markFalsePositive('evt-idem', 'reviewer'),
      ).resolves.not.toThrow();

      const window = await store.getWindowByCount('MD-001', 10);
      expect(window.statistics.falsePositives).toBe(1);
    });
  });

  // ── isFalsePositive ────────────────────────────────────────────────────

  describe('isFalsePositive', () => {
    it('returns false for unknown findingId (1-arg)', async () => {
      const result = await store.isFalsePositive('nonexistent-finding');
      expect(result).toBe(false);
    });

    it('returns true after marking via windowed event (2-arg)', async () => {
      const event = makeFPEvent({
        ruleId: 'MD-001',
        findingId: 'fnd-lookup',
        eventId: 'evt-lookup',
      });
      await store.recordEvent(event);
      await store.markFalsePositive('evt-lookup', 'reviewer');

      const result = await store.isFalsePositive('MD-001', 'fnd-lookup');
      expect(result).toBe(true);
    });

    it('returns false when event exists but is not marked FP', async () => {
      const event = makeFPEvent({
        ruleId: 'MD-001',
        findingId: 'fnd-not-fp',
        eventId: 'evt-not-fp',
      });
      await store.recordEvent(event);

      const result = await store.isFalsePositive('MD-001', 'fnd-not-fp');
      expect(result).toBe(false);
    });
  });

  // ── computeWindow ──────────────────────────────────────────────────────

  describe('computeWindow', () => {
    it('handles empty event list', () => {
      const window = store.computeWindow('MD-001', []);
      expect(window.windowSize).toBe(0);
      expect(window.statistics.total).toBe(0);
      expect(window.statistics.falsePositives).toBe(0);
      expect(window.statistics.truePositives).toBe(0);
      expect(window.statistics.observedFPR).toBe(0);
    });

    it('computes correct stats for all-FP window', () => {
      const events = seedEvents(5).map((e) => ({
        ...e,
        isFalsePositive: true,
      }));
      const window = store.computeWindow('MD-001', events);

      expect(window.statistics.total).toBe(5);
      expect(window.statistics.falsePositives).toBe(5);
      expect(window.statistics.observedFPR).toBe(1.0);
    });

    it('computes observedFPR = FP / (total - pending)', () => {
      // 8 total, 2 FP, 0 pending → FPR = 2/8 = 0.25
      const events = seedEvents(8);
      events[0].isFalsePositive = true;
      events[1].isFalsePositive = true;

      const window = store.computeWindow('MD-001', events);
      expect(window.statistics.observedFPR).toBeCloseTo(0.25, 4);
      expect(window.statistics.truePositives).toBe(6);
    });
  });

  // ── Performance ────────────────────────────────────────────────────────

  describe('Performance', () => {
    it('getWindowByCount completes under 50ms for 100 events', async () => {
      const events = seedEvents(100);
      for (const event of events) {
        await store.recordEvent(event);
      }

      const start = performance.now();
      const window = await store.getWindowByCount('MD-001', 50);
      const elapsed = performance.now() - start;

      expect(window.events).toHaveLength(50);
      expect(elapsed).toBeLessThan(50);
    });
  });
});

// ─── Part 2: AWS FP Store (mocked DynamoDB) ───────────────────────────────

describe('AwsFPStore — DynamoDB mock', () => {
  let store: any; // AwsFPStore
  let mockSend: jest.Mock<any>;
  let AwsFPStore: any;
  let FPStoreError: any;

  beforeEach(async () => {
    // Dynamically import to get the actual class
    const mod = await import('../aws/fp-store.js');
    AwsFPStore = mod.AwsFPStore;
    FPStoreError = mod.FPStoreError;

    // Create a store instance then replace the internal client
    store = new AwsFPStore({
      provider: 'aws',
      fpTableName: 'test-fp-events',
      region: 'us-east-1',
    });

    // Mock the DynamoDB client's send method
    mockSend = jest.fn<any>();
    (store as any).client = { send: mockSend };
  });

  // ── recordEvent ────────────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('sends PutItemCommand with correct TableName', async () => {
      mockSend.mockResolvedValue({});

      const event = makeFPEvent();
      await store.recordEvent(event);

      expect(mockSend).toHaveBeenCalledTimes(1);

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.constructor.name).toBe('PutItemCommand');
      expect(command.input.TableName).toBe('test-fp-events');
    });

    it('includes correct PK/SK structure in marshalled item', async () => {
      mockSend.mockResolvedValue({});

      const event = makeFPEvent({
        ruleId: 'MD-002',
        eventId: 'evt-pk-test',
      });
      await store.recordEvent(event);

      const command = mockSend.mock.calls[0][0] as any;
      // PK should be { S: "rule#MD-002" }
      expect(command.input.Item.pk).toEqual({ S: 'rule#MD-002' });
      // SK should start with "event#"
      expect(command.input.Item.sk.S).toMatch(/^event#/);
      // SK should contain the eventId
      expect(command.input.Item.sk.S).toContain('evt-pk-test');
    });

    it('includes GSI keys for FindingIndex', async () => {
      mockSend.mockResolvedValue({});

      const event = makeFPEvent({
        findingId: 'fnd-gsi-test',
        ruleId: 'MD-003',
        ruleVersion: '2.0.0',
      });
      await store.recordEvent(event);

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.input.Item.gsi1pk).toEqual({ S: 'finding#fnd-gsi-test' });
      expect(command.input.Item.gsi1sk.S).toContain('rule#MD-003');
      expect(command.input.Item.gsi1sk.S).toContain('2.0.0');
    });

    it('uses ConditionExpression to prevent duplicates', async () => {
      mockSend.mockResolvedValue({});

      await store.recordEvent(makeFPEvent());

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.input.ConditionExpression).toBe(
        'attribute_not_exists(pk) AND attribute_not_exists(sk)',
      );
    });

    it('throws FPStoreError on DynamoDB error (fail-closed)', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB throttled'));

      const event = makeFPEvent();
      await expect(store.recordEvent(event)).rejects.toThrow(FPStoreError);
      await expect(store.recordEvent(event)).rejects.toThrow(
        /Failed to record FP event/,
      );
    });

    it('throws specific error on duplicate (ConditionalCheckFailed)', async () => {
      const condError = new Error('Condition check failed');
      (condError as any).name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(condError);

      const event = makeFPEvent();
      await expect(store.recordEvent(event)).rejects.toThrow(/Duplicate FP event/);
    });

    it('includes ruleId and eventId in FPStoreError context', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const event = makeFPEvent({
        ruleId: 'MD-ERR',
        eventId: 'evt-err-ctx',
      });
      try {
        await store.recordEvent(event);
        expect(true).toBe(false); // Should not reach
      } catch (err: any) {
        expect(err).toBeInstanceOf(FPStoreError);
        expect(err.ruleId).toBe('MD-ERR');
        expect(err.eventId).toBe('evt-err-ctx');
        expect(err.operation).toBe('recordEvent');
        expect(err.cause).toBeInstanceOf(Error);
      }
    });
  });

  // ── getWindowByCount ───────────────────────────────────────────────────

  describe('getWindowByCount', () => {
    it('sends QueryCommand with correct key condition', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await store.getWindowByCount('MD-001', 50);

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.constructor.name).toBe('QueryCommand');
      expect(command.input.TableName).toBe('test-fp-events');
      expect(command.input.Limit).toBe(50);
      expect(command.input.ScanIndexForward).toBe(false); // descending
    });

    it('throws FPStoreError on query failure', async () => {
      mockSend.mockRejectedValue(new Error('Query timeout'));

      await expect(store.getWindowByCount('MD-001', 50)).rejects.toThrow(
        FPStoreError,
      );
      await expect(store.getWindowByCount('MD-001', 50)).rejects.toThrow(
        /Failed to get FP window/,
      );
    });

    it('returns empty window when no items match', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const window = await store.getWindowByCount('MD-001', 50);
      expect(window.windowSize).toBe(0);
      expect(window.events).toHaveLength(0);
      expect(window.statistics.observedFPR).toBe(0);
    });
  });

  // ── markFalsePositive ──────────────────────────────────────────────────

  describe('markFalsePositive', () => {
    it('queries FindingIndex then sends UpdateItemCommand', async () => {
      // First call: Query to find the event
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            pk: { S: 'rule#MD-001' },
            sk: { S: 'event#2026-01-01T00:00:00.000Z#evt-1' },
          },
        ],
      });
      // Second call: Update the event
      mockSend.mockResolvedValueOnce({});

      await store.markFalsePositive('evt-1', 'reviewer@test.com');

      expect(mockSend).toHaveBeenCalledTimes(2);

      // First call should be a query on FindingIndex
      const queryCmd = mockSend.mock.calls[0][0] as any;
      expect(queryCmd.constructor.name).toBe('QueryCommand');
      expect(queryCmd.input.IndexName).toBe('FindingIndex');

      // Second call should be an update
      const updateCmd = mockSend.mock.calls[1][0] as any;
      expect(updateCmd.constructor.name).toBe('UpdateItemCommand');
      expect(updateCmd.input.UpdateExpression).toContain('isFalsePositive');
      expect(updateCmd.input.UpdateExpression).toContain('reviewedBy');
    });

    it('throws when event not found', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      await expect(
        store.markFalsePositive('nonexistent', 'reviewer'),
      ).rejects.toThrow(/not found in FP store/);
    });

    it('throws FPStoreError on query failure', async () => {
      mockSend.mockRejectedValue(new Error('Connection reset'));

      await expect(
        store.markFalsePositive('evt-1', 'reviewer'),
      ).rejects.toThrow(FPStoreError);
    });

    it('throws FPStoreError on update failure', async () => {
      // Query succeeds
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            pk: { S: 'rule#MD-001' },
            sk: { S: 'event#2026-01-01T00:00:00.000Z#evt-1' },
          },
        ],
      });
      // Update fails
      mockSend.mockRejectedValueOnce(new Error('Throughput exceeded'));

      await expect(
        store.markFalsePositive('evt-1', 'reviewer'),
      ).rejects.toThrow(FPStoreError);
    });
  });

  // ── computeWindow ──────────────────────────────────────────────────────

  describe('computeWindow — dominant version logic', () => {
    it('selects the most common ruleVersion', () => {
      const events: FPEvent[] = [
        ...seedEvents(3, { ruleVersion: '1.0.0' }),
        ...seedEvents(7, { ruleVersion: '2.0.0' }),
      ];
      // Re-assign unique IDs
      events.forEach((e, i) => {
        e.eventId = `evt-ver-${i}`;
      });

      const window = store.computeWindow('MD-001', events);
      expect(window.ruleVersion).toBe('2.0.0');
    });

    it('counts all events regardless of version in total', () => {
      const events: FPEvent[] = [
        ...seedEvents(3, { ruleVersion: '1.0.0' }),
        ...seedEvents(7, { ruleVersion: '2.0.0' }),
      ];
      events.forEach((e, i) => {
        e.eventId = `evt-mix-${i}`;
      });

      const window = store.computeWindow('MD-001', events);
      expect(window.statistics.total).toBe(10);
    });

    it('computes correct FPR with mixed versions and FPs', () => {
      const events: FPEvent[] = [
        // 3 v1 events, 1 FP
        ...seedEvents(3, { ruleVersion: '1.0.0' }).map((e, i) => ({
          ...e,
          eventId: `v1-${i}`,
          isFalsePositive: i === 0,
        })),
        // 7 v2 events, 2 FPs
        ...seedEvents(7, { ruleVersion: '2.0.0' }).map((e, i) => ({
          ...e,
          eventId: `v2-${i}`,
          isFalsePositive: i < 2,
        })),
      ];

      const window = store.computeWindow('MD-001', events);
      expect(window.statistics.falsePositives).toBe(3); // 1 from v1 + 2 from v2
      expect(window.statistics.total).toBe(10);
    });
  });

  // ── isFalsePositive ────────────────────────────────────────────────────

  describe('isFalsePositive', () => {
    it('queries FindingIndex with 1-arg (findingId only)', async () => {
      mockSend.mockResolvedValue({
        Items: [
          {
            isFalsePositive: { BOOL: true },
          },
        ],
      });

      const result = await store.isFalsePositive('fnd-check');
      expect(result).toBe(true);

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.input.IndexName).toBe('FindingIndex');
    });

    it('queries with 2-arg (ruleId + findingId)', async () => {
      mockSend.mockResolvedValue({
        Items: [
          {
            isFalsePositive: { BOOL: false },
          },
        ],
      } as any);

      const result = await store.isFalsePositive('MD-001', 'fnd-check');
      expect(result).toBe(false);

      const command = mockSend.mock.calls[0][0] as any;
      expect(command.input.KeyConditionExpression).toContain('begins_with');
    });

    it('returns false when no matching event found', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await store.isFalsePositive('nonexistent');
      expect(result).toBe(false);
    });

    it('throws FPStoreError on query failure', async () => {
      mockSend.mockRejectedValue(new Error('Access denied'));

      await expect(store.isFalsePositive('fnd-err')).rejects.toThrow(
        FPStoreError,
      );
    });
  });
});
