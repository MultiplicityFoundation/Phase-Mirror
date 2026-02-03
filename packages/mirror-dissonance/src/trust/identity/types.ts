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

export interface IStripeVerifier {
  verifyCustomer(orgId: string, stripeCustomerId: string): Promise<IdentityVerificationResult>;
}
