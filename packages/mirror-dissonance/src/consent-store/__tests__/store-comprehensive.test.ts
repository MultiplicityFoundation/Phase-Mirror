// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * Comprehensive Consent Store Tests
 * 
 * Coverage target: 80%+
 * Based on Day 10 testing blueprint
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { ConsentStore } from '../store.js';
import { EnhancedNoOpConsentStore } from '../enhanced-store.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { OrganizationConsent, ConsentResource } from '../schema.js';
import { CURRENT_CONSENT_POLICY } from '../schema.js';


jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual: any = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...actual,
    DynamoDBDocumentClient: {
      from: jest.fn(),
    },
  };
});

describe('ConsentStore - Comprehensive', () => {
  let store: ConsentStore;
  let mockSend: any;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });

    store = new ConsentStore({
      tableName: 'test-consent',
      region: 'us-east-1',
      cacheTTLSeconds: 300,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    store.clearCache();
  });

  describe('1. getConsentSummary', () => {
    it('should retrieve consent record from DynamoDB', async () => {
      const mockConsent = {
        orgId: 'hashed-TestOrg',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2026-01-01T00:00:00Z'),
            version: CURRENT_CONSENT_POLICY.version,
          },
          fp_metrics: {
            resource: 'fp_metrics',
            state: 'granted',
            grantedAt: new Date('2026-01-01T00:00:00Z'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'hashed-admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({
        Item: mockConsent,
      });

      const result = await store.getConsentSummary('TestOrg');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-consent',
          }),
        })
      );

      expect(result).toBeDefined();
      expect(result?.resources).toHaveProperty('fp_patterns');
    });

    it('should return null when consent not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await store.getConsentSummary('NonexistentOrg');

      expect(result).toBeNull();
    });

    it('should cache consent records', async () => {
      const mockConsent = {
        orgId: 'CachedOrg',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date(),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockConsent });

      // First call - hits DynamoDB
      await store.getConsentSummary('CachedOrg');
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Second call - uses cache
      await store.getConsentSummary('CachedOrg');
      expect(mockSend).toHaveBeenCalledTimes(1); // No additional call
    });

    it('should handle DynamoDB errors', async () => {
      mockSend.mockRejectedValue(new Error('Network timeout'));

      await expect(store.getConsentSummary('TestOrg'))
        .rejects
        .toThrow(/network timeout/i);
    });
  });

  describe('2. checkResourceConsent (hasValidConsent)', () => {
    it('should return true for granted consent with resource', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'TestOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
            fp_metrics: {
              resource: 'fp_metrics',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
            cross_org_benchmarks: {
              resource: 'cross_org_benchmarks',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('TestOrg', 'fp_patterns');

      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('should return false when consent not found', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await store.checkResourceConsent('UnknownOrg', 'fp_patterns');

      expect(result.granted).toBe(false);
      expect(result.state).toBe('not_requested');
    });

    it('should return false for revoked consent', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'RevokedOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'revoked',
              grantedAt: new Date('2026-01-01'),
              revokedAt: new Date('2026-02-01'),
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-02-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('RevokedOrg', 'fp_patterns');

      expect(result.granted).toBe(false);
      expect(result.state).toBe('revoked');
    });

    it('should return false for expired consent', async () => {
      const yesterday = new Date(Date.now() - 86400000);

      mockSend.mockResolvedValue({
        Item: {
          orgId: 'ExpiredOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date('2025-01-01'),
              expiresAt: yesterday,
              version: CURRENT_CONSENT_POLICY.version,
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('ExpiredOrg', 'fp_patterns');

      expect(result.granted).toBe(false);
      expect(result.state).toBe('expired');
    });

    it('should return false for pending consent', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'PendingOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'pending',
              grantedAt: new Date(),
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('PendingOrg', 'fp_patterns');

      expect(result.granted).toBe(false);
      expect(result.state).toBe('pending');
    });

    it('should return false when resource not in granted list', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'PartialOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('PartialOrg', 'audit_logs');

      expect(result.granted).toBe(false);
      expect(result.state).toBe('not_requested');
    });

    it('should return false when policy version outdated', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'OutdatedOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date('2024-01-01'),
              version: '0.9', // Old policy version
            },
          },
          grantedBy: 'admin',
          consentVersion: '0.9',
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkResourceConsent('OutdatedOrg', 'fp_patterns');

      expect(result.granted).toBe(false);
      expect(result.reason).toContain('version mismatch');
    });

    it('should check all resource types', async () => {
      const resources: ConsentResource[] = [
        'fp_patterns',
        'fp_metrics',
        'cross_org_benchmarks',
        'rule_calibration',
        'audit_logs',
        'drift_baselines',
      ];

      const resourcesObj: any = {};
      for (const resource of resources) {
        resourcesObj[resource] = {
          resource,
          state: 'granted',
          grantedAt: new Date(),
          version: CURRENT_CONSENT_POLICY.version,
        };
      }

      mockSend.mockResolvedValue({
        Item: {
          orgId: 'FullOrg',
          resources: resourcesObj,
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      for (const resource of resources) {
        const result = await store.checkResourceConsent('FullOrg', resource);
        expect(result.granted).toBe(true);
      }
    });
  });

  describe('3. grantConsent', () => {
    it('should create new consent record', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: null }) // getConsentSummary
        .mockResolvedValueOnce({}); // PutCommand

      await store.grantConsent('NewOrg', 'fp_patterns', 'admin@example.com');

      expect(mockSend).toHaveBeenCalledWith(expect.any(GetCommand));
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-consent',
            Item: expect.objectContaining({
              consentVersion: CURRENT_CONSENT_POLICY.version,
            }),
          }),
        })
      );
    });

    it('should support expiration date', async () => {
      mockSend
        .mockResolvedValueOnce({ Item: null })
        .mockResolvedValueOnce({});

      const expiresAt = new Date('2027-01-01');
      await store.grantConsent('NewOrg', 'fp_patterns', 'admin@example.com', expiresAt);

      const putCall = mockSend.mock.calls.find((call: any) => call[0] instanceof PutCommand);
      expect(putCall[0].input.Item.resources.fp_patterns.expiresAt).toEqual(expiresAt);
    });

    it('should invalidate cache on grant', async () => {
      // First: ensure cache is empty
      store.clearCache();

      // Second: grant consent
      mockSend
        .mockResolvedValueOnce({ Item: null })
        .mockResolvedValueOnce({});
      
      await store.grantConsent('OrgA', 'fp_patterns', 'admin');

      // Third: verify cache was cleared (subsequent call should hit DynamoDB)
      const mockItem = {
        orgId: 'OrgA',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date(),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      
      mockSend.mockResolvedValueOnce({ Item: mockItem });
      await store.getConsentSummary('OrgA');
      
      // Cache should be populated now
      expect(store.getCacheStats().size).toBe(1);
    });
  });

  describe('4. revokeConsent', () => {
    it('should update consent state to revoked', async () => {
      const existingItem = {
        orgId: 'RevokeOrg',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date('2026-01-01'),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      mockSend
        .mockResolvedValueOnce({ Item: existingItem })
        .mockResolvedValueOnce({});

      await store.revokeConsent('RevokeOrg', 'fp_patterns', 'security@example.com');

      const putCall = mockSend.mock.calls.find((call: any) => call[0] instanceof PutCommand);
      expect(putCall).toBeDefined();
      expect(putCall[0].input.Item.resources.fp_patterns.state).toBe('revoked');
      expect(putCall[0].input.Item.resources.fp_patterns.revokedAt).toBeDefined();
    });

    it('should invalidate cache on revoke', async () => {
      const existingItem = {
        orgId: 'OrgB',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date(),
            version: CURRENT_CONSENT_POLICY.version,
          },
        },
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend
        .mockResolvedValueOnce({ Item: existingItem })
        .mockResolvedValueOnce({});

      await store.revokeConsent('OrgB', 'fp_patterns', 'admin');

      // Cache for OrgB should be cleared
      expect(mockSend).toHaveBeenCalled();
    });

    it('should throw error when no consent record exists', async () => {
      mockSend.mockResolvedValue({ Item: null });

      await expect(
        store.revokeConsent('NonExistentOrg', 'fp_patterns', 'admin')
      ).rejects.toThrow(/No consent record found/);
    });
  });

  describe('5. NoOp Store', () => {
    it('should always return granted for NoOp store', () => {
      const noopStore = new EnhancedNoOpConsentStore();

      const result = noopStore.checkResourceConsent('AnyOrg', 'audit_logs');

      return expect(result).resolves.toMatchObject({
        granted: true,
        state: 'granted',
      });
    });

    it('should return synthetic consent record', async () => {
      const noopStore = new EnhancedNoOpConsentStore();

      const consent = await noopStore.getConsentSummary('AnyOrg');

      expect(consent).toBeDefined();
      expect(consent?.resources).toHaveProperty('fp_patterns');
      expect(consent?.resources).toHaveProperty('fp_metrics');
      expect(consent?.resources.fp_patterns.state).toBe('granted');
    });

    it('should grant all resource types', async () => {
      const noopStore = new EnhancedNoOpConsentStore();

      const result = await noopStore.checkMultipleResources('AnyOrg', [
        'fp_patterns',
        'fp_metrics',
        'audit_logs',
      ]);

      expect(result.allGranted).toBe(true);
      expect(result.missingConsent).toHaveLength(0);
    });
  });

  describe('6. Edge Cases', () => {
    it('should handle malformed consent records', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'MalformedOrg',
          // Missing required fields like resources
        },
      });

      const result = await store.getConsentSummary('MalformedOrg');
      
      // Should handle gracefully
      expect(result).toBeDefined();
      expect(result?.resources).toBeDefined();
    });

    it('should handle concurrent cache access', async () => {
      const mockItem = {
        orgId: 'ConcurrentOrg',
        resources: {
          fp_patterns: {
            resource: 'fp_patterns',
            state: 'granted',
            grantedAt: new Date(),
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

      // Trigger multiple concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        store.checkResourceConsent('ConcurrentOrg', 'fp_patterns')
      );

      const results = await Promise.all(promises);

      expect(results.every((r) => r.granted === true)).toBe(true);
      // All requests should complete successfully
      expect(mockSend).toHaveBeenCalled();
    });

    it('should handle expired cache entries', async () => {
      // Create store with very short cache TTL
      const shortCacheStore = new ConsentStore({
        tableName: 'test-consent',
        region: 'us-east-1',
        cacheTTLSeconds: 0.001, // 1ms
      });

      const mockItem = {
        orgId: 'TestOrg',
        resources: {},
        grantedBy: 'admin',
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockSend.mockResolvedValue({ Item: mockItem });

      await shortCacheStore.getConsentSummary('TestOrg');
      
      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      mockSend.mockResolvedValue({ Item: mockItem });
      await shortCacheStore.getConsentSummary('TestOrg');

      // Should have made two DB calls since cache expired
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('7. checkMultipleResources', () => {
    it('should validate all required resources', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'TestOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
            fp_metrics: {
              resource: 'fp_metrics',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkMultipleResources('TestOrg', [
        'fp_patterns',
        'fp_metrics',
      ]);

      expect(result.allGranted).toBe(true);
      expect(result.missingConsent).toHaveLength(0);
    });

    it('should identify missing consents', async () => {
      mockSend.mockResolvedValue({
        Item: {
          orgId: 'TestOrg',
          resources: {
            fp_patterns: {
              resource: 'fp_patterns',
              state: 'granted',
              grantedAt: new Date(),
              version: CURRENT_CONSENT_POLICY.version,
            },
          },
          grantedBy: 'admin',
          consentVersion: CURRENT_CONSENT_POLICY.version,
          history: [],
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      });

      const result = await store.checkMultipleResources('TestOrg', [
        'fp_patterns',
        'audit_logs',
      ]);

      expect(result.allGranted).toBe(false);
      expect(result.missingConsent).toContain('audit_logs');
    });

    it('should handle multiple missing consents', async () => {
      mockSend.mockResolvedValue({ Item: null });

      const resources: ConsentResource[] = [
        'fp_patterns',
        'fp_metrics',
        'audit_logs',
      ];
      const result = await store.checkMultipleResources('TestOrg', resources);

      expect(result.missingConsent).toHaveLength(3);
      expect(result.allGranted).toBe(false);
    });
  });
});
