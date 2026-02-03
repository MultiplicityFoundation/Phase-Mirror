/**
 * Tests for Local Adapters
 */

import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters } from '../types.js';

describe('Local Adapters', () => {
  let adapters: CloudAdapters;

  beforeEach(() => {
    adapters = createLocalAdapters();
  });

  describe('FPStoreAdapter', () => {
    it('should record and retrieve false positive events', async () => {
      const id = await adapters.fpStore.record({
        findingId: 'finding-1',
        ruleId: 'MD-001',
        timestamp: '2024-01-01T00:00:00Z',
        resolvedBy: 'developer',
        orgIdHash: 'org-hash-1',
        consent: 'explicit',
        context: { repoId: 'repo-1' },
      });

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');

      const isFP = await adapters.fpStore.isFalsePositive('finding-1');
      expect(isFP).toBe(true);
    });

    it('should query events by orgId', async () => {
      await adapters.fpStore.record({
        findingId: 'finding-1',
        ruleId: 'MD-001',
        timestamp: '2024-01-01T00:00:00Z',
        resolvedBy: 'developer',
        orgIdHash: 'org-1',
        consent: 'explicit',
        context: { repoId: 'repo-1' },
      });

      await adapters.fpStore.record({
        findingId: 'finding-2',
        ruleId: 'MD-002',
        timestamp: '2024-01-02T00:00:00Z',
        resolvedBy: 'developer',
        orgIdHash: 'org-1',
        consent: 'explicit',
        context: { repoId: 'repo-2' },
      });

      const events = await adapters.fpStore.query({ orgId: 'org-1' });
      expect(events).toHaveLength(2);
    });

    it('should mark finding as false positive', async () => {
      await adapters.fpStore.record({
        findingId: 'finding-1',
        ruleId: 'MD-001',
        timestamp: '2024-01-01T00:00:00Z',
        resolvedBy: '',
        orgIdHash: 'org-1',
        consent: 'explicit',
        context: { repoId: 'repo-1' },
      });

      await adapters.fpStore.markAsFP('finding-1', 'reviewer');

      const isFP = await adapters.fpStore.isFalsePositive('finding-1');
      expect(isFP).toBe(true);
    });
  });

  describe('SecretStoreAdapter', () => {
    it('should store and retrieve nonces', async () => {
      await adapters.secretStore.putSecret('test-nonce', 'nonce-value-123');
      
      // Note: Local adapter has setNonce utility for testing
      const localSecret = adapters.secretStore as any;
      localSecret.setNonce('current', 'nonce-value-123');

      const nonce = await adapters.secretStore.getNonce('current');
      expect(nonce).toBe('nonce-value-123');
    });

    it('should return null for missing nonce', async () => {
      const nonce = await adapters.secretStore.getNonce('missing');
      expect(nonce).toBeNull();
    });
  });

  describe('BlockCounterAdapter', () => {
    it('should increment counter atomically', async () => {
      const count1 = await adapters.blockCounter.increment('key-1', 60);
      expect(count1).toBe(1);

      const count2 = await adapters.blockCounter.increment('key-1', 60);
      expect(count2).toBe(2);

      const count3 = await adapters.blockCounter.increment('key-1', 60);
      expect(count3).toBe(3);
    });

    it('should get current count', async () => {
      await adapters.blockCounter.increment('key-1', 60);
      await adapters.blockCounter.increment('key-1', 60);

      const count = await adapters.blockCounter.get('key-1');
      expect(count).toBe(2);
    });

    it('should reset counter', async () => {
      await adapters.blockCounter.increment('key-1', 60);
      await adapters.blockCounter.reset('key-1');

      const count = await adapters.blockCounter.get('key-1');
      expect(count).toBe(0);
    });
  });

  describe('ObjectStoreAdapter', () => {
    it('should store and retrieve baselines', async () => {
      const baseline = {
        rules: ['MD-001', 'MD-002'],
        timestamp: '2024-01-01T00:00:00Z',
      };

      await adapters.objectStore.storeBaseline('repo-1', baseline, {
        commitSha: 'abc123',
      });

      const retrieved = await adapters.objectStore.getBaseline('repo-1');
      expect(retrieved).toEqual(baseline);
    });

    it('should list baseline versions', async () => {
      const baseline1 = { version: 1 };
      const baseline2 = { version: 2 };

      await adapters.objectStore.storeBaseline('repo-1', baseline1);
      await adapters.objectStore.storeBaseline('repo-1', baseline2);

      const versions = await adapters.objectStore.listBaselineVersions('repo-1');
      expect(versions).toHaveLength(2);
      expect(versions[0].versionId).toBe('v2'); // Most recent first
      expect(versions[1].versionId).toBe('v1');
    });

    it('should store and retrieve reports', async () => {
      const report = {
        runId: 'run-1',
        violations: [],
        decision: 'allow',
      };

      await adapters.objectStore.storeReport('repo-1', 'run-1', report);

      const retrieved = await adapters.objectStore.getReport('repo-1', 'run-1');
      expect(retrieved).toEqual(report);
    });
  });

  describe('ConsentStoreAdapter', () => {
    it('should record and check consent', async () => {
      await adapters.consentStore.recordConsent('org-1', 'repo-1', 'fp_tracking', true);

      const hasConsent = await adapters.consentStore.hasConsent('org-1', 'repo-1', 'fp_tracking');
      expect(hasConsent).toBe(true);
    });

    it('should return false for missing consent', async () => {
      const hasConsent = await adapters.consentStore.hasConsent('org-1', 'repo-1', 'missing_feature');
      expect(hasConsent).toBe(false);
    });

    it('should handle org-level consent', async () => {
      await adapters.consentStore.recordConsent('org-1', null, 'analytics', true);

      const hasConsent = await adapters.consentStore.hasConsent('org-1', null, 'analytics');
      expect(hasConsent).toBe(true);
    });
  });
});
