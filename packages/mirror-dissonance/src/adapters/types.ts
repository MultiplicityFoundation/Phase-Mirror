/**
 * Cloud Adapter Interfaces for Mirror Dissonance Protocol
 * 
 * These interfaces abstract cloud provider implementations to enable:
 * - Local testing without cloud resources
 * - Multi-cloud support (AWS, GCP, Azure)
 * - Easier unit testing with mock implementations
 */

import { FalsePositiveEvent } from '../../schemas/types.js';

/**
 * False Positive Store Adapter
 * Manages FP event tracking with atomic operations
 */
export interface FPStoreAdapter {
  /**
   * Record a new false positive event
   * @param event Event to record (id auto-generated if not provided)
   */
  record(event: Omit<FalsePositiveEvent, 'id'> & { id?: string }): Promise<string>;
  
  /**
   * Mark a finding as false positive
   * @param findingId Finding identifier
   * @param resolvedBy Who marked it as FP
   */
  markAsFP(findingId: string, resolvedBy: string): Promise<void>;
  
  /**
   * Check if a finding is marked as false positive
   * @param findingId Finding identifier
   */
  isFalsePositive(findingId: string): Promise<boolean>;
  
  /**
   * Query false positives by various criteria
   * @param query Query parameters
   */
  query(query: FPQuery): Promise<FalsePositiveEvent[]>;
}

export interface FPQuery {
  orgId?: string;
  repoId?: string;
  ruleId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Secret Store Adapter
 * Manages secure storage and retrieval of secrets (nonces, salts, keys)
 */
export interface SecretStoreAdapter {
  /**
   * Get HMAC nonce for redaction
   * @param version Version identifier (default: 'current')
   */
  getNonce(version?: string): Promise<string | null>;
  
  /**
   * Get anonymization salt
   * @param orgId Organization identifier
   */
  getSalt(orgId: string): Promise<string | null>;
  
  /**
   * Store a secret parameter
   * @param key Secret key
   * @param value Secret value
   * @param encrypted Whether to encrypt the value
   */
  putSecret(key: string, value: string, encrypted?: boolean): Promise<void>;
}

/**
 * Block Counter Adapter (Circuit Breaker)
 * Race-safe atomic counter with TTL support
 */
export interface BlockCounterAdapter {
  /**
   * Atomically increment counter
   * @param key Counter key
   * @param ttlSeconds TTL in seconds
   * @returns New count value
   */
  increment(key: string, ttlSeconds: number): Promise<number>;
  
  /**
   * Get current counter value
   * @param key Counter key
   */
  get(key: string): Promise<number>;
  
  /**
   * Reset counter (for testing)
   * @param key Counter key
   */
  reset(key: string): Promise<void>;
}

/**
 * Object Store Adapter
 * Manages baseline storage with versioning
 */
export interface ObjectStoreAdapter {
  /**
   * Store a baseline
   * @param repoId Repository identifier
   * @param baseline Baseline content (JSON object)
   * @param metadata Optional metadata (commitSha, etc.)
   */
  storeBaseline(
    repoId: string,
    baseline: Record<string, unknown>,
    metadata?: BaselineMetadata
  ): Promise<void>;
  
  /**
   * Get current baseline
   * @param repoId Repository identifier
   */
  getBaseline(repoId: string): Promise<Record<string, unknown> | null>;
  
  /**
   * List baseline versions
   * @param repoId Repository identifier
   * @param limit Maximum number of versions to return
   */
  listBaselineVersions(repoId: string, limit?: number): Promise<BaselineVersion[]>;
  
  /**
   * Store analysis report
   * @param repoId Repository identifier
   * @param runId Run identifier
   * @param report Report content
   */
  storeReport(
    repoId: string,
    runId: string,
    report: Record<string, unknown>
  ): Promise<void>;
  
  /**
   * Get analysis report by repo and run ID
   * @param repoId Repository identifier
   * @param runId Run identifier
   */
  getReport(repoId: string, runId: string): Promise<Record<string, unknown> | null>;
}

export interface BaselineMetadata {
  commitSha?: string;
  author?: string;
  timestamp?: string;
}

export interface BaselineVersion {
  versionId: string;
  lastModified: Date;
  commitSha?: string;
  size: number;
}

/**
 * Consent Store Adapter
 * Manages organization consent for data tracking
 */
export interface ConsentStoreAdapter {
  /**
   * Check if organization has consented to feature
   * @param orgId Organization identifier
   * @param repoId Repository identifier (optional)
   * @param feature Feature identifier
   */
  hasConsent(orgId: string, repoId: string | null, feature: string): Promise<boolean>;
  
  /**
   * Record consent
   * @param orgId Organization identifier
   * @param repoId Repository identifier (optional)
   * @param feature Feature identifier
   * @param granted Whether consent is granted
   */
  recordConsent(
    orgId: string,
    repoId: string | null,
    feature: string,
    granted: boolean
  ): Promise<void>;
}

/**
 * Cloud Adapters Bundle
 * All adapters needed for Oracle operation
 */
export interface CloudAdapters {
  fpStore: FPStoreAdapter;
  secretStore: SecretStoreAdapter;
  blockCounter: BlockCounterAdapter;
  objectStore: ObjectStoreAdapter;
  consentStore: ConsentStoreAdapter;
}
