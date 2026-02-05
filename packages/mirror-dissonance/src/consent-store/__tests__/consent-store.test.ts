/**
 * Unit tests for Consent Store
 * Target coverage: 85%
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DynamoDBConsentStore, NoOpConsentStore, createConsentStore } from '../index.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';


jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual: any = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(),
    },
  };
});

describe('DynamoDBConsentStore', () => {
  let store: DynamoDBConsentStore;
  let mockSend: any;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });

    store = new DynamoDBConsentStore({
      tableName: 'test-consent',
      region: 'us-east-1',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkConsent', () => {
    it('should return explicit consent type when found', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'explicit',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkConsent('test-org');
      expect(result).toBe('explicit');
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetCommand));
    });

    it('should return implicit consent type when found', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'implicit',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkConsent('test-org');
      expect(result).toBe('implicit');
    });

    it('should return none when consent not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await store.checkConsent('test-org');
      expect(result).toBe('none');
    });

    it('should return none when consent is expired', async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 day ago

      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'explicit',
          grantedAt: '2024-01-01T00:00:00Z',
          expiresAt: expiredDate,
        },
      });

      const result = await store.checkConsent('test-org');
      expect(result).toBe('none');
    });

    it('should handle errors gracefully and return none', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      const result = await store.checkConsent('test-org');
      expect(result).toBe('none');
    });
  });

  describe('recordConsent', () => {
    it('should record consent with all fields', async () => {
      mockSend.mockResolvedValue({});

      const record = {
        orgId: 'test-org',
        consentType: 'explicit' as const,
        grantedAt: '2024-01-01T00:00:00Z',
        expiresAt: '2025-01-01T00:00:00Z',
        scope: ['repo:read', 'repo:write'],
      };

      await store.recordConsent(record);

      expect(mockSend).toHaveBeenCalledWith(expect.any(PutCommand));
      const putCommand = mockSend.mock.calls[0][0];
      expect(putCommand.input).toBeDefined();
      expect(putCommand.input.Item).toEqual(record);
    });

    it('should record consent without expiration', async () => {
      mockSend.mockResolvedValue({});

      const record = {
        orgId: 'test-org',
        consentType: 'implicit' as const,
        grantedAt: '2024-01-01T00:00:00Z',
        scope: ['repo:read'],
      };

      await store.recordConsent(record);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw error on DynamoDB failure', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      const record = {
        orgId: 'test-org',
        consentType: 'explicit' as const,
        grantedAt: '2024-01-01T00:00:00Z',
        scope: [],
      };

      await expect(store.recordConsent(record)).rejects.toThrow('DynamoDB error');
    });
  });

  describe('hasValidConsent', () => {
    it('should return true for explicit consent', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'explicit',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.hasValidConsent('test-org');
      expect(result).toBe(true);
    });

    it('should return true for implicit consent', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'implicit',
          grantedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.hasValidConsent('test-org');
      expect(result).toBe(true);
    });

    it('should return false for no consent', async () => {
      mockSend.mockResolvedValue({});

      const result = await store.hasValidConsent('test-org');
      expect(result).toBe(false);
    });

    it('should return false for expired consent', async () => {
      const expiredDate = new Date(Date.now() - 86400000).toISOString();

      mockSend.mockResolvedValue({
        Item: {
          orgId: 'test-org',
          consentType: 'explicit',
          grantedAt: '2024-01-01T00:00:00Z',
          expiresAt: expiredDate,
        },
      });

      const result = await store.hasValidConsent('test-org');
      expect(result).toBe(false);
    });
  });
});

describe('NoOpConsentStore', () => {
  let store: NoOpConsentStore;

  beforeEach(() => {
    store = new NoOpConsentStore();
  });

  describe('checkConsent', () => {
    it('should always return implicit', async () => {
      const result = await store.checkConsent('any-org');
      expect(result).toBe('implicit');
    });
  });

  describe('recordConsent', () => {
    it('should not throw', async () => {
      const record = {
        orgId: 'test-org',
        consentType: 'explicit' as const,
        grantedAt: '2024-01-01T00:00:00Z',
        scope: [],
      };

      await expect(store.recordConsent(record)).resolves.not.toThrow();
    });
  });

  describe('hasValidConsent', () => {
    it('should always return true', async () => {
      const result = await store.hasValidConsent('any-org');
      expect(result).toBe(true);
    });
  });
});

describe('createConsentStore', () => {
  it('should create DynamoDBConsentStore with config', () => {
    const store = createConsentStore({
      tableName: 'test-table',
      region: 'us-east-1',
    });

    expect(store).toBeInstanceOf(DynamoDBConsentStore);
  });

  it('should create NoOpConsentStore without config', () => {
    const store = createConsentStore();
    expect(store).toBeInstanceOf(NoOpConsentStore);
  });

  it('should create NoOpConsentStore with incomplete config', () => {
    const store = createConsentStore({ tableName: '' });
    expect(store).toBeInstanceOf(NoOpConsentStore);
  });
});
