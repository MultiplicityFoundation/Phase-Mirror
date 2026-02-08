/**
 * Local Adapter Tests
 * 
 * Comprehensive test suite for local file-based adapters.
 * Validates interface contracts without requiring cloud credentials.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { createLocalAdapters } from '../index.js';
import { CloudAdapters, CloudConfig } from '../../types.js';
import { FalsePositiveEvent } from '../../../schemas/types.js';
import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';

describe('Local Adapters', () => {
  let adapters: CloudAdapters;
  let testDataDir: string;

  beforeEach(() => {
    // Use a unique directory for each test to avoid interference
    testDataDir = `/tmp/test-data-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };

    adapters = createLocalAdapters(config);
  });

  afterEach(async () => {
    // Cleanup test data
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('FP Store Adapter', () => {
    it('should record a false positive event', async () => {
      const event: FalsePositiveEvent = {
        id: randomUUID(),
        findingId: 'finding-123',
        ruleId: 'rule-456',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-789',
        orgIdHash: 'org-hash-abc',
        consent: 'explicit',
        context: {},
      };

      await adapters.fpStore.recordFalsePositive(event);

      const isFP = await adapters.fpStore.isFalsePositive('finding-123');
      expect(isFP).toBe(true);
    });

    it('should return false for non-existent finding', async () => {
      const isFP = await adapters.fpStore.isFalsePositive('nonexistent');
      expect(isFP).toBe(false);
    });

    it('should get false positives by rule', async () => {
      const event1: FalsePositiveEvent = {
        id: randomUUID(),
        findingId: 'finding-1',
        ruleId: 'rule-test',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        orgIdHash: 'org-1',
        consent: 'explicit',
        context: {},
      };

      const event2: FalsePositiveEvent = {
        id: randomUUID(),
        findingId: 'finding-2',
        ruleId: 'rule-test',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-2',
        orgIdHash: 'org-2',
        consent: 'explicit',
        context: {},
      };

      await adapters.fpStore.recordFalsePositive(event1);
      await adapters.fpStore.recordFalsePositive(event2);

      const events = await adapters.fpStore.getFalsePositivesByRule('rule-test');
      expect(events).toHaveLength(2);
      expect(events.map(e => e.findingId).sort()).toEqual(['finding-1', 'finding-2']);
    });
  });

  describe('Consent Store Adapter', () => {
    it('should grant and check consent', async () => {
      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');

      const result = await adapters.consentStore.checkResourceConsent('test-org', 'fp_patterns');
      expect(result.granted).toBe(true);
      expect(result.state).toBe('granted');
    });

    it('should return not_requested for non-existent consent', async () => {
      const result = await adapters.consentStore.checkResourceConsent('test-org', 'fp_patterns');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('not_requested');
    });

    it('should revoke consent', async () => {
      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');
      await adapters.consentStore.revokeConsent('test-org', 'fp_patterns', 'admin-user');

      const result = await adapters.consentStore.checkResourceConsent('test-org', 'fp_patterns');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('revoked');
    });

    it('should handle consent expiration', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user', pastDate);

      const result = await adapters.consentStore.checkResourceConsent('test-org', 'fp_patterns');
      expect(result.granted).toBe(false);
      expect(result.state).toBe('expired');
    });

    it('should check multiple resources', async () => {
      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');

      const result = await adapters.consentStore.checkMultipleResources('test-org', [
        'fp_patterns',
        'fp_metrics',
      ]);

      expect(result.allGranted).toBe(false);
      expect(result.missingConsent).toContain('fp_metrics');
      expect(result.results['fp_patterns'].granted).toBe(true);
      expect(result.results['fp_metrics'].granted).toBe(false);
    });

    it('should get consent summary', async () => {
      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');

      const summary = await adapters.consentStore.getConsentSummary('test-org');
      expect(summary).not.toBeNull();
      expect(summary!.orgId).toBe('test-org');
      expect(summary!.resources['fp_patterns'].state).toBe('granted');
    });

    it('should support legacy checkConsent method', async () => {
      let consentType = await adapters.consentStore.checkConsent('test-org');
      expect(consentType).toBe('none');

      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');

      consentType = await adapters.consentStore.checkConsent('test-org');
      expect(consentType).toBe('explicit');
    });

    it('should support legacy hasValidConsent method', async () => {
      let hasConsent = await adapters.consentStore.hasValidConsent('test-org');
      expect(hasConsent).toBe(false);

      await adapters.consentStore.grantConsent('test-org', 'fp_patterns', 'admin-user');

      hasConsent = await adapters.consentStore.hasValidConsent('test-org');
      expect(hasConsent).toBe(true);
    });
  });

  describe('Block Counter Adapter', () => {
    it('should increment counter', async () => {
      const count1 = await adapters.blockCounter.increment('rule-test', 'test-org');
      expect(count1).toBe(1);

      const count2 = await adapters.blockCounter.increment('rule-test', 'test-org');
      expect(count2).toBe(2);
    });

    it('should get current count', async () => {
      await adapters.blockCounter.increment('rule-test', 'test-org');
      await adapters.blockCounter.increment('rule-test', 'test-org');

      const count = await adapters.blockCounter.getCount('rule-test', 'test-org');
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent rule', async () => {
      const count = await adapters.blockCounter.getCount('nonexistent', 'test-org');
      expect(count).toBe(0);
    });

    it('should use hourly buckets', async () => {
      // Increment counter
      const count = await adapters.blockCounter.increment('rule-test', 'test-org');
      expect(count).toBe(1);

      // Should get the same count in the same hour
      const sameHourCount = await adapters.blockCounter.getCount('rule-test', 'test-org');
      expect(sameHourCount).toBe(1);
    });
  });

  describe('Secret Store Adapter', () => {
    it('should throw SecretStoreError when no nonce exists', async () => {
      await expect(adapters.secretStore.getNonce()).rejects.toThrow();
    });

    it('should rotate and retrieve nonce as NonceConfig', async () => {
      const testNonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      
      await adapters.secretStore.rotateNonce(testNonce);

      const nonceConfig = await adapters.secretStore.getNonce();
      expect(nonceConfig).toBeDefined();
      expect(nonceConfig.value).toBe(testNonce);
      expect(nonceConfig.source).toBe('local-file');
      expect(typeof nonceConfig.loadedAt).toBe('string');
    });

    it('should support multiple nonce versions', async () => {
      await adapters.secretStore.rotateNonce('nonce-v1');
      await adapters.secretStore.rotateNonce('nonce-v2');

      const nonceConfig = await adapters.secretStore.getNonce();
      expect(nonceConfig.value).toBe('nonce-v2'); // Should get latest
    });
  });

  describe('Baseline Storage Adapter', () => {
    it('should store and retrieve baseline', async () => {
      const baseline = JSON.stringify({ version: '1.0', rules: [] });
      
      await adapters.baselineStorage.storeBaseline('baseline-v1.json', baseline);

      const retrieved = await adapters.baselineStorage.getBaseline('baseline-v1.json');
      expect(retrieved).toBe(baseline);
    });

    it('should return null for non-existent baseline', async () => {
      const baseline = await adapters.baselineStorage.getBaseline('nonexistent.json');
      expect(baseline).toBeNull();
    });

    it('should list baselines', async () => {
      await adapters.baselineStorage.storeBaseline('baseline-v1.json', 'content1');
      await adapters.baselineStorage.storeBaseline('baseline-v2.json', 'content2');

      const baselines = await adapters.baselineStorage.listBaselines();
      expect(baselines).toHaveLength(2);
      expect(baselines.map(b => b.version).sort()).toEqual(['baseline-v1.json', 'baseline-v2.json']);
    });

    it('should delete baseline', async () => {
      await adapters.baselineStorage.storeBaseline('baseline-v1.json', 'content');

      await adapters.baselineStorage.deleteBaseline('baseline-v1.json');

      const baseline = await adapters.baselineStorage.getBaseline('baseline-v1.json');
      expect(baseline).toBeNull();
    });

    it('should handle Buffer content', async () => {
      const buffer = Buffer.from('test content', 'utf-8');
      
      await adapters.baselineStorage.storeBaseline('baseline.json', buffer);

      const retrieved = await adapters.baselineStorage.getBaseline('baseline.json');
      expect(retrieved).toBe('test content');
    });
  });

  describe('Calibration Store Adapter', () => {
    it('should return k-anonymity error with insufficient data', async () => {
      const result = await adapters.calibrationStore.aggregateFPsByRule('rule-test');
      
      expect(result).toHaveProperty('error');
      expect((result as any).error).toBe('INSUFFICIENT_K_ANONYMITY');
    });

    it('should aggregate FPs by rule when k-anonymity is met', async () => {
      // Create 10 FP events from different orgs
      for (let i = 0; i < 10; i++) {
        const event: FalsePositiveEvent = {
          id: randomUUID(),
          findingId: `finding-${i}`,
          ruleId: 'rule-test',
          timestamp: new Date().toISOString(),
          resolvedBy: `user-${i}`,
          orgIdHash: `org-${i}`,
          consent: 'explicit',
          context: { isFalsePositive: true },
        };

        await adapters.fpStore.recordFalsePositive(event);
      }

      const result = await adapters.calibrationStore.aggregateFPsByRule('rule-test');
      
      expect(result).toHaveProperty('ruleId');
      expect((result as any).ruleId).toBe('rule-test');
      expect((result as any).meetsKAnonymity).toBe(true);
      expect((result as any).orgCount).toBe(10);
    });

    it('should filter by date range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Create events from yesterday
      for (let i = 0; i < 10; i++) {
        const event: FalsePositiveEvent = {
          id: randomUUID(),
          findingId: `finding-${i}`,
          ruleId: 'rule-test',
          timestamp: yesterday.toISOString(),
          resolvedBy: `user-${i}`,
          orgIdHash: `org-${i}`,
          consent: 'explicit',
          context: { isFalsePositive: true },
        };

        await adapters.fpStore.recordFalsePositive(event);
      }

      // Filter to only today (should return k-anonymity error)
      const result = await adapters.calibrationStore.getRuleFPRate(
        'rule-test',
        now.toISOString()
      );

      expect(result).toHaveProperty('error');
      expect((result as any).error).toBe('INSUFFICIENT_K_ANONYMITY');
    });
  });

  describe('Interface Compliance', () => {
    it('should implement all required adapter interfaces', () => {
      expect(adapters.fpStore).toBeDefined();
      expect(adapters.consentStore).toBeDefined();
      expect(adapters.blockCounter).toBeDefined();
      expect(adapters.secretStore).toBeDefined();
      expect(adapters.baselineStorage).toBeDefined();
      expect(adapters.calibrationStore).toBeDefined();

      // Check FP Store methods
      expect(typeof adapters.fpStore.recordFalsePositive).toBe('function');
      expect(typeof adapters.fpStore.isFalsePositive).toBe('function');
      expect(typeof adapters.fpStore.getFalsePositivesByRule).toBe('function');

      // Check Consent Store methods
      expect(typeof adapters.consentStore.checkResourceConsent).toBe('function');
      expect(typeof adapters.consentStore.checkMultipleResources).toBe('function');
      expect(typeof adapters.consentStore.getConsentSummary).toBe('function');
      expect(typeof adapters.consentStore.grantConsent).toBe('function');
      expect(typeof adapters.consentStore.revokeConsent).toBe('function');

      // Check Block Counter methods
      expect(typeof adapters.blockCounter.increment).toBe('function');
      expect(typeof adapters.blockCounter.getCount).toBe('function');

      // Check Secret Store methods
      expect(typeof adapters.secretStore.getNonce).toBe('function');
      expect(typeof adapters.secretStore.rotateNonce).toBe('function');

      // Check Baseline Storage methods
      expect(typeof adapters.baselineStorage.storeBaseline).toBe('function');
      expect(typeof adapters.baselineStorage.getBaseline).toBe('function');
      expect(typeof adapters.baselineStorage.listBaselines).toBe('function');
      expect(typeof adapters.baselineStorage.deleteBaseline).toBe('function');

      // Check Calibration Store methods
      expect(typeof adapters.calibrationStore.aggregateFPsByRule).toBe('function');
      expect(typeof adapters.calibrationStore.getRuleFPRate).toBe('function');
      expect(typeof adapters.calibrationStore.getAllRuleFPRates).toBe('function');
    });
  });
});
