/**
 * Consent Store Adapter Tests
 *
 * Tests the ConsentStoreAdapter contract via the local adapter.
 *
 * Coverage targets:
 * - recordConsent: org + repo scopes, timestamps, grantor
 * - hasValidConsent: org-level covers all repos; repo-level is scoped;
 *   expired and revoked consents return false
 * - revokeConsent: revoked records no longer valid
 * - getConsent: returns records or empty array
 * - grantConsent: alias for recordConsent
 * - checkResourceConsent: state machine (not_requested → granted → revoked/expired)
 * - checkMultipleResources: batch consent check
 * - getConsentSummary: aggregated view
 * - checkConsent: returns 'explicit' or 'none'
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters, CloudConfig, ConsentStoreAdapter } from '../types.js';
import { rm } from 'fs/promises';

describe('ConsentStoreAdapter — local adapter', () => {
  let adapters: CloudAdapters;
  let store: ConsentStoreAdapter;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = `/tmp/test-consent-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };
    adapters = createLocalAdapters(config);
    store = adapters.consentStore;
  });

  afterEach(async () => {
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup
    }
  });

  // ── recordConsent ──────────────────────────────────────────────────────

  describe('recordConsent', () => {
    it('stores consent with org scope', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin@org-1.com',
      });

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(1);
      expect(records[0].orgId).toBe('org-1');
      expect(records[0].scope).toBe('data-collection');
      expect(records[0].grantedBy).toBe('admin@org-1.com');
      expect(records[0].revoked).toBe(false);
    });

    it('stores consent with repo-level scope', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        repoId: 'repo-a',
        scope: 'fp-calibration',
        grantedBy: 'admin@org-1.com',
      });

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(1);
      expect(records[0].repoId).toBe('repo-a');
    });

    it('stores consent with expiration date', async () => {
      const expiresAt = new Date('2027-01-01T00:00:00Z');
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'telemetry',
        grantedBy: 'admin@org-1.com',
        expiresAt,
      });

      const records = await store.getConsent('org-1');
      expect(records[0].expiresAt).toBeDefined();
      expect(new Date(records[0].expiresAt).getTime()).toBe(expiresAt.getTime());
    });

    it('stores multiple consents for the same org', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'fp-calibration',
        grantedBy: 'admin',
      });

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(2);
    });

    it('records timestamp in grantedAt', async () => {
      const before = new Date().toISOString();
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'telemetry',
        grantedBy: 'admin',
      });
      const after = new Date().toISOString();

      const records = await store.getConsent('org-1');
      expect(records[0].grantedAt).toBeDefined();
      expect(records[0].grantedAt >= before).toBe(true);
      expect(records[0].grantedAt <= after).toBe(true);
    });
  });

  // ── hasValidConsent ────────────────────────────────────────────────────

  describe('hasValidConsent', () => {
    it('returns true when org-level consent exists', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });

      const result = await store.hasValidConsent('org-1');
      expect(result).toBe(true);
    });

    it('org-level consent covers all repos (no repoId on record)', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });

      // Org-level consent (no repoId on record) should match any repoId query
      const result = await store.hasValidConsent('org-1', 'any-repo');
      expect(result).toBe(true);
    });

    it('repo-level consent is scoped to that repo', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        repoId: 'repo-a',
        scope: 'fp-calibration',
        grantedBy: 'admin',
      });

      const resultA = await store.hasValidConsent('org-1', 'repo-a');
      expect(resultA).toBe(true);

      // Different repo should not match
      const resultB = await store.hasValidConsent('org-1', 'repo-b');
      expect(resultB).toBe(false);
    });

    it('returns false for expired consent', async () => {
      await store.recordConsent({
        orgId: 'org-expired',
        scope: 'data-collection',
        grantedBy: 'admin',
        expiresAt: new Date('2020-01-01T00:00:00Z'), // in the past
      });

      const result = await store.hasValidConsent('org-expired');
      expect(result).toBe(false);
    });

    it('returns true for non-expired consent', async () => {
      await store.recordConsent({
        orgId: 'org-valid',
        scope: 'data-collection',
        grantedBy: 'admin',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
      });

      const result = await store.hasValidConsent('org-valid');
      expect(result).toBe(true);
    });

    it('returns false for revoked consent', async () => {
      await store.recordConsent({
        orgId: 'org-revoked',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.revokeConsent('org-revoked', 'data-collection');

      const result = await store.hasValidConsent('org-revoked', undefined, 'data-collection');
      expect(result).toBe(false);
    });

    it('returns false for unknown org', async () => {
      const result = await store.hasValidConsent('unknown-org');
      expect(result).toBe(false);
    });

    it('filters by scope when provided', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });

      const resultMatch = await store.hasValidConsent('org-1', undefined, 'data-collection');
      expect(resultMatch).toBe(true);

      const resultNoMatch = await store.hasValidConsent('org-1', undefined, 'other-scope');
      expect(resultNoMatch).toBe(false);
    });
  });

  // ── revokeConsent ──────────────────────────────────────────────────────

  describe('revokeConsent', () => {
    it('revokes all matching scope records for an org', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin2',
      });

      await store.revokeConsent('org-1', 'data-collection');

      const result = await store.hasValidConsent('org-1', undefined, 'data-collection');
      expect(result).toBe(false);
    });

    it('does not revoke other scopes', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'fp-calibration',
        grantedBy: 'admin',
      });

      await store.revokeConsent('org-1', 'data-collection');

      const revoked = await store.hasValidConsent('org-1', undefined, 'data-collection');
      expect(revoked).toBe(false);

      const stillValid = await store.hasValidConsent('org-1', undefined, 'fp-calibration');
      expect(stillValid).toBe(true);
    });

    it('is idempotent (revoking twice does not error)', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });

      await store.revokeConsent('org-1', 'data-collection');
      await expect(
        store.revokeConsent('org-1', 'data-collection'),
      ).resolves.not.toThrow();
    });
  });

  // ── getConsent ─────────────────────────────────────────────────────────

  describe('getConsent', () => {
    it('returns all records for an org', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'fp-calibration',
        grantedBy: 'admin',
      });

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(2);
    });

    it('returns empty array for unknown org', async () => {
      const records = await store.getConsent('unknown-org');
      expect(records).toEqual([]);
    });

    it('does not return other org records', async () => {
      await store.recordConsent({
        orgId: 'org-1',
        scope: 'data-collection',
        grantedBy: 'admin',
      });
      await store.recordConsent({
        orgId: 'org-2',
        scope: 'data-collection',
        grantedBy: 'admin',
      });

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(1);
      expect(records[0].orgId).toBe('org-1');
    });
  });

  // ── grantConsent ───────────────────────────────────────────────────────

  describe('grantConsent', () => {
    it('is an alias for recordConsent', async () => {
      await store.grantConsent('org-1', 'telemetry', 'admin@org-1.com');

      const records = await store.getConsent('org-1');
      expect(records).toHaveLength(1);
      expect(records[0].scope).toBe('telemetry');
      expect(records[0].grantedBy).toBe('admin@org-1.com');
    });

    it('accepts optional expiresAt', async () => {
      const expiresAt = new Date('2027-06-15T00:00:00Z');
      await store.grantConsent('org-1', 'telemetry', 'admin', expiresAt);

      const records = await store.getConsent('org-1');
      expect(new Date(records[0].expiresAt).getTime()).toBe(expiresAt.getTime());
    });
  });

  // ── checkResourceConsent ───────────────────────────────────────────────

  describe('checkResourceConsent', () => {
    it('returns not_requested for unknown scope', async () => {
      const result = await store.checkResourceConsent('org-1', 'unknown-scope');
      expect(result).toEqual({ granted: false, state: 'not_requested' });
    });

    it('returns granted for active consent', async () => {
      await store.grantConsent('org-1', 'data-collection', 'admin');

      const result = await store.checkResourceConsent('org-1', 'data-collection');
      expect(result).toEqual({ granted: true, state: 'granted' });
    });

    it('returns revoked after revocation', async () => {
      await store.grantConsent('org-1', 'data-collection', 'admin');
      await store.revokeConsent('org-1', 'data-collection');

      const result = await store.checkResourceConsent('org-1', 'data-collection');
      expect(result).toEqual({ granted: false, state: 'revoked' });
    });

    it('returns expired for past-expiry consent', async () => {
      await store.grantConsent(
        'org-1',
        'data-collection',
        'admin',
        new Date('2020-01-01T00:00:00Z'),
      );

      const result = await store.checkResourceConsent('org-1', 'data-collection');
      expect(result).toEqual({ granted: false, state: 'expired' });
    });
  });

  // ── checkMultipleResources ─────────────────────────────────────────────

  describe('checkMultipleResources', () => {
    it('returns allGranted true when all scopes granted', async () => {
      await store.grantConsent('org-1', 'scope-a', 'admin');
      await store.grantConsent('org-1', 'scope-b', 'admin');

      const result = await store.checkMultipleResources('org-1', [
        'scope-a',
        'scope-b',
      ]);
      expect(result.allGranted).toBe(true);
      expect(result.missingConsent).toEqual([]);
      expect(result.results['scope-a'].granted).toBe(true);
      expect(result.results['scope-b'].granted).toBe(true);
    });

    it('returns allGranted false with missing scopes listed', async () => {
      await store.grantConsent('org-1', 'scope-a', 'admin');

      const result = await store.checkMultipleResources('org-1', [
        'scope-a',
        'scope-b',
      ]);
      expect(result.allGranted).toBe(false);
      expect(result.missingConsent).toContain('scope-b');
    });
  });

  // ── getConsentSummary ──────────────────────────────────────────────────

  describe('getConsentSummary', () => {
    it('returns null for unknown org', async () => {
      const summary = await store.getConsentSummary('unknown-org');
      expect(summary).toBeNull();
    });

    it('returns aggregated state per scope', async () => {
      await store.grantConsent('org-1', 'data-collection', 'admin');
      await store.grantConsent('org-1', 'fp-calibration', 'admin');
      await store.revokeConsent('org-1', 'fp-calibration');

      const summary = await store.getConsentSummary('org-1');
      expect(summary).not.toBeNull();
      expect(summary!.orgId).toBe('org-1');
      expect(summary!.resources['data-collection'].state).toBe('granted');
      expect(summary!.resources['fp-calibration'].state).toBe('revoked');
    });
  });

  // ── checkConsent ───────────────────────────────────────────────────────

  describe('checkConsent', () => {
    it('returns "none" when no consent exists', async () => {
      const result = await store.checkConsent('unknown-org');
      expect(result).toBe('none');
    });

    it('returns "explicit" when valid consent exists', async () => {
      await store.grantConsent('org-1', 'data-collection', 'admin');

      const result = await store.checkConsent('org-1');
      expect(result).toBe('explicit');
    });

    it('returns "none" when all consents are revoked', async () => {
      await store.grantConsent('org-1', 'data-collection', 'admin');
      await store.revokeConsent('org-1', 'data-collection');

      const result = await store.checkConsent('org-1');
      expect(result).toBe('none');
    });

    it('returns "none" when all consents are expired', async () => {
      await store.grantConsent(
        'org-1',
        'data-collection',
        'admin',
        new Date('2020-01-01T00:00:00Z'),
      );

      const result = await store.checkConsent('org-1');
      expect(result).toBe('none');
    });
  });
});
