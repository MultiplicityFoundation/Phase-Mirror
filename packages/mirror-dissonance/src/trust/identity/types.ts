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
  reason?: string;  // Human-readable reason for verification result
}

/**
 * Configuration for GitHub verification heuristics.
 */
export interface GitHubVerificationConfig {
  /** Minimum age in days (default: 90) */
  minAgeDays: number;
  
  /** Minimum member count (default: 3) */
  minMemberCount: number;
  
  /** Minimum public repository count (default: 1) */
  minPublicRepos: number;
  
  /** Require recent activity within days (default: 180, 0 to disable) */
  requireRecentActivityDays: number;
  
  /** Allow organizations with no public repos if other criteria met */
  allowPrivateOrgFallback: boolean;
}

/**
 * Extended verification result with GitHub-specific metadata.
 */
export interface GitHubVerificationResult extends IdentityVerificationResult {
  method: 'github_org';
  metadata: {
    githubOrgId: number;
    githubOrgName: string;
    createdAt: Date;
    memberCount: number;
    publicRepoCount: number;
    hasRecentActivity: boolean;
    lastActivityDate?: Date;
  };
}

/**
 * Rate limit information from GitHub API.
 */
export interface RateLimitStatus {
  limit: number;
  remaining: number;
  reset: Date;
}

/**
 * Custom error for GitHub verification failures.
 */
export class GitHubVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'API_ERROR' | 'RATE_LIMIT' | 'INVALID_TOKEN',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GitHubVerificationError';
  }
}

export interface IGitHubVerifier {
  /**
   * Verify an organization's identity via GitHub organization.
   * 
   * @param orgId - Phase Mirror organization ID (internal)
   * @param githubOrgLogin - GitHub organization login (e.g., 'github')
   * @returns GitHubVerificationResult with verification status and metadata
   * 
   * @throws {GitHubVerificationError} if API request fails
   * @throws {RateLimitError} if GitHub rate limit exceeded
   */
  verifyOrganization(
    orgId: string, 
    githubOrgLogin: string
  ): Promise<GitHubVerificationResult>;

  /**
   * Check current rate limit status.
   * 
   * @returns Rate limit info { limit, remaining, reset }
   */
  getRateLimitStatus(): Promise<RateLimitStatus>;
}

/**
 * Configuration for Stripe verification heuristics.
 */
export interface StripeVerificationConfig {
  /** Minimum account age in days (default: 30) */
  minAgeDays: number;
  
  /** Minimum successful payment count (default: 1) */
  minSuccessfulPayments: number;
  
  /** Require active subscription (default: false) */
  requireActiveSubscription: boolean;
  
  /** Reject customers with delinquent invoices (default: true) */
  rejectDelinquent: boolean;
  
  /** Allowed customer types (default: ['individual', 'company']) */
  allowedCustomerTypes: string[];
  
  /** Require verified business (Stripe Identity check) (default: false) */
  requireVerifiedBusiness: boolean;
}

/**
 * Extended verification result with Stripe-specific metadata.
 */
export interface StripeVerificationResult extends IdentityVerificationResult {
  method: 'stripe_customer';
  metadata: {
    stripeCustomerId: string;
    customerEmail?: string;
    customerName?: string;
    accountCreatedAt: Date;
    successfulPaymentCount: number;
    hasActiveSubscription: boolean;
    subscriptionProductIds?: string[];
    isDelinquent: boolean;
    customerType?: string;
    isBusinessVerified: boolean;
  };
}

/**
 * Custom error for Stripe verification failures.
 */
export class StripeVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: 
      | 'NOT_FOUND' 
      | 'API_ERROR' 
      | 'RATE_LIMIT' 
      | 'INVALID_KEY' 
      | 'INVALID_CUSTOMER_ID'
      | 'DELINQUENT',
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'StripeVerificationError';
  }
}

export interface IStripeVerifier {
  /**
   * Verify an organization's identity via Stripe customer account.
   * 
   * @param orgId - Phase Mirror organization ID (internal)
   * @param stripeCustomerId - Stripe customer ID (e.g., 'cus_ABC123')
   * @returns StripeVerificationResult with verification status and metadata
   * 
   * @throws {StripeVerificationError} if API request fails
   * @throws {StripeVerificationError} if customer ID format invalid
   */
  verifyCustomer(
    orgId: string, 
    stripeCustomerId: string
  ): Promise<StripeVerificationResult>;

  /**
   * Verify a customer and require active subscription.
   * 
   * @param orgId - Phase Mirror organization ID
   * @param stripeCustomerId - Stripe customer ID
   * @param requiredProductIds - Optional list of product IDs to check for
   * @returns StripeVerificationResult with subscription details
   */
  verifyCustomerWithSubscription(
    orgId: string,
    stripeCustomerId: string,
    requiredProductIds?: string[]
  ): Promise<StripeVerificationResult>;

  /**
   * Check if a customer has any delinquent invoices.
   * 
   * @param stripeCustomerId - Stripe customer ID
   * @returns True if customer has unpaid invoices
   */
  hasDelinquentInvoices(stripeCustomerId: string): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════
// Nonce Binding Types
// ═══════════════════════════════════════════════════════════

/**
 * Cryptographic binding between a nonce and verified identity.
 * 
 * Ensures one-to-one relationship: one verified org → one nonce.
 * Prevents nonce sharing, reuse, and identity spoofing.
 */
export interface NonceBinding {
  /** The unique nonce bound to this organization */
  nonce: string;
  
  /** Phase Mirror organization ID */
  orgId: string;
  
  /** Organization's public key (hex) */
  publicKey: string;
  
  /** When this binding was created */
  boundAt: Date;
  
  /** How the organization was verified */
  verificationMethod: VerificationMethod;
  
  /** Cryptographic signature proving ownership (SHA256(nonce:publicKey)) */
  signature: string;
  
  /** If revoked, when it was revoked */
  revokedAt?: Date;
  
  /** Reason for revocation (for audit trail) */
  revocationReason?: string;
}

/**
 * Result of nonce binding validation.
 */
export interface NonceBindingValidationResult {
  /** Whether the nonce binding is valid */
  valid: boolean;
  
  /** Reason for invalidity (if applicable) */
  reason?: string;
  
  /** The binding details (if valid) */
  binding?: NonceBinding;
}

/**
 * Nonce rotation request.
 */
export interface NonceRotationRequest {
  /** Organization requesting rotation */
  orgId: string;
  
  /** New public key (optional, uses existing if not provided) */
  newPublicKey?: string;
  
  /** Reason for rotation (required for audit) */
  reason: string;
  
  /** Timestamp of rotation request */
  requestedAt: Date;
}

/**
 * Nonce revocation record (for audit trail).
 */
export interface NonceRevocation {
  /** The revoked nonce */
  nonce: string;
  
  /** Organization that owned the nonce */
  orgId: string;
  
  /** When it was revoked */
  revokedAt: Date;
  
  /** Why it was revoked */
  reason: string;
  
  /** Who revoked it (system or admin user) */
  revokedBy: string;
}
