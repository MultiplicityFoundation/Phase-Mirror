/**
 * Unit tests for ConsentStore (store.ts)
 */
import { ConsentStore } from '../store.js';
import { CURRENT_CONSENT_POLICY } from '../schema.js';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(),
    },
  };
});

describe('ConsentStore', () => {
  let store: ConsentStore;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });

    store = new ConsentStore({
      tableName: 'test-consent-table',
      region: 'us-east-1',
      cacheTTLSeconds: 300,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    store.clearCache();
  });

  describe('getConsentSummary', () => {
    it('should return null when no consent record exists', async () => {
      mockSend.mockResolvedValue({ Item: null });

      const result = await store.getConsentSummary('test-org');
      
      expect(result).toBeNull();
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetCommand));
    });

    it('should return consent summary when record exists', async () => {
      const mockItem = {
        orgId: 'hashed-org-id',
        orgName: 'Test Organization',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: '1.2',
          },
        },
        grantedBy: 'hashed-admin-id',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.getConsentSummary('test-org');
      
      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('hashed-org-id');
      expect(result?.resources.fp_patterns.state).toBe('granted');
    });

    it('should cache consent data', async () => {
      const mockItem = {
        orgId: 'hashed-org-id',
        resources: {},
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      // First call - should hit DynamoDB
      await store.getConsentSummary('test-org');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await store.getConsentSummary('test-org');
      expect(mockSend).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should throw error on DynamoDB failure', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB error'));

      await expect(store.getConsentSummary('test-org')).rejects.toThrow('DynamoDB error');
    });
  });

  describe('checkResourceConsent', () => {
    it('should return not_requested when no consent record exists', async () => {
      mockSend.mockResolvedValue({ Item: null });

      const result = await store.checkResourceConsent('test-org', 'fp_patterns');
      
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not_requested');
      expect(result.resource).toBe('fp_patterns');
    });

    it('should return granted when consent is valid', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkResourceConsent('test-org', 'fp_patterns');
      
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
      expect(result.resource).toBe('fp_patterns');
      expect(result.version).toBe(CURRENT_CONSENT_POLICY.version);
    });

    it('should return expired when consent has expired', async () => {
      const expiredDate = new Date(Date.now() - 86400000); // 1 day ago

      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            expiresAt: expiredDate,
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkResourceConsent('test-org', 'fp_patterns');
      
      expect(result.granted).toBe(false);
      expect(result.state).toBe('expired');
      expect(result.reason).toContain('expired');
    });

    it('should detect version mismatch', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: '1.0', // Old version
          },
        },
        grantedBy: 'admin',
        consentVersion: '1.0',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkResourceConsent('test-org', 'fp_patterns');
      
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('version mismatch');
    });
  });

  describe('checkMultipleResources', () => {
    it('should check multiple resources correctly', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
          fp_metrics: {
            resource: 'fp_metrics',
            state: 'revoked',
            grantedAt: new Date('2024-01-01'),
            revokedAt: new Date('2024-02-01'),
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkMultipleResources('test-org', [
        'fp_patterns',
        'fp_metrics',
      ]);
      
      expect(result.allGranted).toBe(false);
      expect(result.results.fp_patterns.granted).toBe(true);
      expect(result.results.fp_metrics.granted).toBe(false);
      expect(result.missingConsent).toEqual(['fp_metrics']);
    });

    it('should return allGranted true when all resources have consent', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
          fp_metrics: {
            resource: 'fp_metrics',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkMultipleResources('test-org', [
        'fp_patterns',
        'fp_metrics',
      ]);
      
      expect(result.allGranted).toBe(true);
      expect(result.missingConsent).toEqual([]);
    });
  });

  describe('grantConsent', () => {
    it('should create new consent record when none exists', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: null }) // getConsentSummary returns null
        .mockResolvedValueOnce({}); // PutCommand succeeds

      await store.grantConsent('test-org', 'fp_patterns', 'admin-user');

      expect(mockSend).toHaveBeenCalledWith(expect.any(GetCommand));
      expect(mockSend).toHaveBeenCalledWith(expect.any(PutCommand));
      
      const putCall = mockSend.mock.calls.find(
        (call) => call[0] instanceof PutCommand
      );
      expect(putCall).toBeDefined();
      expect(putCall[0].input.Item.resources.fp_patterns.state).toBe('granted');
    });

    it('should update existing consent record', async () => {
      const existingItem = {
        orgId: 'test-org',
        resources: {},
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend
        .mockResolvedValueOnce({ Item: existingItem })
        .mockResolvedValueOnce({});

      await store.grantConsent('test-org', 'fp_patterns', 'admin-user');

      const putCall = mockSend.mock.calls.find(
        (call) => call[0] instanceof PutCommand
      );
      expect(putCall[0].input.Item.resources.fp_patterns.state).toBe('granted');
      expect(putCall[0].input.Item.history.length).toBeGreaterThan(0);
    });

    it('should support expiration date', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: null })
        .mockResolvedValueOnce({});

      const expiresAt = new Date('2025-01-01');
      await store.grantConsent('test-org', 'fp_patterns', 'admin-user', expiresAt);

      const putCall = mockSend.mock.calls.find(
        (call) => call[0] instanceof PutCommand
      );
      expect(putCall[0].input.Item.resources.fp_patterns.expiresAt).toEqual(expiresAt);
    });

    it('should invalidate cache after granting consent', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {},
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // First: cache the item
      mockSend.mockResolvedValueOnce({ Item: mockItem });
      await store.getConsentSummary('test-org');
      
      // Second: grant consent (should invalidate)
      mockSend
        .mockResolvedValueOnce({ Item: mockItem })
        .mockResolvedValueOnce({});
      await store.grantConsent('test-org', 'fp_patterns', 'admin');

      // Third: next call should hit DynamoDB again
      mockSend.mockResolvedValueOnce({ Item: mockItem });
      await store.getConsentSummary('test-org');

      // Expect: 1 (initial) + 1 (grant get) + 1 (post-grant get) = 3 reads, 1 write
      const getCommands = mockSend.mock.calls.filter(
        (call) => call[0] instanceof GetCommand
      );
      expect(getCommands.length).toBe(3);
    });
  });

  describe('revokeConsent', () => {
    it('should revoke consent for a resource', async () => {
      const existingItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
          },
        },
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend
        .mockResolvedValueOnce({ Item: existingItem })
        .mockResolvedValueOnce({});

      await store.revokeConsent('test-org', 'fp_patterns', 'admin-user');

      const putCall = mockSend.mock.calls.find(
        (call) => call[0] instanceof PutCommand
      );
      expect(putCall[0].input.Item.resources.fp_patterns.state).toBe('revoked');
      expect(putCall[0].input.Item.resources.fp_patterns.revokedAt).toBeDefined();
    });

    it('should throw error when no consent record exists', async () => {
      mockSend.mockResolvedValue({ Item: null });

      await expect(
        store.revokeConsent('test-org', 'fp_patterns', 'admin-user')
      ).rejects.toThrow('No consent record found');
    });

    it('should not fail when revoking already revoked consent', async () => {
      const existingItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'revoked',
            grantedAt: new Date('2024-01-01'),
            revokedAt: new Date('2024-02-01'),
          },
        },
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValueOnce({ Item: existingItem });

      await expect(
        store.revokeConsent('test-org', 'fp_patterns', 'admin-user')
      ).resolves.not.toThrow();
    });
  });

  describe('legacy methods', () => {
    it('checkConsent should return explicit when any resource is granted', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.checkConsent('test-org');
      expect(result).toBe('explicit');
    });

    it('checkConsent should return none when no consent exists', async () => {
      mockSend.mockResolvedValue({ Item: null });

      const result = await store.checkConsent('test-org');
      expect(result).toBe('none');
    });

    it('hasValidConsent should return true when consent is granted', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2024-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      const result = await store.hasValidConsent('test-org');
      expect(result).toBe(true);
    });
  });

  describe('cache operations', () => {
    it('clearCache should clear all cached entries', async () => {
      const mockItem = {
        orgId: 'test-org',
        resources: {},
        grantedBy: 'admin',
        consentVersion: '1.2',
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      // Cache an item
      await store.getConsentSummary('test-org');
      expect(store.getCacheStats().size).toBe(1);

      // Clear cache
      store.clearCache();
      expect(store.getCacheStats().size).toBe(0);
    });

    it('getCacheStats should return cache size', async () => {
      const stats = store.getCacheStats();
      expect(stats).toHaveProperty('size');
      expect(typeof stats.size).toBe('number');
    });
  });
});
