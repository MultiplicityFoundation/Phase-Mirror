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
import type { FPEvent } from '../types.js';
import { DynamoDBClient, PutItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

// Mock AWS SDK utilities (module-level constructors are mocked by global setup)
jest.mock('@aws-sdk/util-dynamodb');

describe('DynamoDBFPStore', () => {
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

    store = new DynamoDBFPStore({
      tableName: 'test-fp-events',
      region: 'us-east-1',
      ttlDays: 90,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordEvent', () => {
    const mockEvent: FPEvent = {
      eventId: 'evt-123',
      ruleId: 'rule-001',
      ruleVersion: 'v1',
      findingId: 'finding-456',
      outcome: 'block',
      isFalsePositive: false,
      timestamp: new Date('2026-01-15T10:00:00Z'),
      context: {
        repo: 'test-repo',
        branch: 'main',
        eventType: 'pull_request',
      },
    };

    it('should successfully record an event', async () => {
      mockSend.mockResolvedValueOnce({});

      await store.recordEvent(mockEvent);

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutItemCommand));
    });

    it('should throw error on duplicate event', async () => {
      const duplicateError = new Error('Conditional check failed');
      duplicateError.name = 'ConditionalCheckFailedException';
      mockSend.mockRejectedValueOnce(duplicateError);

      await expect(store.recordEvent(mockEvent)).rejects.toThrow(
        `Duplicate FP event: ruleId=${mockEvent.ruleId}, eventId=${mockEvent.eventId}, findingId=${mockEvent.findingId}`
      );
    });

    it('should throw error with context on DynamoDB failure', async () => {
      const dbError = new Error('DynamoDB service error');
      dbError.name = 'ServiceUnavailable';
      mockSend.mockRejectedValueOnce(dbError);

      await expect(store.recordEvent(mockEvent)).rejects.toThrow(
        `Failed to record FP event: ruleId=${mockEvent.ruleId}`
      );
    });
  });

  describe('markFalsePositive', () => {
    const findingId = 'finding-789';
    const reviewedBy = 'reviewer@example.com';
    const ticket = 'TICKET-123';

    it('should successfully mark a finding as false positive', async () => {
      // Mock successful query
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            pk: 'rule#rule-001',
            sk: 'event#2026-01-15T10:00:00.000Z#evt-123',
            eventId: 'evt-123',
            ruleId: 'rule-001',
          },
        ],
      });
      // Mock successful update
      mockSend.mockResolvedValueOnce({});

      await store.markFalsePositive(findingId, reviewedBy, ticket);

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(QueryCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(UpdateItemCommand));
    });

    it('should throw error when finding not found', async () => {
      // Mock empty query result
      mockSend.mockResolvedValueOnce({
        Items: [],
      });

      await expect(store.markFalsePositive(findingId, reviewedBy, ticket)).rejects.toThrow(
        `Finding ${findingId} not found in FP store`
      );
    });

    it('should throw error with context on query failure', async () => {
      const queryError = new Error('Query failed');
      mockSend.mockRejectedValueOnce(queryError);

      await expect(store.markFalsePositive(findingId, reviewedBy, ticket)).rejects.toThrow(
        `Failed to mark finding as false positive: findingId=${findingId}`
      );
    });

    it('should throw error with context on update failure', async () => {
      // Mock successful query
      mockSend.mockResolvedValueOnce({
        Items: [
          {
            pk: 'rule#rule-001',
            sk: 'event#2026-01-15T10:00:00.000Z#evt-123',
          },
        ],
      });
      // Mock failed update
      const updateError = new Error('Update failed');
      mockSend.mockRejectedValueOnce(updateError);

      await expect(store.markFalsePositive(findingId, reviewedBy, ticket)).rejects.toThrow(
        `Failed to mark finding as false positive: findingId=${findingId}`
      );
    });
  });

  describe('getWindowByCount', () => {
    const ruleId = 'rule-002';

    it('should return window with correct FPR calculation', async () => {
      const mockItems = [
        {
          eventId: 'evt-1',
          ruleId: 'rule-002',
          ruleVersion: 'v1',
          findingId: 'finding-1',
          outcome: 'block',
          isFalsePositive: true,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T10:00:00Z',
          timestamp: '2026-01-15T10:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-2',
          ruleId: 'rule-002',
          ruleVersion: 'v1',
          findingId: 'finding-2',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T11:00:00Z',
          timestamp: '2026-01-15T11:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-3',
          ruleId: 'rule-002',
          ruleVersion: 'v1',
          findingId: 'finding-3',
          outcome: 'block',
          isFalsePositive: false,
          timestamp: '2026-01-15T12:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockItems,
      });

      const window = await store.getWindowByCount(ruleId, 10);

      expect(window.ruleId).toBe(ruleId);
      expect(window.statistics.total).toBe(3);
      expect(window.statistics.falsePositives).toBe(1);
      expect(window.statistics.pending).toBe(1);
      // FPR = 1 / (3 - 1) = 1 / 2 = 0.5
      expect(window.statistics.observedFPR).toBe(0.5);
    });

    it('should throw error on query failure', async () => {
      const queryError = new Error('Query failed');
      mockSend.mockRejectedValueOnce(queryError);

      await expect(store.getWindowByCount(ruleId, 10)).rejects.toThrow(
        `Failed to get FP window by count: ruleId=${ruleId}, count=10`
      );
    });
  });

  describe('getWindowBySince', () => {
    const ruleId = 'rule-003';
    const since = new Date('2026-01-01T00:00:00Z');

    it('should return window for events since date', async () => {
      const mockItems = [
        {
          eventId: 'evt-10',
          ruleId: 'rule-003',
          ruleVersion: 'v2',
          findingId: 'finding-10',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T10:00:00Z',
          timestamp: '2026-01-15T10:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockItems,
      });

      const window = await store.getWindowBySince(ruleId, since);

      expect(window.ruleId).toBe(ruleId);
      expect(window.statistics.total).toBe(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(QueryCommand));
    });

    it('should throw error on query failure', async () => {
      const queryError = new Error('Query failed');
      mockSend.mockRejectedValueOnce(queryError);

      await expect(store.getWindowBySince(ruleId, since)).rejects.toThrow(
        `Failed to get FP window by since: ruleId=${ruleId}, since=${since.toISOString()}`
      );
    });
  });

  describe('computeWindow - mixed versions', () => {
    it('should use most common version when events have mixed versions', async () => {
      const mockItems = [
        {
          eventId: 'evt-1',
          ruleId: 'rule-004',
          ruleVersion: 'v1',
          findingId: 'finding-1',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T10:00:00Z',
          timestamp: '2026-01-15T10:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-2',
          ruleId: 'rule-004',
          ruleVersion: 'v2',
          findingId: 'finding-2',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T11:00:00Z',
          timestamp: '2026-01-15T11:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-3',
          ruleId: 'rule-004',
          ruleVersion: 'v2',
          findingId: 'finding-3',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T12:00:00Z',
          timestamp: '2026-01-15T12:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockItems,
      });

      const window = await store.getWindowByCount('rule-004', 10);

      // v2 appears twice, v1 appears once, so v2 should be chosen
      expect(window.ruleVersion).toBe('v2');
    });
  });

  describe('computeWindow - FPR edge cases', () => {
    it('should return 0 FPR when no events are reviewed', async () => {
      const mockItems = [
        {
          eventId: 'evt-1',
          ruleId: 'rule-005',
          ruleVersion: 'v1',
          findingId: 'finding-1',
          outcome: 'block',
          isFalsePositive: false,
          timestamp: '2026-01-15T10:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockItems,
      });

      const window = await store.getWindowByCount('rule-005', 10);

      expect(window.statistics.pending).toBe(1);
      expect(window.statistics.observedFPR).toBe(0);
    });

    it('should exclude pending events from FPR denominator', async () => {
      const mockItems = [
        {
          eventId: 'evt-1',
          ruleId: 'rule-006',
          ruleVersion: 'v1',
          findingId: 'finding-1',
          outcome: 'block',
          isFalsePositive: true,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T10:00:00Z',
          timestamp: '2026-01-15T10:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-2',
          ruleId: 'rule-006',
          ruleVersion: 'v1',
          findingId: 'finding-2',
          outcome: 'block',
          isFalsePositive: false,
          timestamp: '2026-01-15T11:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
        {
          eventId: 'evt-3',
          ruleId: 'rule-006',
          ruleVersion: 'v1',
          findingId: 'finding-3',
          outcome: 'block',
          isFalsePositive: false,
          reviewedBy: 'reviewer1',
          reviewedAt: '2026-01-15T12:00:00Z',
          timestamp: '2026-01-15T12:00:00Z',
          context: { repo: 'test-repo', branch: 'main', eventType: 'pull_request' as const },
        },
      ];

      mockSend.mockResolvedValueOnce({
        Items: mockItems,
      });

      const window = await store.getWindowByCount('rule-006', 10);

      // Total = 3, Pending = 1, Reviewed = 2, FP = 1
      // FPR = 1 / 2 = 0.5
      expect(window.statistics.total).toBe(3);
      expect(window.statistics.pending).toBe(1);
      expect(window.statistics.falsePositives).toBe(1);
      expect(window.statistics.observedFPR).toBe(0.5);
    });
  });
});
