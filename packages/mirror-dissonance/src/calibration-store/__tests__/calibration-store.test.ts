/**
 * Unit tests for Calibration Store
 * Tests k-Anonymity enforcement and FP aggregation
 */
import { DynamoDBCalibrationStore, NoOpCalibrationStore, createCalibrationStore } from '../index.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('DynamoDBCalibrationStore', () => {
  let store: DynamoDBCalibrationStore;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });

    store = new DynamoDBCalibrationStore({
      tableName: 'test-calibration',
      region: 'us-east-1',
      kAnonymityThreshold: 10,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('aggregateFPsByRule', () => {
    it('should aggregate FPs when k-anonymity met', async () => {
      const items = Array.from({ length: 15 }, (_, i) => ({
        ruleId: 'MD-001',
        orgIdHash: `org-hash-${i % 12}`, // 12 unique orgs
        context: { isFalsePositive: i % 3 === 0 },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.aggregateFPsByRule('MD-001');

      expect('ruleId' in result).toBe(true);
      if ('ruleId' in result) {
        expect(result.ruleId).toBe('MD-001');
        expect(result.orgCount).toBe(12);
        expect(result.meetsKAnonymity).toBe(true);
      }
    });

    it('should reject when k-anonymity not met', async () => {
      const items = Array.from({ length: 8 }, (_, i) => ({
        ruleId: 'MD-001',
        orgIdHash: `org-hash-${i}`, // 8 unique orgs < 10
        context: { isFalsePositive: true },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.aggregateFPsByRule('MD-001');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('INSUFFICIENT_K_ANONYMITY');
        expect(result.requiredK).toBe(10);
        expect(result.actualK).toBe(8);
      }
    });

    it('should count false positives correctly', async () => {
      const items = [
        ...Array.from({ length: 10 }, (_, i) => ({
          ruleId: 'MD-001',
          orgIdHash: `org-${i}`,
          context: { isFalsePositive: true },
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          ruleId: 'MD-001',
          orgIdHash: `org-${i}`,
          context: { isFalsePositive: false },
        })),
      ];

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.aggregateFPsByRule('MD-001');

      if ('ruleId' in result) {
        expect(result.totalFPs).toBe(10);
      }
    });

    it('should handle empty results', async () => {
      mockSend.mockResolvedValue({ Items: [] });

      const result = await store.aggregateFPsByRule('MD-001');

      expect('error' in result).toBe(true);
    });
  });

  describe('getRuleFPRate', () => {
    it('should get FP rate for date range', async () => {
      const items = Array.from({ length: 20 }, (_, i) => ({
        ruleId: 'MD-002',
        orgIdHash: `org-hash-${i % 15}`,
        timestamp: '2024-01-15T00:00:00Z',
        context: { isFalsePositive: i % 4 === 0 },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getRuleFPRate(
        'MD-002',
        '2024-01-01T00:00:00Z',
        '2024-01-31T00:00:00Z'
      );

      if ('ruleId' in result) {
        expect(result.ruleId).toBe('MD-002');
        expect(result.orgCount).toBe(15);
      }
    });

    it('should reject when k-anonymity not met with date range', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({
        ruleId: 'MD-002',
        orgIdHash: `org-${i}`,
        timestamp: '2024-01-15T00:00:00Z',
        context: { isFalsePositive: true },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getRuleFPRate('MD-002', '2024-01-01', '2024-01-31');

      expect('error' in result).toBe(true);
    });

    it('should work without date range', async () => {
      const items = Array.from({ length: 12 }, (_, i) => ({
        ruleId: 'MD-002',
        orgIdHash: `org-${i}`,
        context: { isFalsePositive: true },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getRuleFPRate('MD-002');

      if ('ruleId' in result) {
        expect(result.meetsKAnonymity).toBe(true);
      }
    });
  });

  describe('getAllRuleFPRates', () => {
    it('should get all rules meeting k-anonymity', async () => {
      const items = [
        ...Array.from({ length: 15 }, (_, i) => ({
          ruleId: 'MD-001',
          orgIdHash: `org-${i % 12}`,
          context: { isFalsePositive: i % 3 === 0 },
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          ruleId: 'MD-002',
          orgIdHash: `org2-${i}`,
          context: { isFalsePositive: i % 2 === 0 },
        })),
      ];

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getAllRuleFPRates();

      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        expect(result.every(r => r.meetsKAnonymity)).toBe(true);
      }
    });

    it('should reject when global k-anonymity not met', async () => {
      const items = Array.from({ length: 8 }, (_, i) => ({
        ruleId: 'MD-001',
        orgIdHash: `org-${i}`,
        context: { isFalsePositive: true },
      }));

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getAllRuleFPRates();

      expect('error' in result).toBe(true);
    });

    it('should filter out rules not meeting k-anonymity', async () => {
      const items = [
        ...Array.from({ length: 15 }, (_, i) => ({
          ruleId: 'MD-001',
          orgIdHash: `org1-${i % 12}`, // 12 orgs - meets threshold
          context: { isFalsePositive: true },
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          ruleId: 'MD-002',
          orgIdHash: `org2-${i}`, // 5 orgs - doesn't meet threshold
          context: { isFalsePositive: true },
        })),
      ];

      mockSend.mockResolvedValue({ Items: items });

      const result = await store.getAllRuleFPRates();

      if (Array.isArray(result)) {
        const md001 = result.find(r => r.ruleId === 'MD-001');
        const md002 = result.find(r => r.ruleId === 'MD-002');

        expect(md001).toBeDefined();
        expect(md002).toBeUndefined();
      }
    });
  });
});

describe('NoOpCalibrationStore', () => {
  let store: NoOpCalibrationStore;

  beforeEach(() => {
    store = new NoOpCalibrationStore();
  });

  describe('aggregateFPsByRule', () => {
    it('should return k-anonymity error', async () => {
      const result = await store.aggregateFPsByRule('MD-001');

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toBe('INSUFFICIENT_K_ANONYMITY');
      }
    });
  });

  describe('getRuleFPRate', () => {
    it('should return k-anonymity error', async () => {
      const result = await store.getRuleFPRate('MD-001');

      expect('error' in result).toBe(true);
    });
  });

  describe('getAllRuleFPRates', () => {
    it('should return empty array', async () => {
      const result = await store.getAllRuleFPRates();

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result.length).toBe(0);
      }
    });
  });
});

describe('createCalibrationStore', () => {
  it('should create DynamoDBCalibrationStore with config', () => {
    const store = createCalibrationStore({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    expect(store).toBeInstanceOf(DynamoDBCalibrationStore);
  });

  it('should create NoOpCalibrationStore without config', () => {
    const store = createCalibrationStore();
    expect(store).toBeInstanceOf(NoOpCalibrationStore);
  });
});
