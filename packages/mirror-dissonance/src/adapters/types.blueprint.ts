// Cloud-agnostic adapter interfaces.
// Every provider (aws, gcp, local) must implement all five.
// No cloud SDK imports allowed in this file.

import type { FPEvent, FPWindow } from "../fp-store/types";
import type {
  CalibrationConsent,
  ConsentQuery,
} from "../consent-store/types";
import type { MachineDecision } from "../../schemas/types";

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
  grantConsent(consent: CalibrationConsent): Promise<void>;
  revokeConsent(orgId: string, revokedBy: string): Promise<void>;
  hasConsent(query: ConsentQuery): Promise<boolean>;
  getConsent(orgId: string): Promise<CalibrationConsent | null>;
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
  provider: "aws" | "gcp" | "local";
}
