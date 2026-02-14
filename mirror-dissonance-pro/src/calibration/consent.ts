/**
 * Multi-Tenant Consent Management
 *
 * Manages per-tenant consent for FP data contribution to the calibration pool.
 * Ensures GDPR/CCPA compliance for cross-customer data aggregation.
 */

export interface TenantConsent {
  tenantId: string;
  orgId: string;
  consentType: 'explicit' | 'implicit' | 'none';
  grantedAt: string;
  expiresAt?: string;
  scope: string[];
  revokedAt?: string;
}

export class ConsentManager {
  // Placeholder — full implementation in Phase 6E (multi-tenant consent)
}
