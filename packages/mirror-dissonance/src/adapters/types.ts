/**
 * Cloud Provider Adapter Interfaces
 * 
 * These interfaces define the contracts for cloud provider adapters.
 * The core dissonance logic depends only on these interfaces, never on
 * specific cloud provider SDKs.
 */

import { FalsePositiveEvent } from '../../schemas/types.js';
import { OrganizationConsent, ConsentResource, ConsentCheckResult, MultiResourceConsentResult } from '../consent-store/schema.js';

/**
 * Cloud provider configuration
 */
export interface CloudConfig {
  provider: 'aws' | 'gcp' | 'local';
  region?: string;
  projectId?: string;  // GCP project ID
  localDataDir?: string;  // Local file storage directory
}

/**
 * False Positive Store Adapter
 */
export interface IFPStoreAdapter {
  /**
   * Record a false positive event
   */
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;

  /**
   * Check if a finding is marked as false positive
   */
  isFalsePositive(findingId: string): Promise<boolean>;

  /**
   * Get all false positives for a specific rule
   */
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}

/**
 * Consent Store Adapter
 */
export interface IConsentStoreAdapter {
  /**
   * Check consent for a single resource
   */
  checkResourceConsent(orgId: string, resource: ConsentResource): Promise<ConsentCheckResult>;

  /**
   * Check consent for multiple resources
   */
  checkMultipleResources(orgId: string, resources: ConsentResource[]): Promise<MultiResourceConsentResult>;

  /**
   * Get full consent summary for an organization
   */
  getConsentSummary(orgId: string): Promise<OrganizationConsent | null>;

  /**
   * Grant consent for a resource
   */
  grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void>;

  /**
   * Revoke consent for a resource
   */
  revokeConsent(orgId: string, resource: ConsentResource, revokedBy: string): Promise<void>;

  /**
   * Legacy method for backwards compatibility
   */
  checkConsent(orgId: string): Promise<'explicit' | 'implicit' | 'none'>;

  /**
   * Legacy method for backwards compatibility
   */
  hasValidConsent(orgId: string): Promise<boolean>;
}

/**
 * Block Counter Adapter (for circuit breaker)
 */
export interface IBlockCounterAdapter {
  /**
   * Increment the block counter for a rule
   * @returns The new count after increment
   */
  increment(ruleId: string): Promise<number>;

  /**
   * Get the current count for a rule
   */
  getCount(ruleId: string): Promise<number>;
}

/**
 * Nonce Config
 */
export interface NonceConfig {
  value: string;
  loadedAt: string;
  source: string;
}

/**
 * Secret Store Adapter (for nonce storage)
 */
export interface ISecretStoreAdapter {
  /**
   * Get the current nonce value
   * @returns The nonce config, or null if not found or on error (fail-closed)
   */
  getNonce(): Promise<NonceConfig | null>;

  /**
   * Rotate the nonce (create a new version)
   */
  rotateNonce(newValue: string): Promise<void>;
}

/**
 * Baseline version metadata
 */
export interface BaselineVersion {
  version: string;
  uploadedAt: Date;
  size: number;
  contentType?: string;
}

/**
 * Baseline Storage Adapter (for drift baselines)
 */
export interface IBaselineStorageAdapter {
  /**
   * Store a baseline file
   * @param key The baseline identifier (e.g., "baseline-v1.json")
   * @param content The baseline content
   * @param contentType Optional content type
   */
  storeBaseline(key: string, content: string | Buffer, contentType?: string): Promise<void>;

  /**
   * Retrieve a baseline file
   * @param key The baseline identifier
   * @returns The baseline content, or null if not found
   */
  getBaseline(key: string): Promise<string | null>;

  /**
   * List all baseline versions
   * @returns Array of baseline versions, sorted by upload date (newest first)
   */
  listBaselines(): Promise<BaselineVersion[]>;

  /**
   * Delete a baseline version
   * @param key The baseline identifier
   */
  deleteBaseline(key: string): Promise<void>;
}

/**
 * Calibration Store Result
 */
export interface CalibrationResult {
  ruleId: string;
  totalFPs: number;
  orgCount: number;
  averageFPsPerOrg: number;
  meetsKAnonymity: boolean;
}

/**
 * K-Anonymity Error
 */
export interface KAnonymityError {
  error: 'INSUFFICIENT_K_ANONYMITY';
  message: string;
  requiredK: number;
  actualK: number;
}

/**
 * Calibration Store Adapter
 */
export interface ICalibrationStoreAdapter {
  /**
   * Aggregate false positives by rule
   */
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError>;

  /**
   * Get rule false positive rate with date filtering
   */
  getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError>;

  /**
   * Get all rule false positive rates
   */
  getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError>;
}

/**
 * Complete set of cloud adapters
 */
export interface CloudAdapters {
  fpStore: IFPStoreAdapter;
  consentStore: IConsentStoreAdapter;
  blockCounter: IBlockCounterAdapter;
  secretStore: ISecretStoreAdapter;
  baselineStorage: IBaselineStorageAdapter;
  calibrationStore: ICalibrationStoreAdapter;
}
