/**
 * Cohort Telemetry Emitter
 *
 * Consent-gated telemetry event that logs the k-anonymity cohort size
 * when an organization participates in aggregate FP calibration.
 *
 * Constraints:
 * - Checks consent store before emitting
 * - Logs ONLY cohort size, rule ID, and timestamp — no org data, no FPR
 * - Behind feature flag: ENABLE_COHORT_TELEMETRY=true (default false)
 * - Uses existing ConsentStoreAdapter interface
 *
 * @see docs/SPEC-TRUST.md §10 Telemetry
 */

import type { ConsentStoreAdapter } from '../adapters/types.js';

/**
 * Shape of the cohort-size telemetry event.
 * Contains no identifying information — only aggregate count.
 */
export interface CohortTelemetryEvent {
  event: 'calibration-cohort-size';
  cohortSize: number;
  ruleId: string;
  timestamp: Date;
}

/**
 * Listener callback for telemetry events.
 */
export type TelemetryListener = (event: CohortTelemetryEvent) => void;

/**
 * Configuration for cohort telemetry.
 */
export interface CohortTelemetryConfig {
  /** Feature flag — telemetry is disabled when false. Default: false */
  enabled: boolean;
}

/**
 * Emits consent-gated cohort-size telemetry events.
 *
 * Usage:
 * ```typescript
 * const emitter = new CohortTelemetryEmitter(consentStore, { enabled: true });
 * emitter.onEvent((evt) => logger.info(evt));
 * await emitter.emitCohortSize('org-123', 'MD-001', 12);
 * ```
 */
export class CohortTelemetryEmitter {
  private readonly listeners: TelemetryListener[] = [];

  constructor(
    private readonly consentStore: ConsentStoreAdapter,
    private readonly config: CohortTelemetryConfig = { enabled: false },
  ) {}

  /**
   * Register a listener for telemetry events.
   */
  onEvent(listener: TelemetryListener): void {
    this.listeners.push(listener);
  }

  /**
   * Emit a cohort-size telemetry event if:
   * 1. The feature flag is enabled
   * 2. The organization has granted 'telemetry' consent
   *
   * @param orgId     - Organization requesting calibration (used for consent check only)
   * @param ruleId    - Rule being calibrated
   * @param cohortSize - Number of organizations in the calibration cohort
   * @returns true if the event was emitted, false if gated
   */
  async emitCohortSize(
    orgId: string,
    ruleId: string,
    cohortSize: number,
  ): Promise<boolean> {
    // Gate 1: Feature flag
    if (!this.config.enabled) {
      return false;
    }

    // Gate 2: Consent check
    const hasConsent = await this.consentStore.hasValidConsent(orgId, undefined, 'telemetry');
    if (!hasConsent) {
      return false;
    }

    // Emit event — contains only aggregate data, no org identifiers
    const event: CohortTelemetryEvent = {
      event: 'calibration-cohort-size',
      cohortSize,
      ruleId,
      timestamp: new Date(),
    };

    for (const listener of this.listeners) {
      listener(event);
    }

    return true;
  }

  /**
   * Check whether telemetry is enabled via feature flag.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Create a CohortTelemetryEmitter from environment variables.
   * Reads ENABLE_COHORT_TELEMETRY (default: 'false').
   */
  static fromEnv(consentStore: ConsentStoreAdapter): CohortTelemetryEmitter {
    const enabled = process.env.ENABLE_COHORT_TELEMETRY === 'true';
    return new CohortTelemetryEmitter(consentStore, { enabled });
  }
}
