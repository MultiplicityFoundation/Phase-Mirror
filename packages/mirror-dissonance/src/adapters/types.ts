// packages/mirror-dissonance/src/adapters/types.ts

import type { NonceConfig, FalsePositiveEvent, CalibrationResult, KAnonymityError, ConsentType } from '../../schemas/types.js';

export type { NonceConfig };

export interface CloudConfig {
  provider: 'aws' | 'gcp' | 'local';
  region?: string;
  // AWS-specific
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  nonceParameterName?: string;
  baselineBucket?: string;
  // GCP-specific
  gcpProjectId?: string;
  // Local-specific
  localDataDir?: string;
}

export interface FPEvent {
  eventId: string;
  ruleId: string;
  ruleVersion: string;
  findingId: string;
  outcome: 'block' | 'warn' | 'pass';
  isFalsePositive: boolean;
  timestamp: Date;
  context: {
    repo: string;
    branch: string;
    eventType: 'pullrequest' | 'mergegroup' | 'drift';
  };
}

export interface FPWindow {
  ruleId: string;
  ruleVersion: string;
  windowSize: number;
  events: FPEvent[];
  statistics: {
    total: number;
    falsePositives: number;
    truePositives: number;
    pending: number;
    observedFPR: number; // FP / (total - pending)
  };
}

export interface FPStoreAdapter {
  // Windowed FP event API (Phase 0)
  recordEvent(event: FPEvent): Promise<void>;
  getWindowByCount(ruleId: string, count: number): Promise<FPWindow>;
  getWindowBySince(ruleId: string, since: Date): Promise<FPWindow>;
  markFalsePositive(eventId: string, reviewedBy: string): Promise<void>;
  computeWindow(ruleId: string, events: FPEvent[]): FPWindow;

  /**
   * Check if a finding has been marked as a false positive.
   * @param ruleIdOrFindingId When called with 1 arg, this is the findingId.
   *   When called with 2 args, this is the ruleId for narrowing.
   * @param findingId Optional findingId for 2-arg variant
   */
  isFalsePositive(ruleIdOrFindingId: string, findingId?: string): Promise<boolean>;

  // Simple FP recording API (Phase 1)
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}

export interface ConsentStoreAdapter {
  recordConsent(consent: {
    orgId: string;
    repoId?: string;
    scope: string;
    grantedBy: string;
    expiresAt?: Date;
  }): Promise<void>;
  hasValidConsent(orgId: string, repoId?: string, scope?: string): Promise<boolean>;
  revokeConsent(orgId: string, scope: string, revokedBy?: string): Promise<void>;
  getConsent(orgId: string): Promise<any>;
  grantConsent(orgId: string, scope: string, grantedBy: string, expiresAt?: Date): Promise<void>;
  checkResourceConsent(orgId: string, scope: string): Promise<{ granted: boolean; state: string }>;
  checkMultipleResources(orgId: string, scopes: string[]): Promise<{
    allGranted: boolean;
    missingConsent: string[];
    results: Record<string, { granted: boolean }>;
  }>;
  getConsentSummary(orgId: string): Promise<{
    orgId: string;
    resources: Record<string, { state: string }>;
  } | null>;
  checkConsent(orgId: string): Promise<ConsentType>;
}

/**
 * Block Counter Adapter (circuit breaker tracking)
 *
 * Error Handling Philosophy (Phase 0):
 * - Throws BlockCounterError with full context on failure
 * - Callers at L0 (circuit breaker logic) implement fail-open behavior
 * - Infrastructure failures MUST be observable
 * - Counter failure ≠ circuit trip — these are separate concerns
 *
 * Important distinction:
 * - getCount() returns 0 successfully → rule has never been incremented
 * - getCount() throws BlockCounterError → infrastructure failure (DynamoDB throttle, etc.)
 *
 * @see SPEC-COMPUTE.md §Error Propagation Contract
 */
export interface BlockCounterAdapter {
  /**
   * Increment the block counter for a rule.
   * @param ruleId The rule identifier
   * @param orgId The organization identifier
   * @returns The new count after increment
   * @throws BlockCounterError on infrastructure failure
   */
  increment(ruleId: string, orgId: string): Promise<number>;

  /**
   * Get the current count for a rule.
   * @param ruleId The rule identifier
   * @param orgId The organization identifier
   * @returns The current count (0 if rule has never been incremented)
   * @throws BlockCounterError on infrastructure failure
   */
  getCount(ruleId: string, orgId: string): Promise<number>;

  /**
   * Check if the circuit breaker threshold has been reached.
   * @param ruleId The rule identifier
   * @param orgId The organization identifier
   * @param threshold The circuit breaker threshold
   * @returns true if count >= threshold
   * @throws BlockCounterError on infrastructure failure
   */
  isCircuitBroken(ruleId: string, orgId: string, threshold: number): Promise<boolean>;
}

/**
 * Secret Store Adapter (for nonce storage)
 *
 * Error Handling Philosophy (Phase 0):
 * - Throws SecretStoreError with full context on failure
 * - Callers at L0 (business logic) implement fail-closed behavior
 * - Infrastructure failures MUST be observable
 *
 * @see SPEC-COMPUTE.md §Error Propagation Contract
 */
export interface SecretStoreAdapter {
  /**
   * Get the current nonce value.
   * @returns The nonce config with value, loadedAt timestamp, and source
   * @throws SecretStoreError if retrieval fails or secret is missing/malformed
   */
  getNonce(): Promise<NonceConfig>;

  /**
   * Get all active nonce versions (for grace-period rotation).
   * @returns Array of nonce strings, newest first
   * @throws SecretStoreError if retrieval fails
   */
  getNonces(): Promise<string[]>;

  /**
   * Rotate the nonce (create a new version).
   * @param newValue The new nonce value
   * @throws SecretStoreError if rotation fails
   */
  rotateNonce(newValue: string): Promise<void>;
}

export interface ObjectStoreAdapter {
  getBaseline(repoId: string): Promise<any | null>;
  putBaseline(repoId: string, baseline: any): Promise<void>;
  listBaselineVersions(repoId: string): Promise<Array<{ versionId: string; lastModified: Date }>>;
}

export interface BaselineStorageAdapter {
  storeBaseline(name: string, content: string | Buffer): Promise<void>;
  getBaseline(name: string): Promise<string | null>;
  listBaselines(): Promise<Array<{ version: string }>>;
  deleteBaseline(name: string): Promise<void>;
}

export interface CalibrationStoreAdapter {
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError>;
  getRuleFPRate(ruleId: string, since?: string): Promise<CalibrationResult | KAnonymityError>;
  getAllRuleFPRates(): Promise<Array<CalibrationResult | KAnonymityError>>;
}

export interface CloudAdapters {
  fpStore: FPStoreAdapter;
  consentStore: ConsentStoreAdapter;
  blockCounter: BlockCounterAdapter;
  secretStore: SecretStoreAdapter;
  objectStore: ObjectStoreAdapter;
  baselineStorage: BaselineStorageAdapter;
  calibrationStore: CalibrationStoreAdapter;
}
