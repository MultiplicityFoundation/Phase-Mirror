/**
 * Consent Store Types for Adapter Layer
 * 
 * These types are used by the cloud-agnostic adapter interfaces.
 */

/**
 * Calibration consent record - consent for FP calibration data sharing
 */
export interface CalibrationConsent {
  orgId: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  resources: string[]; // List of resources consented to
}

/**
 * Query for checking consent status
 */
export interface ConsentQuery {
  orgId: string;
  resource?: string; // Optional: check specific resource
}
