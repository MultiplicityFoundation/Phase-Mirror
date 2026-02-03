/**
 * Identity Verification Types
 * 
 * Types for organization identity verification and Sybil resistance.
 * Supports multiple verification methods to prevent multiple identity attacks.
 */

export type VerificationMethod = 'github_org' | 'stripe_customer' | 'manual';

export interface OrganizationIdentity {
  orgId: string;
  publicKey: string;
  verificationMethod: VerificationMethod;
  verifiedAt: Date;
  uniqueNonce: string;          // One-time nonce from trusted authority
  githubOrgId?: number;         // Verified GitHub org ID
  stripeCustomerId?: string;    // Verified Stripe customer
  domainOwnership?: string;     // Verified domain control
}

export interface IdentityVerificationResult {
  verified: boolean;
  method: VerificationMethod;
  verifiedAt?: Date;
  error?: string;
}

export interface IGitHubVerifier {
  verifyOrganization(orgId: string, githubOrgLogin: string): Promise<IdentityVerificationResult>;
}

export interface IStripeVerifier {
  verifyCustomer(orgId: string, stripeCustomerId: string): Promise<IdentityVerificationResult>;
}
