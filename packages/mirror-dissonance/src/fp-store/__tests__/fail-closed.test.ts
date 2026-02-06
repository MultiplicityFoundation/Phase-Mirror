/**
 * DynamoDB FP Store — fail-closed behavior tests
 * 
 * Tests that FPStoreError is thrown on all DynamoDB failures
 * and that legitimate empty data is distinguished from errors
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DynamoDBFPStore, FPStoreError } from '../dynamodb-store.js';
import type { FPEvent } from '../types.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK utilities
jest.mock('@aws-sdk/util-dynamodb');

describe('DynamoDB FP Store — fail-closed behavior', () => {
  let store: DynamoDBFPStore;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBClient as any).mockImplementation(() => ({
      send: mockSend,
    }));

    // Setup default mocks for marshall/unmarshall
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);

    store = new DynamoDBFPStore({
      tableName: 'test-fp-events',
      region: 'us-east-1',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (overrides?: Partial<FPEvent>): FPEvent => ({
    eventId: 'evt-001',
    ruleId: 'MD-001',
    ruleVersion: '1.0.0',
    findingId: 'abc123',
    outcome: 'block' as const,
    isFalsePositive: false,
    timestamp: new Date(),
    context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
    ...overrides,
  });

  // ── recordEvent ───────────────────────────────────────────────────

  describe('recordEvent', () => {
    it('stores event on success', async () => {
      mockSend.mockResolvedValue({});
      await expect(store.recordEvent(makeEvent())).resolves.not.toThrow();
    });

    it('throws FPStoreError on DynamoDB failure', async () => {
      mockSend.mockRejectedValue(new Error('ProvisionedThroughputExceeded'));

      await expect(store.recordEvent(makeEvent())).rejects.toThrow(FPStoreError);
      await expect(store.recordEvent(makeEvent())).rejects.toThrow(
        /Failed to record FP event evt-001 for rule MD-001/
      );
    });

    it('includes eventId and ruleId in error context', async () => {
      mockSend.mockRejectedValue(new Error('timeout'));

      try {
        await store.recordEvent(makeEvent({ eventId: 'evt-999', ruleId: 'MD-005' }));
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(FPStoreError);
        expect((e as FPStoreError).eventId).toBe('evt-999');
        expect((e as FPStoreError).ruleId).toBe('MD-005');
        expect((e as FPStoreError).operation).toBe('recordEvent');
      }
    });

    it('throws FPStoreError on duplicate event', async () => {
      const duplicateError = new Error('Conditional check failed');
      (duplicateError as any).name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(duplicateError);

      await expect(store.recordEvent(makeEvent())).rejects.toThrow(FPStoreError);
      
      try {
        await store.recordEvent(makeEvent());
      } catch (e) {
        expect((e as FPStoreError).operation).toBe('recordEvent:duplicate');
      }
    });
  });

  // ── getWindowByCount ──────────────────────────────────────────────

  describe('getWindowByCount', () => {
    it('returns window on success', async () => {
      const mockItems = Array.from({ length: 10 }, (_, i) => ({
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: i < 2, // 20% FPR
        timestamp: new Date(Date.now() - i * 60000).toISOString(),
        context: { repo: 'test', branch: 'main', eventType: 'pull_request' },
      }));

      mockSend.mockResolvedValue({ Items: mockItems });

      const window = await store.getWindowByCount('MD-001', 50);
      expect(window.windowSize).toBe(10);
      expect(window.statistics.observedFPR).toBeCloseTo(0.2, 2);
    });

    it('returns empty window when no events exist (not an error)', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const window = await store.getWindowByCount('MD-999', 50);
      expect(window.windowSize).toBe(0);
      expect(window.statistics.observedFPR).toBe(0);
      // This is the key distinction: empty result ≠ error
    });

    it('throws FPStoreError on DynamoDB failure — never returns empty array', async () => {
      mockSend.mockRejectedValue(new Error('ServiceUnavailable'));

      await expect(
        store.getWindowByCount('MD-001', 50)
      ).rejects.toThrow(FPStoreError);

      await expect(
        store.getWindowByCount('MD-001', 50)
      ).rejects.toThrow(/Failed to get FP window for MD-001/);
    });

    it('never silently returns empty data on network error', async () => {
      mockSend.mockRejectedValue(new Error('ETIMEDOUT'));

      // The old code would have returned [] here.
      // The new code MUST throw.
      let caught = false;
      try {
        await store.getWindowByCount('MD-001', 200);
      } catch (e) {
        caught = true;
        expect(e).toBeInstanceOf(FPStoreError);
        expect((e as FPStoreError).operation).toBe('getWindowByCount');
        expect((e as FPStoreError).ruleId).toBe('MD-001');
      }
      expect(caught).toBe(true);
    });

    it('includes ruleId in error context', async () => {
      mockSend.mockRejectedValue(new Error('AccessDenied'));

      try {
        await store.getWindowByCount('MD-042', 100);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(FPStoreError);
        expect((e as FPStoreError).ruleId).toBe('MD-042');
        expect((e as FPStoreError).operation).toBe('getWindowByCount');
        expect((e as FPStoreError).cause).toBeDefined();
      }
    });
  });

  // ── getWindowBySince ──────────────────────────────────────────────

  describe('getWindowBySince', () => {
    it('throws FPStoreError on DynamoDB failure', async () => {
      mockSend.mockRejectedValue(new Error('InternalServerError'));
      const since = new Date(Date.now() - 86400000);

      await expect(
        store.getWindowBySince('MD-002', since)
      ).rejects.toThrow(FPStoreError);

      await expect(
        store.getWindowBySince('MD-002', since)
      ).rejects.toThrow(/Failed to get FP window for MD-002/);
    });

    it('includes ruleId and timestamp in error context', async () => {
      mockSend.mockRejectedValue(new Error('Throttling'));
      const since = new Date('2026-01-01');

      try {
        await store.getWindowBySince('MD-777', since);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(FPStoreError);
        expect((e as FPStoreError).ruleId).toBe('MD-777');
        expect((e as FPStoreError).operation).toBe('getWindowBySince');
        expect((e as FPStoreError).message).toContain('2026-01-01');
      }
    });

    it('returns empty window on successful query with no results', async () => {
      mockSend.mockResolvedValue({ Items: [] });
      const since = new Date();

      const window = await store.getWindowBySince('MD-NEW', since);
      expect(window.windowSize).toBe(0);
      expect(window.statistics.total).toBe(0);
    });
  });

  // ── markFalsePositive ─────────────────────────────────────────────

  describe('markFalsePositive', () => {
    it('throws when finding not found', async () => {
      mockSend.mockResolvedValue({ Items: [] }); // GSI returns nothing

      await expect(
        store.markFalsePositive('nonexistent', 'reviewer', 'TICKET-1')
      ).rejects.toThrow(FPStoreError);

      try {
        await store.markFalsePositive('nonexistent', 'reviewer', 'TICKET-1');
      } catch (e) {
        expect((e as FPStoreError).operation).toBe('markFalsePositive:notFound');
        expect((e as FPStoreError).findingId).toBe('nonexistent');
      }
    });

    it('throws FPStoreError when GSI query fails', async () => {
      mockSend.mockRejectedValue(new Error('AccessDenied'));

      await expect(
        store.markFalsePositive('abc123', 'reviewer', 'TICKET-1')
      ).rejects.toThrow(FPStoreError);

      try {
        await store.markFalsePositive('abc123', 'reviewer', 'TICKET-1');
      } catch (e) {
        expect((e as FPStoreError).operation).toBe('markFalsePositive:query');
        expect((e as FPStoreError).findingId).toBe('abc123');
      }
    });

    it('throws FPStoreError when update fails', async () => {
      // First call (query) succeeds
      mockSend.mockResolvedValueOnce({
        Items: [{
          pk: 'rule#MD-001',
          sk: 'event#2026-01-01T00:00:00.000Z#evt-123',
          eventId: 'evt-123',
        }],
      });

      // Second call (update) fails
      mockSend.mockRejectedValueOnce(new Error('ProvisionedThroughputExceeded'));

      await expect(
        store.markFalsePositive('finding-456', 'reviewer', 'TICKET-1')
      ).rejects.toThrow(FPStoreError);

      try {
        await store.markFalsePositive('finding-456', 'reviewer', 'TICKET-1');
      } catch (e) {
        expect((e as FPStoreError).operation).toBe('markFalsePositive:update');
        expect((e as FPStoreError).findingId).toBe('finding-456');
      }
    });
  });

  // ── Error context validation ──────────────────────────────────────

  describe('FPStoreError structure', () => {
    it('always includes operation field', async () => {
      mockSend.mockRejectedValue(new Error('test error'));

      const testCases = [
        () => store.recordEvent(makeEvent()),
        () => store.getWindowByCount('rule-1', 10),
        () => store.getWindowBySince('rule-1', new Date()),
        () => store.markFalsePositive('finding-1', 'reviewer', 'ticket'),
      ];

      for (const testCase of testCases) {
        try {
          await testCase();
          fail('Should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(FPStoreError);
          expect((e as FPStoreError).operation).toBeDefined();
          expect((e as FPStoreError).cause).toBeDefined();
        }
      }
    });

    it('FPStoreError has correct name property', () => {
      const error = new FPStoreError({
        message: 'test',
        operation: 'test-op',
      });

      expect(error.name).toBe('FPStoreError');
      expect(error instanceof Error).toBe(true);
      expect(error instanceof FPStoreError).toBe(true);
    });
  });
});
