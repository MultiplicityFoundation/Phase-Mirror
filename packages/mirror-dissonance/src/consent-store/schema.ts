/**
 * Consent Store Schema
 * 
 * Enhanced schema for granular consent management per ADR-004
 */

/**
 * Consent resource types
 */
export const CONSENT_RESOURCES = [
  "fp_patterns",
  "fp_metrics",
  "cross_org_benchmarks",
  "rule_calibration",
  "audit_logs",
  "drift_baselines",
] as const;

export type ConsentResource = typeof CONSENT_RESOURCES[number];

/**
 * Consent state
 */
export type ConsentState =
  | "granted"
  | "expired"
  | "revoked"
  | "pending"
  | "not_requested";

/**
 * Individual resource consent status
 */
export interface ResourceConsentStatus {
  resource: ConsentResource;
  state: ConsentState;
  grantedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  version?: string;
}

/**
 * Consent event for audit trail
 */
export interface ConsentEvent {
  eventId: string;
  eventType: "granted" | "revoked" | "expired" | "renewed" | "version_update";
  resource: ConsentResource;
  timestamp: Date;
  actor: string; // Hashed admin ID
  previousState?: ConsentState;
  newState: ConsentState;
  metadata?: Record<string, unknown>;
}

/**
 * Organization consent record
 */
export interface OrganizationConsent {
  /** Unique organization identifier (hashed) */
  orgId: string;
  
  /** Organization display name (for UI only) */
  orgName?: string;
  
  /** Map of resources to their consent status */
  resources: Record<ConsentResource, ResourceConsentStatus>;
  
  /** Who granted consent (hashed admin ID) */
  grantedBy: string;
  
  /** Consent version (for re-consent on policy changes) */
  consentVersion: string;
  
  /** Audit trail of consent changes */
  history: ConsentEvent[];
  
  /** Last updated timestamp */
  updatedAt: Date;
  
  /** Created timestamp */
  createdAt: Date;
}

/**
 * Result of a consent check
 */
export interface ConsentCheckResult {
  /** Whether consent is granted */
  granted: boolean;
  
  /** Consent state */
  state: ConsentState;
  
  /** Resource that was checked */
  resource: ConsentResource;
  
  /** When consent was granted (if applicable) */
  grantedAt?: Date;
  
  /** When consent expires (if applicable) */
  expiresAt?: Date;
  
  /** Consent version */
  version?: string;
  
  /** Reason if not granted */
  reason?: string;
}

/**
 * Result of checking multiple resources
 */
export interface MultiResourceConsentResult {
  /** Whether all required resources have consent */
  allGranted: boolean;
  
  /** Map of resources to their check results */
  results: Record<ConsentResource, ConsentCheckResult>;
  
  /** List of resources that are missing consent */
  missingConsent: ConsentResource[];
}

/**
 * Consent policy configuration
 */
export interface ConsentPolicyConfig {
  version: string;
  effectiveDate: string;
  resources: Record<ConsentResource, ResourcePolicyConfig>;
}

/**
 * Resource policy configuration
 */
export interface ResourcePolicyConfig {
  description: string;
  riskLevel: "low" | "medium" | "high";
  dataRetention: string;
  requiredFor: string[];
}

/**
 * Current consent policy version
 */
export const CURRENT_CONSENT_POLICY: ConsentPolicyConfig = {
  version: "1.2",
  effectiveDate: "2026-01-01",
  resources: {
    fp_patterns: {
      description: "Access to false positive patterns from your organization",
      riskLevel: "medium",
      dataRetention: "90 days",
      requiredFor: ["query_fp_store.recent_patterns"],
    },
    fp_metrics: {
      description: "Access to aggregated FP rate metrics",
      riskLevel: "low",
      dataRetention: "365 days",
      requiredFor: ["query_fp_store.fp_rate", "query_fp_store.trend_analysis"],
    },
    cross_org_benchmarks: {
      description: "Compare your governance metrics against anonymized industry benchmarks",
      riskLevel: "high",
      dataRetention: "30 days",
      requiredFor: ["query_fp_store.cross_rule_comparison"],
    },
    rule_calibration: {
      description: "Access to rule tuning recommendations",
      riskLevel: "medium",
      dataRetention: "60 days",
      requiredFor: ["query_fp_store.calibration"],
    },
    audit_logs: {
      description: "Access to governance audit logs",
      riskLevel: "high",
      dataRetention: "180 days",
      requiredFor: ["check_adr_compliance.audit"],
    },
    drift_baselines: {
      description: "Access to historical drift baselines",
      riskLevel: "low",
      dataRetention: "365 days",
      requiredFor: ["analyze_dissonance.baseline"],
    },
  },
};

/**
 * Map of tool operations to required consent resources
 */
export const TOOL_RESOURCE_REQUIREMENTS: Record<string, ConsentResource[]> = {
  "query_fp_store.fp_rate": ["fp_metrics"],
  "query_fp_store.recent_patterns": ["fp_patterns"],
  "query_fp_store.trend_analysis": ["fp_metrics"],
  "query_fp_store.cross_rule_comparison": ["fp_patterns", "cross_org_benchmarks"],
  "check_adr_compliance.audit": ["audit_logs"],
  "analyze_dissonance.baseline": ["drift_baselines"],
};

/**
 * Get required resources for a tool operation
 */
export function getRequiredResources(tool: string, operation: string): ConsentResource[] {
  const key = `${tool}.${operation}`;
  return TOOL_RESOURCE_REQUIREMENTS[key] || [];
}
