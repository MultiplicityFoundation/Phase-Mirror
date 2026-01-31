/**
 * Unit tests for Ingest Handler
 * Tests consent validation, anonymization, and event storage
 */
import { IngestHandler, createIngestHandler } from '../index.js';
import { NoOpConsentStore } from '../../consent-store/index.js';
import { NoOpAnonymizer } from '../../anonymizer/index.js';

describe('IngestHandler', () => {
  let handler: IngestHandler;
  let mockConsentStore: any;
  let mockAnonymizer: any;
  let mockFPStore: any;

  beforeEach(() => {
    mockConsentStore = {
      checkConsent: jest.fn(),
    };

    mockAnonymizer = {
      anonymizeOrgId: jest.fn(),
    };

    mockFPStore = {
      recordFalsePositive: jest.fn(),
    };

    handler = new IngestHandler({
      consentStore: mockConsentStore,
      anonymizer: mockAnonymizer,
      fpStore: mockFPStore,
      batchDelayMs: 1000,
    });
  });

  describe('ingest', () => {
    it('should successfully ingest event with consent', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = await handler.ingest(event);

      expect(result.success).toBe(true);
      expect(mockConsentStore.checkConsent).toHaveBeenCalledWith('test-org');
      expect(mockAnonymizer.anonymizeOrgId).toHaveBeenCalledWith('test-org');
      expect(mockFPStore.recordFalsePositive).toHaveBeenCalled();
    });

    it('should reject event without consent', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('none');

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = await handler.ingest(event);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('No consent');
      expect(mockAnonymizer.anonymizeOrgId).not.toHaveBeenCalled();
      expect(mockFPStore.recordFalsePositive).not.toHaveBeenCalled();
    });

    it('should accept event with implicit consent', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('implicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: false,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = await handler.ingest(event);

      expect(result.success).toBe(true);
    });

    it('should randomize timestamp', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const originalTimestamp = '2024-01-01T00:00:00Z';
      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: originalTimestamp,
      };

      await handler.ingest(event);

      const recordedEvent = mockFPStore.recordFalsePositive.mock.calls[0][0];
      expect(recordedEvent.timestamp).not.toBe(originalTimestamp);
    });

    it('should generate unique event IDs', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      await handler.ingest(event);
      await handler.ingest(event);

      const id1 = mockFPStore.recordFalsePositive.mock.calls[0][0].id;
      const id2 = mockFPStore.recordFalsePositive.mock.calls[1][0].id;

      expect(id1).not.toBe(id2);
    });

    it('should include consent type in stored event', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: '2024-01-01T00:00:00Z',
      };

      await handler.ingest(event);

      const recordedEvent = mockFPStore.recordFalsePositive.mock.calls[0][0];
      expect(recordedEvent.consent).toBe('explicit');
    });

    it('should throw error for invalid timestamp', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');

      const event = {
        orgId: 'test-org',
        ruleId: 'MD-001',
        isFalsePositive: true,
        timestamp: 'invalid-timestamp',
      };

      await expect(handler.ingest(event)).rejects.toThrow('Invalid timestamp format');
    });
  });

  describe('ingestBatch', () => {
    it('should process multiple events', async () => {
      mockConsentStore.checkConsent.mockResolvedValue('explicit');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const events = [
        {
          orgId: 'org-1',
          ruleId: 'MD-001',
          isFalsePositive: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          orgId: 'org-2',
          ruleId: 'MD-002',
          isFalsePositive: false,
          timestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const results = await handler.ingestBatch(events);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should handle mix of success and failure', async () => {
      mockConsentStore.checkConsent
        .mockResolvedValueOnce('explicit')
        .mockResolvedValueOnce('none');
      mockAnonymizer.anonymizeOrgId.mockResolvedValue('hashed-org-id');
      mockFPStore.recordFalsePositive.mockResolvedValue(undefined);

      const events = [
        {
          orgId: 'org-1',
          ruleId: 'MD-001',
          isFalsePositive: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
        {
          orgId: 'org-2',
          ruleId: 'MD-002',
          isFalsePositive: false,
          timestamp: '2024-01-02T00:00:00Z',
        },
      ];

      const results = await handler.ingestBatch(events);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      mockConsentStore.checkConsent.mockRejectedValue(new Error('Service error'));

      const events = [
        {
          orgId: 'org-1',
          ruleId: 'MD-001',
          isFalsePositive: true,
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      const results = await handler.ingestBatch(events);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].reason).toContain('Service error');
    });

    it('should process empty batch', async () => {
      const results = await handler.ingestBatch([]);

      expect(results).toHaveLength(0);
    });
  });
});

describe('createIngestHandler', () => {
  it('should create IngestHandler with config', () => {
    const handler = createIngestHandler({
      consentStore: new NoOpConsentStore(),
      anonymizer: new NoOpAnonymizer(),
      fpStore: {
        recordFalsePositive: jest.fn(),
        isFalsePositive: jest.fn(),
        getFalsePositivesByRule: jest.fn(),
      },
    });

    expect(handler).toBeInstanceOf(IngestHandler);
  });
});
