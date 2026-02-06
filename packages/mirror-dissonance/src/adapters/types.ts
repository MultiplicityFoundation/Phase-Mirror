/**
 * Cloud-agnostic adapter interfaces.
 * Every provider (aws, gcp, local) must implement all five.
 * No cloud SDK imports allowed in this file.
 */

import type { FPEvent, FPWindow } from "../fp-store/types";
import type {
  OrganizationConsent,
  ConsentResource,
  ConsentCheckResult,
  MultiResourceConsentResult,
} from "../consent-store/schema";

/**
 * Cloud provider type
 */
export type CloudProvider = "aws" | "gcp" | "local";

/**
 * Cloud provider configuration
 */
export interface CloudConfig {
  provider: CloudProvider;
  region: string;

  // AWS-specific
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  nonceParameterName?: string;
  baselineBucket?: string;

  // GCP-specific
  gcpProjectId?: string;

  // Local-specific (JSON file paths)
  localDataDir?: string;

  // Override endpoint for LocalStack / emulators
  endpoint?: string;
}

// ─── FP Store ──────────────────────────────────────────────
export interface FPStoreAdapter {
  recordEvent(event: FPEvent): Promise<void>;
  markFalsePositive(
    findingId: string,
    reviewedBy: string,
    ticket: string
  ): Promise<void>;
  getWindowByCount(ruleId: string, count: number): Promise<FPWindow>;
  getWindowBySince(ruleId: string, since: Date): Promise<FPWindow>;
  isFalsePositive(findingId: string): Promise<boolean>;
}

// ─── Consent Store ─────────────────────────────────────────
export interface ConsentStoreAdapter {
  grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void>;
  revokeConsent(
    orgId: string,
    resource: ConsentResource,
    revokedBy: string
  ): Promise<void>;
  hasConsent(orgId: string, resource: ConsentResource): Promise<boolean>;
  getConsent(orgId: string): Promise<OrganizationConsent | null>;
}

// ─── Block Counter ─────────────────────────────────────────
export interface BlockCounterAdapter {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

// ─── Secret Store (nonce, future: API keys) ────────────────
export interface SecretStoreAdapter {
  /** Load nonce by parameter path. Returns the decrypted value. */
  getNonce(paramName: string): Promise<string>;
  /** Load nonce with version tracking for rotation grace periods. */
  getNonceWithVersion(paramName: string): Promise<{
    value: string;
    version: number;
  }>;
  /** Health check — can we reach the secret backend? */
  isReachable(): Promise<boolean>;
}

// ─── Baseline Store (drift detection) ──────────────────────
export interface BaselineStoreAdapter {
  getBaseline(key: string): Promise<string | null>;
  putBaseline(key: string, content: string): Promise<void>;
}

// ─── Unified adapter bundle ────────────────────────────────
export interface Adapters {
  fpStore: FPStoreAdapter;
  consentStore: ConsentStoreAdapter;
  blockCounter: BlockCounterAdapter;
  secretStore: SecretStoreAdapter;
  baselineStore: BaselineStoreAdapter;
  provider: CloudProvider;
}

// ─── Legacy type aliases for backward compatibility ─────────
/** @deprecated Use FPStoreAdapter instead */
export type IFPStoreAdapter = FPStoreAdapter;

/** @deprecated Use ConsentStoreAdapter instead */
export type IConsentStoreAdapter = ConsentStoreAdapter;

/** @deprecated Use BlockCounterAdapter instead */
export type IBlockCounterAdapter = BlockCounterAdapter;

/** @deprecated Use SecretStoreAdapter instead */
export type ISecretStoreAdapter = SecretStoreAdapter;

/** @deprecated Use BaselineStoreAdapter instead */
export type IBaselineStorageAdapter = BaselineStoreAdapter;

/** @deprecated Use Adapters instead */
export type CloudAdapters = Adapters;
