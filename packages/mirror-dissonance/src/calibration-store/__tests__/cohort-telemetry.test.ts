/**
 * Unit tests for CohortTelemetryEmitter
 *
 * Verifies consent-gated, feature-flagged cohort-size telemetry.
 * Follows existing test patterns: ESM jest imports, adapter mocking.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import {
  CohortTelemetryEmitter,
  CohortTelemetryEvent,
} from '../cohort-telemetry.js';
import type { ConsentStoreAdapter } from '../../adapters/types.js';

/**
 * Create a mock ConsentStoreAdapter with configurable hasValidConsent.
 */
function createMockConsentStore(
  hasValidConsent: boolean = true,
): ConsentStoreAdapter {
  return {
    recordConsent: jest.fn<ConsentStoreAdapter['recordConsent']>(),
    hasValidConsent: jest.fn<ConsentStoreAdapter['hasValidConsent']>()
      .mockResolvedValue(hasValidConsent),
    revokeConsent: jest.fn<ConsentStoreAdapter['revokeConsent']>(),
    getConsent: jest.fn<ConsentStoreAdapter['getConsent']>()
      .mockResolvedValue(null),
    grantConsent: jest.fn<ConsentStoreAdapter['grantConsent']>(),
    checkResourceConsent: jest.fn<ConsentStoreAdapter['checkResourceConsent']>()
      .mockResolvedValue({ granted: hasValidConsent, state: hasValidConsent ? 'granted' : 'not_requested' }),
    checkMultipleResources: jest.fn<ConsentStoreAdapter['checkMultipleResources']>()
      .mockResolvedValue({ allGranted: hasValidConsent, missingConsent: [], results: {} }),
    getConsentSummary: jest.fn<ConsentStoreAdapter['getConsentSummary']>()
      .mockResolvedValue(null),
    checkConsent: jest.fn<ConsentStoreAdapter['checkConsent']>()
      .mockResolvedValue(hasValidConsent ? 'explicit' : 'none'),
  } as ConsentStoreAdapter;
}

describe('CohortTelemetryEmitter', () => {
  let consentStore: ConsentStoreAdapter;

  beforeEach(() => {
    consentStore = createMockConsentStore(true);
  });

  describe('emitCohortSize', () => {
    it('should emit event when enabled and consent granted', async () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
      const received: CohortTelemetryEvent[] = [];
      emitter.onEvent((evt) => received.push(evt));

      const result = await emitter.emitCohortSize('org-1', 'MD-001', 12);

      expect(result).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0].event).toBe('calibration-cohort-size');
      expect(received[0].cohortSize).toBe(12);
      expect(received[0].ruleId).toBe('MD-001');
      expect(received[0].timestamp).toBeInstanceOf(Date);
    });

    it('should NOT emit event when feature flag is disabled', async () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: false });
      const received: CohortTelemetryEvent[] = [];
      emitter.onEvent((evt) => received.push(evt));

      const result = await emitter.emitCohortSize('org-1', 'MD-001', 12);

      expect(result).toBe(false);
      expect(received).toHaveLength(0);
      // Consent store should not even be called when feature flag is off
      expect(consentStore.hasValidConsent).not.toHaveBeenCalled();
    });

    it('should NOT emit event when consent is revoked', async () => {
      consentStore = createMockConsentStore(false);
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
      const received: CohortTelemetryEvent[] = [];
      emitter.onEvent((evt) => received.push(evt));

      const result = await emitter.emitCohortSize('org-1', 'MD-001', 12);

      expect(result).toBe(false);
      expect(received).toHaveLength(0);
      expect(consentStore.hasValidConsent).toHaveBeenCalledWith('org-1', undefined, 'telemetry');
    });

    it('should check consent with telemetry scope', async () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });

      await emitter.emitCohortSize('org-42', 'MD-003', 8);

      expect(consentStore.hasValidConsent).toHaveBeenCalledWith(
        'org-42',
        undefined,
        'telemetry',
      );
    });

    it('should not include org ID in the emitted event', async () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
      const received: CohortTelemetryEvent[] = [];
      emitter.onEvent((evt) => received.push(evt));

      await emitter.emitCohortSize('sensitive-org-id', 'MD-001', 5);

      expect(received).toHaveLength(1);
      const event = received[0];
      // Verify no org ID leaked into the event
      const eventStr = JSON.stringify(event);
      expect(eventStr).not.toContain('sensitive-org-id');
      // Only expected fields
      expect(Object.keys(event).sort()).toEqual(
        ['cohortSize', 'event', 'ruleId', 'timestamp'].sort(),
      );
    });

    it('should notify multiple listeners', async () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
      const received1: CohortTelemetryEvent[] = [];
      const received2: CohortTelemetryEvent[] = [];
      emitter.onEvent((evt) => received1.push(evt));
      emitter.onEvent((evt) => received2.push(evt));

      await emitter.emitCohortSize('org-1', 'MD-001', 10);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });
  });

  describe('isEnabled', () => {
    it('should return false by default', () => {
      const emitter = new CohortTelemetryEmitter(consentStore);
      expect(emitter.isEnabled()).toBe(false);
    });

    it('should return true when enabled', () => {
      const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
      expect(emitter.isEnabled()).toBe(true);
    });
  });

  describe('fromEnv', () => {
    it('should read ENABLE_COHORT_TELEMETRY from environment', () => {
      const original = process.env.ENABLE_COHORT_TELEMETRY;
      try {
        process.env.ENABLE_COHORT_TELEMETRY = 'true';
        const emitter = CohortTelemetryEmitter.fromEnv(consentStore);
        expect(emitter.isEnabled()).toBe(true);
      } finally {
        if (original === undefined) {
          delete process.env.ENABLE_COHORT_TELEMETRY;
        } else {
          process.env.ENABLE_COHORT_TELEMETRY = original;
        }
      }
    });

    it('should default to disabled when env var is not set', () => {
      const original = process.env.ENABLE_COHORT_TELEMETRY;
      try {
        delete process.env.ENABLE_COHORT_TELEMETRY;
        const emitter = CohortTelemetryEmitter.fromEnv(consentStore);
        expect(emitter.isEnabled()).toBe(false);
      } finally {
        if (original !== undefined) {
          process.env.ENABLE_COHORT_TELEMETRY = original;
        }
      }
    });

    it('should default to disabled when env var is anything other than true', () => {
      const original = process.env.ENABLE_COHORT_TELEMETRY;
      try {
        process.env.ENABLE_COHORT_TELEMETRY = 'yes';
        const emitter = CohortTelemetryEmitter.fromEnv(consentStore);
        expect(emitter.isEnabled()).toBe(false);
      } finally {
        if (original === undefined) {
          delete process.env.ENABLE_COHORT_TELEMETRY;
        } else {
          process.env.ENABLE_COHORT_TELEMETRY = original;
        }
      }
    });
  });
});
