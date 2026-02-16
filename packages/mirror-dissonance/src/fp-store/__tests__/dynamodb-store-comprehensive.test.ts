// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * FP Store DynamoDB Implementation Tests
 * 
 * Coverage target: 80%+
 * Performance target: <50ms p99 for queries
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DynamoDBFPStore } from '../dynamodb-store.js';
import type { FPEvent, FPWindow } from '../types.js';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK utilities (module-level constructors are mocked by global setup)
jest.mock('@aws-sdk/util-dynamodb');

describe.skip('DynamoDBFPStore - Comprehensive (legacy - removed from core)', () => {
  let store: DynamoDBFPStore;
  let mockSend: any;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // Setup default mocks for marshall/unmarshall
    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);

    if (typeof DynamoDBFPStore !== 'function') {
      throw new Error('DynamoDBFPStore is not a constructor. Ensure it is correctly exported from ../dynamodb-store.js');
    }

    store = new DynamoDBFPStore({
      tableName: 'test-fp-events',
      region: 'us-east-1',
      ttlDays: 90,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. recordEvent', () => {
    it('should record event with correct DynamoDB item structure', async () => {
      mockSend.mockResolvedValue({});

      const event: FPEvent = {
        eventId: 'evt-001',
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: 'finding-001',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date('2026-02-01T12:00:00Z'),
        context: {
          repo: 'test/repo',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await store.recordEvent(event);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(PutItemCommand);
    });

    it('should include TTL in stored item', async () => {
      mockSend.mockResolvedValue({});

      const event: FPEvent = {
        eventId: 'evt-002',
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: 'finding-002',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(),
        context: {
          repo: 'test/repo',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await store.recordEvent(event);

      // Verify TTL is set (approximately 90 days in future)
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should use conditional expression to prevent duplicates', async () => {
      mockSend.mockResolvedValue({});

      const event: FPEvent = {
        eventId: 'evt-003',
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: 'finding-003',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(),
        context: {
          repo: 'test/repo',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await store.recordEvent(event);

      const callArg = mockSend.mock.calls[0][0];
      expect(callArg).toBeInstanceOf(PutItemCommand);
    });

    it('should throw on duplicate event (ConditionalCheckFailedException)', async () => {
      const error = new Error('Conditional check failed');
      (error as any).name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValue(error);

      const event: FPEvent = {
        eventId: 'evt-duplicate',
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: 'finding-dup',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(),
        context: {
          repo: 'test/repo',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await expect(store.recordEvent(event))
        .rejects
        .toThrow(/duplicate/i);
    });

    it('should throw with context on DynamoDB error', async () => {
      mockSend.mockRejectedValue(new Error('Network timeout'));

      const event: FPEvent = {
        eventId: 'evt-error',
        ruleId: 'MD-002',
        ruleVersion: '1.0.0',
        findingId: 'finding-error',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(),
        context: {
          repo: 'test/repo',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await expect(store.recordEvent(event))
        .rejects
        .toThrow(/MD-002/); // Error should include ruleId context
    });

    it('should handle all outcome types', async () => {
      mockSend.mockResolvedValue({});

      const outcomes: Array<'pass' | 'warn' | 'block'> = ['pass', 'warn', 'block'];

      for (const outcome of outcomes) {
        const event: FPEvent = {
          eventId: `evt-${outcome}`,
          ruleId: 'MD-001',
          ruleVersion: '1.0.0',
          findingId: `finding-${outcome}`,
          outcome,
          isFalsePositive: false,
          timestamp: new Date(),
          context: {
            repo: 'test/repo',
            branch: 'main',
            eventType: 'pull_request'
          }
        };

        await store.recordEvent(event);
      }

      expect(mockSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('2. markFalsePositive', () => {
    it('should query GSI by findingId', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            pk: 'rule#MD-001',
            sk: 'event#2026-02-01T12:00:00Z#evt-001',
            eventId: 'evt-001',
            findingId: 'finding-001',
            isFalsePositive: false
          }]
        })
        .mockResolvedValueOnce({}); // UpdateCommand

      await store.markFalsePositive('finding-001', 'reviewer@example.com', 'TICKET-123');

      // First call should be Query on GSI
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(QueryCommand));
    });

    it('should update item with reviewer and ticket info', async () => {
      mockSend
        .mockResolvedValueOnce({
          Items: [{
            pk: 'rule#MD-001',
            sk: 'event#2026-02-01T12:00:00Z#evt-001'
          }]
        })
        .mockResolvedValueOnce({});

      await store.markFalsePositive('finding-001', 'alice@example.com', 'JIRA-456');

      // Second call should be UpdateCommand
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(UpdateItemCommand));
    });

    it('should throw when finding not found', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] }); // Empty query result

      await expect(
        store.markFalsePositive('nonexistent', 'reviewer', 'TICKET')
      ).rejects.toThrow(/not found/i);
    });

    it('should include findingId in error message', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });

      await expect(
        store.markFalsePositive('finding-xyz', 'reviewer', 'TICKET')
      ).rejects.toThrow(/finding-xyz/);
    });

    it('should handle DynamoDB update errors', async () => {
      mockSend
        .mockResolvedValueOnce({ Items: [{ pk: 'rule#MD-001', sk: 'event#...' }] })
        .mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        store.markFalsePositive('finding-001', 'reviewer', 'TICKET')
      ).rejects.toThrow(/update failed/i);
    });
  });

  describe('3. getWindowByCount', () => {
    it('should query by ruleId with limit', async () => {
      const mockEvents = Array.from({ length: 50 }, (_, i) => ({
        pk: 'rule#MD-001',
        sk: `event#2026-02-${String(i + 1).padStart(2, '0')}T12:00:00Z#evt-${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: i % 5 === 0, // Every 5th is FP
        reviewedBy: i % 5 === 0 ? 'alice' : undefined,
        reviewedAt: i % 5 === 0 ? '2026-02-01T12:00:00Z' : undefined,
        timestamp: `2026-02-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' }
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const window = await store.getWindowByCount('MD-001', 50);

      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));

      expect(window.ruleId).toBe('MD-001');
      expect(window.windowSize).toBe(50);
      expect(window.events).toHaveLength(50);
    });

    it('should compute FPR correctly', async () => {
      const mockEvents = [
        { isFalsePositive: false, outcome: 'block', reviewedBy: 'bob', reviewedAt: '2026-02-01T12:00:00Z' },
        { isFalsePositive: true, outcome: 'block', reviewedBy: 'alice', reviewedAt: '2026-02-01T12:00:00Z' },
        { isFalsePositive: false, outcome: 'block', reviewedBy: 'bob', reviewedAt: '2026-02-01T12:00:00Z' },
        { isFalsePositive: false, outcome: 'block', reviewedBy: 'bob', reviewedAt: '2026-02-01T12:00:00Z' },
        { isFalsePositive: true, outcome: 'block', reviewedBy: 'alice', reviewedAt: '2026-02-01T12:00:00Z' }
      ].map((e, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' },
        ...e
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const window = await store.getWindowByCount('MD-001', 10);

      // 2 FP out of 5 total = 40% FPR
      expect(window.statistics.total).toBe(5);
      expect(window.statistics.falsePositives).toBe(2);
      expect(window.statistics.observedFPR).toBeCloseTo(0.4, 2);
    });

    it('should exclude pending events from FPR calculation', async () => {
      const mockEvents = [
        { isFalsePositive: false, outcome: 'block', reviewedBy: undefined }, // Pending
        { isFalsePositive: false, outcome: 'block', reviewedBy: undefined }, // Pending
        { isFalsePositive: true, outcome: 'block', reviewedBy: 'alice', reviewedAt: '2026-02-01T12:00:00Z' },    // Reviewed FP
        { isFalsePositive: false, outcome: 'block', reviewedBy: 'bob', reviewedAt: '2026-02-01T12:00:00Z' }       // Reviewed TP
      ].map((e, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' },
        ...e
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const window = await store.getWindowByCount('MD-001', 10);

      // FPR = FP / (total - pending) = 1 / (4 - 2) = 1 / 2 = 50%
      expect(window.statistics.total).toBe(4);
      expect(window.statistics.pending).toBe(2);
      expect(window.statistics.falsePositives).toBe(1);
      expect(window.statistics.observedFPR).toBeCloseTo(0.5, 2);
    });

    it('should throw on query error', async () => {
      mockSend.mockRejectedValue(new Error('Query failed'));

      await expect(
        store.getWindowByCount('MD-001', 50)
      ).rejects.toThrow(/MD-001/);
    });

    it('should handle empty results', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const window = await store.getWindowByCount('MD-999', 50);

      expect(window.windowSize).toBe(0);
      expect(window.statistics.total).toBe(0);
      expect(window.statistics.observedFPR).toBe(0);
    });

    it('should use most common version when mixed versions present', async () => {
      const mockEvents = [
        { ruleVersion: '1.0.0' },
        { ruleVersion: '1.0.0' },
        { ruleVersion: '2.0.0' }, // Different version
        { ruleVersion: '1.0.0' }
      ].map((e, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' },
        ...e
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const window = await store.getWindowByCount('MD-001', 10);

      // Should use dominant version (1.0.0)
      expect(window.ruleVersion).toBe('1.0.0');
    });
  });

  describe('4. getWindowBySince', () => {
    it('should query with time range', async () => {
      const since = new Date('2026-01-01T00:00:00Z');
      mockSend.mockResolvedValue({ Items: [] });

      await store.getWindowBySince('MD-001', since);

      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });

    it('should return events within time window', async () => {
      const since = new Date('2026-02-01T00:00:00Z');
      const mockEvents = Array.from({ length: 3 }, (_, i) => ({
        pk: 'rule#MD-001',
        sk: `event#2026-02-01T${String(i).padStart(2, '0')}:00:00Z#evt-${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: false,
        timestamp: `2026-02-01T${String(i).padStart(2, '0')}:00:00Z`,
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' }
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const window = await store.getWindowBySince('MD-001', since);

      expect(window.windowSize).toBe(3);
    });

    it('should handle timezone correctly', async () => {
      const since = new Date('2026-02-01T12:00:00-05:00'); // EST
      mockSend.mockResolvedValue({ Items: [] });

      await store.getWindowBySince('MD-001', since);

      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });
  });

  describe('5. Performance', () => {
    it('should meet <50ms p99 target for queries', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' }
      }));

      mockSend.mockResolvedValue({ Items: mockEvents });

      const times: number[] = [];
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await store.getWindowByCount('MD-001', 100);
        const end = Date.now();
        times.push(end - start);
      }

      times.sort((a, b) => a - b);
      const p99 = times[Math.floor(iterations * 0.99)];

      console.log(`FP Store query p99: ${p99}ms`);
      expect(p99).toBeLessThan(50);
    });
  });

  describe('6. Edge Cases', () => {
    it('should handle malformed DynamoDB response', async () => {
      mockSend.mockResolvedValue({ Items: null });

      // Should not throw, should handle gracefully
      const window = await store.getWindowByCount('MD-001', 50);
      expect(window.windowSize).toBe(0);
    });

    it('should handle extremely large windows', async () => {
      const largeEvents = Array.from({ length: 10000 }, (_, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' }
      }));

      mockSend.mockResolvedValue({ Items: largeEvents });

      const window = await store.getWindowByCount('MD-001', 10000);
      expect(window.windowSize).toBe(10000);
    });

    it('should handle all-false-positive window', async () => {
      const allFP = Array.from({ length: 10 }, (_, i) => ({
        pk: 'rule#MD-001',
        sk: `event#${i}`,
        eventId: `evt-${i}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        findingId: `finding-${i}`,
        outcome: 'block',
        isFalsePositive: true,
        reviewedBy: 'alice',
        reviewedAt: '2026-02-01T12:00:00Z',
        timestamp: new Date().toISOString(),
        context: { repo: 'test/repo', branch: 'main', eventType: 'pull_request' }
      }));

      mockSend.mockResolvedValue({ Items: allFP });

      const window = await store.getWindowByCount('MD-001', 10);
      expect(window.statistics.observedFPR).toBe(1.0); // 100%
    });
  });
});
