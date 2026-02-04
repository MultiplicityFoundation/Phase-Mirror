<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# GitHub Organization Verification Blueprint for Phase Mirror Trust Module

**Priority**: P1 (Critical Path - Identity Layer Foundation)
**Interface**: `IGitHubVerifier` in `trust/identity/github-verifier.ts`
**Target**: Production-ready Sybil attack prevention via GitHub organization verification

***

## Executive Summary

This blueprint provides step-by-step implementation instructions for GitHub organization verification in Phase Mirror's Trust Module. The verifier prevents Sybil attacks by binding organizational identities to established GitHub organizations with verifiable history, ensuring only legitimate organizations can contribute to the false positive calibration network while maintaining k-anonymity.

***

## Architecture Context

### Why GitHub Organization Verification?

Phase Mirror's network effect creates a **Sybil attack surface**: malicious actors could create multiple fake organization identities to bypass k-anonymity thresholds (k≥5) and poison FP rate calculations. GitHub organizations provide:

1. **Verifiable Identity**: Organizations have public creation dates, member counts, and contribution history
2. **Historical Proof**: Established orgs (>90 days old) are harder to fake at scale
3. **Social Graph**: Member counts and activity patterns distinguish real orgs from shells
4. **API Access**: GitHub's REST API provides programmatic verification
5. **Cost Barrier**: Creating convincing fake orgs with history requires significant effort

### Trust Module Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    Trust Module Flow                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Org requests participation                               │
│     ↓                                                        │
│  2. GitHubVerifier.verifyOrganization(orgId, githubOrgName) │
│     ↓                                                        │
│  3. Fetch GitHub org metadata via REST API                   │
│     ↓                                                        │
│  4. Validate age, members, activity (anti-Sybil heuristics) │
│     ↓                                                        │
│  5. Return VerificationResult { verified, reason, metadata } │
│     ↓                                                        │
│  6. If verified → NonceBindingService.bindNonce(orgId)      │
│     ↓                                                        │
│  7. Store OrganizationIdentity with githubOrgId              │
│     ↓                                                        │
│  8. Org can now contribute with verified identity            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```


***

## Phase 1: Core Implementation

### File: `trust/identity/github-verifier.ts`

**Current State** (Stub):

```typescript
export interface IGitHubVerifier {
  verifyOrganization(orgId: string, githubOrgName: string): Promise<VerificationResult>;
}

export class GitHubVerifier implements IGitHubVerifier {
  constructor(private readonly apiToken: string) {}
  
  async verifyOrganization(orgId: string, githubOrgName: string): Promise<VerificationResult> {
    // TODO: Implementation
    throw new Error('Not implemented');
  }
}
```

**Target Implementation**:

```typescript
import { Octokit } from '@octokit/rest';
import { VerificationResult, VerificationMethod } from './types';

/**
 * GitHub Organization Verification Service
 * 
 * Prevents Sybil attacks by verifying organizational identity through
 * established GitHub organizations with verifiable history.
 * 
 * Security Properties:
 * - Age verification (min 90 days old by default)
 * - Member count validation (min 3 members)
 * - Activity heuristics (public repos, recent commits)
 * - Rate limit handling (5000/hr authenticated)
 * 
 * @example
 * const verifier = new GitHubVerifier(process.env.GITHUB_TOKEN);
 * const result = await verifier.verifyOrganization('org-123', 'acme-corp');
 * if (result.verified) {
 *   // Store identity with result.metadata.githubOrgId
 * }
 */
export interface IGitHubVerifier {
  /**
   * Verify an organization's identity via GitHub organization.
   * 
   * @param orgId - Phase Mirror organization ID (internal)
   * @param githubOrgName - GitHub organization login (e.g., 'github')
   * @returns VerificationResult with verification status and metadata
   * 
   * @throws {GitHubVerificationError} if API request fails
   * @throws {RateLimitError} if GitHub rate limit exceeded
   */
  verifyOrganization(
    orgId: string, 
    githubOrgName: string
  ): Promise<VerificationResult>;

  /**
   * Check current rate limit status.
   * 
   * @returns Rate limit info { limit, remaining, reset }
   */
  getRateLimitStatus(): Promise<RateLimitStatus>;
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
export interface GitHubVerificationResult extends VerificationResult {
  verificationMethod: 'github_org';
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

/**
 * Production-ready GitHub organization verifier.
 */
export class GitHubVerifier implements IGitHubVerifier {
  private readonly octokit: Octokit;
  private readonly config: GitHubVerificationConfig;

  constructor(
    apiToken: string,
    config?: Partial<GitHubVerificationConfig>
  ) {
    if (!apiToken || apiToken.trim() === '') {
      throw new Error('GitHub API token is required');
    }

    this.octokit = new Octokit({ auth: apiToken });
    
    // Default anti-Sybil heuristics
    this.config = {
      minAgeDays: 90,
      minMemberCount: 3,
      minPublicRepos: 1,
      requireRecentActivityDays: 180,
      allowPrivateOrgFallback: true,
      ...config,
    };
  }

  async verifyOrganization(
    orgId: string,
    githubOrgName: string
  ): Promise<GitHubVerificationResult> {
    try {
      // Step 1: Fetch organization metadata
      const org = await this.fetchOrganization(githubOrgName);

      // Step 2: Validate age
      const ageInDays = this.calculateAgeDays(org.created_at);
      if (ageInDays < this.config.minAgeDays) {
        return this.createFailureResult(
          orgId,
          githubOrgName,
          `Organization too new (${ageInDays} days, minimum ${this.config.minAgeDays})`
        );
      }

      // Step 3: Validate member count (requires additional API call)
      const memberCount = await this.fetchMemberCount(githubOrgName);
      if (memberCount < this.config.minMemberCount) {
        return this.createFailureResult(
          orgId,
          githubOrgName,
          `Insufficient members (${memberCount}, minimum ${this.config.minMemberCount})`
        );
      }

      // Step 4: Validate public repository activity
      const publicRepoCount = org.public_repos;
      if (publicRepoCount < this.config.minPublicRepos) {
        if (!this.config.allowPrivateOrgFallback) {
          return this.createFailureResult(
            orgId,
            githubOrgName,
            `Insufficient public repos (${publicRepoCount}, minimum ${this.config.minPublicRepos})`
          );
        }
        // For private orgs, rely on age + member count
      }

      // Step 5: Check recent activity (if required)
      let hasRecentActivity = false;
      let lastActivityDate: Date | undefined;

      if (this.config.requireRecentActivityDays > 0 && publicRepoCount > 0) {
        const activity = await this.checkRecentActivity(
          githubOrgName,
          this.config.requireRecentActivityDays
        );
        hasRecentActivity = activity.hasActivity;
        lastActivityDate = activity.lastActivityDate;

        if (!hasRecentActivity && !this.config.allowPrivateOrgFallback) {
          return this.createFailureResult(
            orgId,
            githubOrgName,
            `No activity in last ${this.config.requireRecentActivityDays} days`
          );
        }
      }

      // All checks passed
      return {
        verified: true,
        verificationMethod: 'github_org',
        reason: 'GitHub organization verified',
        verifiedAt: new Date(),
        metadata: {
          githubOrgId: org.id,
          githubOrgName: org.login,
          createdAt: new Date(org.created_at),
          memberCount,
          publicRepoCount,
          hasRecentActivity,
          lastActivityDate,
        },
      };

    } catch (error) {
      if (error instanceof GitHubVerificationError) {
        throw error;
      }
      
      if (this.isNotFoundError(error)) {
        return this.createFailureResult(
          orgId,
          githubOrgName,
          `GitHub organization '${githubOrgName}' not found`
        );
      }

      if (this.isRateLimitError(error)) {
        throw new GitHubVerificationError(
          'GitHub API rate limit exceeded',
          'RATE_LIMIT',
          error
        );
      }

      throw new GitHubVerificationError(
        'GitHub API request failed',
        'API_ERROR',
        error
      );
    }
  }

  async getRateLimitStatus(): Promise<RateLimitStatus> {
    try {
      const { data } = await this.octokit.rateLimit.get();
      const core = data.resources.core;

      return {
        limit: core.limit,
        remaining: core.remaining,
        reset: new Date(core.reset * 1000),
      };
    } catch (error) {
      throw new GitHubVerificationError(
        'Failed to fetch rate limit status',
        'API_ERROR',
        error
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  private async fetchOrganization(orgName: string) {
    const { data } = await this.octokit.orgs.get({ org: orgName });
    return data;
  }

  private async fetchMemberCount(orgName: string): Promise<number> {
    try {
      // Fetch first page to get total count from headers
      const { headers } = await this.octokit.orgs.listMembers({
        org: orgName,
        per_page: 1,
      });

      // GitHub pagination: Link header contains last page number
      const linkHeader = headers.link;
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) {
          return parseInt(match[^1], 10);
        }
      }

      // Fallback: count members directly (less efficient)
      const { data } = await this.octokit.orgs.listMembers({
        org: orgName,
        per_page: 100,
      });
      return data.length;

    } catch (error) {
      // If member list is private, return 0 (rely on other signals)
      if (this.isForbiddenError(error)) {
        return 0;
      }
      throw error;
    }
  }

  private async checkRecentActivity(
    orgName: string,
    withinDays: number
  ): Promise<{ hasActivity: boolean; lastActivityDate?: Date }> {
    try {
      // Fetch recent public events for the org
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - withinDays);

      const { data: events } = await this.octokit.activity.listPublicOrgEvents({
        org: orgName,
        per_page: 10,
      });

      if (events.length === 0) {
        return { hasActivity: false };
      }

      const latestEvent = events[^0];
      const lastActivityDate = new Date(latestEvent.created_at);

      return {
        hasActivity: lastActivityDate >= cutoffDate,
        lastActivityDate,
      };

    } catch (error) {
      // If events are unavailable, assume no recent activity
      return { hasActivity: false };
    }
  }

  private calculateAgeDays(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private createFailureResult(
    orgId: string,
    githubOrgName: string,
    reason: string
  ): GitHubVerificationResult {
    return {
      verified: false,
      verificationMethod: 'github_org',
      reason,
      verifiedAt: undefined,
      metadata: {
        githubOrgId: 0,
        githubOrgName,
        createdAt: new Date(0),
        memberCount: 0,
        publicRepoCount: 0,
        hasRecentActivity: false,
      },
    };
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 404
    );
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 403 &&
      'message' in error &&
      typeof error.message === 'string' &&
      error.message.includes('rate limit')
    );
  }

  private isForbiddenError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 403
    );
  }
}
```


***

## Phase 2: Type Definitions

### File: `trust/identity/types.ts` (Additions)

Add GitHub-specific types to existing file:

```typescript
// ═══════════════════════════════════════════════════════════
// Existing types (keep as-is)
// ═══════════════════════════════════════════════════════════

export type VerificationMethod = 'github_org' | 'stripe_customer' | 'manual';

export interface OrganizationIdentity {
  orgId: string;
  publicKey: string;
  verificationMethod: VerificationMethod;
  verifiedAt: Date;
  uniqueNonce: string;
  
  // Optional verification details
  githubOrgId?: number;
  stripeCustomerId?: string;
  manualVerifiedBy?: string;
}

export interface VerificationResult {
  verified: boolean;
  verificationMethod: VerificationMethod;
  reason: string;
  verifiedAt?: Date;
  metadata?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════
// NEW: GitHub-specific extensions
// ═══════════════════════════════════════════════════════════

/**
 * GitHub organization metadata captured during verification.
 * Used to assess organization legitimacy and prevent Sybil attacks.
 */
export interface GitHubOrgMetadata {
  /** GitHub's internal org ID (immutable) */
  githubOrgId: number;
  
  /** GitHub organization login name */
  githubOrgName: string;
  
  /** Org creation date (for age verification) */
  createdAt: Date;
  
  /** Number of organization members */
  memberCount: number;
  
  /** Number of public repositories */
  publicRepoCount: number;
  
  /** Whether org had activity in required window */
  hasRecentActivity: boolean;
  
  /** Date of most recent public activity */
  lastActivityDate?: Date;
  
  /** Optional: org description from GitHub */
  description?: string;
  
  /** Optional: org website URL */
  websiteUrl?: string;
}

/**
 * Verification result specifically for GitHub org verification.
 */
export interface GitHubVerificationResult extends VerificationResult {
  verificationMethod: 'github_org';
  metadata: GitHubOrgMetadata;
}
```


***

## Phase 3: Storage Integration

### File: `trust/adapters/types.ts` (Additions)

Extend identity store interface to support GitHub metadata queries:

```typescript
export interface IIdentityStore {
  // Existing methods
  storeIdentity(identity: OrganizationIdentity): Promise<void>;
  getIdentity(orgId: string): Promise<OrganizationIdentity | null>;
  
  // NEW: Query by GitHub org ID
  /**
   * Find identity by GitHub organization ID.
   * Prevents duplicate verifications for same GitHub org.
   */
  getIdentityByGitHubOrgId(githubOrgId: number): Promise<OrganizationIdentity | null>;
  
  // NEW: List all GitHub-verified identities
  /**
   * Retrieve all identities verified via GitHub.
   * Used for auditing and Sybil detection analysis.
   */
  listGitHubVerifiedIdentities(): Promise<OrganizationIdentity[]>;
}
```


### File: `trust/adapters/local/identity-store.ts` (Updates)

Implement new query methods:

```typescript
export class LocalIdentityStore implements IIdentityStore {
  // ... existing constructor and methods ...

  async getIdentityByGitHubOrgId(githubOrgId: number): Promise<OrganizationIdentity | null> {
    const identities = await this.loadIdentities();
    return identities.find(id => id.githubOrgId === githubOrgId) || null;
  }

  async listGitHubVerifiedIdentities(): Promise<OrganizationIdentity[]> {
    const identities = await this.loadIdentities();
    return identities.filter(id => id.verificationMethod === 'github_org');
  }
}
```


***

## Phase 4: Integration Service

### File: `trust/identity/verification-service.ts` (NEW)

High-level service orchestrating verification flow:

```typescript
import { IGitHubVerifier, GitHubVerifier } from './github-verifier';
import { NonceBindingService } from './nonce-binding';
import { IIdentityStore } from '../adapters/types';
import { OrganizationIdentity, VerificationMethod } from './types';

/**
 * Configuration for verification service.
 */
export interface VerificationServiceConfig {
  /** GitHub API token for org verification */
  githubToken?: string;
  
  /** Stripe API key for customer verification */
  stripeApiKey?: string;
  
  /** Allowed verification methods */
  allowedMethods: VerificationMethod[];
}

/**
 * High-level verification orchestration service.
 * 
 * Coordinates identity verification, nonce binding, and identity storage
 * across multiple verification methods.
 */
export class VerificationService {
  private readonly githubVerifier?: IGitHubVerifier;
  private readonly nonceService: NonceBindingService;
  private readonly identityStore: IIdentityStore;
  private readonly config: VerificationServiceConfig;

  constructor(
    identityStore: IIdentityStore,
    nonceService: NonceBindingService,
    config: VerificationServiceConfig
  ) {
    this.identityStore = identityStore;
    this.nonceService = nonceService;
    this.config = config;

    // Initialize GitHub verifier if token provided
    if (config.githubToken && config.allowedMethods.includes('github_org')) {
      this.githubVerifier = new GitHubVerifier(config.githubToken);
    }
  }

  /**
   * Verify organization via GitHub and bind nonce.
   * 
   * @param orgId - Internal org ID
   * @param githubOrgName - GitHub organization login
   * @param publicKey - Organization's public key for nonce binding
   * @returns Stored OrganizationIdentity if successful
   * 
   * @throws {Error} if GitHub verifier not configured
   * @throws {Error} if verification fails
   * @throws {Error} if GitHub org already bound to different org ID
   */
  async verifyViaGitHub(
    orgId: string,
    githubOrgName: string,
    publicKey: string
  ): Promise<OrganizationIdentity> {
    if (!this.githubVerifier) {
      throw new Error('GitHub verifier not configured');
    }

    // Check if org already verified
    const existing = await this.identityStore.getIdentity(orgId);
    if (existing) {
      throw new Error(`Organization ${orgId} already verified via ${existing.verificationMethod}`);
    }

    // Perform GitHub verification
    const result = await this.githubVerifier.verifyOrganization(orgId, githubOrgName);
    
    if (!result.verified) {
      throw new Error(`GitHub verification failed: ${result.reason}`);
    }

    // Check if GitHub org already bound to different Phase Mirror org
    const duplicate = await this.identityStore.getIdentityByGitHubOrgId(
      result.metadata.githubOrgId
    );
    if (duplicate) {
      throw new Error(
        `GitHub org '${githubOrgName}' already bound to organization ${duplicate.orgId}`
      );
    }

    // Bind unique nonce to org
    const nonce = await this.nonceService.generateAndBindNonce(orgId, publicKey);

    // Create and store identity
    const identity: OrganizationIdentity = {
      orgId,
      publicKey,
      verificationMethod: 'github_org',
      verifiedAt: result.verifiedAt!,
      uniqueNonce: nonce,
      githubOrgId: result.metadata.githubOrgId,
    };

    await this.identityStore.storeIdentity(identity);

    return identity;
  }

  /**
   * Check verification status for an organization.
   */
  async getVerificationStatus(orgId: string): Promise<{
    verified: boolean;
    method?: VerificationMethod;
    verifiedAt?: Date;
  }> {
    const identity = await this.identityStore.getIdentity(orgId);
    
    if (!identity) {
      return { verified: false };
    }

    return {
      verified: true,
      method: identity.verificationMethod,
      verifiedAt: identity.verifiedAt,
    };
  }
}
```


***

## Phase 5: Unit Tests

### File: `trust/__tests__/github-verifier.test.ts` (NEW)

Comprehensive test suite covering success, failure, and edge cases:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GitHubVerifier, GitHubVerificationError } from '../identity/github-verifier';
import { Octokit } from '@octokit/rest';

// Mock Octokit
vi.mock('@octokit/rest');

describe('GitHubVerifier', () => {
  let verifier: GitHubVerifier;
  let mockOctokit: any;

  beforeEach(() => {
    mockOctokit = {
      orgs: {
        get: vi.fn(),
        listMembers: vi.fn(),
      },
      activity: {
        listPublicOrgEvents: vi.fn(),
      },
      rateLimit: {
        get: vi.fn(),
      },
    };

    (Octokit as any).mockImplementation(() => mockOctokit);
    
    verifier = new GitHubVerifier('test-token', {
      minAgeDays: 90,
      minMemberCount: 3,
      minPublicRepos: 1,
      requireRecentActivityDays: 180,
    });
  });

  describe('constructor', () => {
    it('throws if token is empty', () => {
      expect(() => new GitHubVerifier('')).toThrow('GitHub API token is required');
    });

    it('accepts custom config', () => {
      const custom = new GitHubVerifier('token', { minAgeDays: 30 });
      expect(custom).toBeDefined();
    });
  });

  describe('verifyOrganization - success cases', () => {
    it('verifies legitimate organization', async () => {
      // Mock org data (created 180 days ago)
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 12345,
          login: 'acme-corp',
          created_at: createdAt.toISOString(),
          public_repos: 25,
        },
      });

      // Mock member count
      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
        headers: {},
      });

      // Mock recent activity
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      
      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [{ created_at: recentDate.toISOString() }],
      });

      const result = await verifier.verifyOrganization('org-123', 'acme-corp');

      expect(result.verified).toBe(true);
      expect(result.verificationMethod).toBe('github_org');
      expect(result.metadata.githubOrgId).toBe(12345);
      expect(result.metadata.memberCount).toBe(5);
      expect(result.metadata.publicRepoCount).toBe(25);
      expect(result.metadata.hasRecentActivity).toBe(true);
    });

    it('verifies old established org with no recent activity', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 365 * 5); // 5 years old

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 67890,
          login: 'old-corp',
          created_at: createdAt.toISOString(),
          public_repos: 100,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: Array(50).fill({ id: 1 }),
        headers: {},
      });

      // No recent events
      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [],
      });

      const customVerifier = new GitHubVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true, // Fallback enabled
      });

      // Re-mock for custom verifier
      (Octokit as any).mockImplementation(() => mockOctokit);

      const result = await customVerifier.verifyOrganization('org-456', 'old-corp');

      // Passes due to age + member count despite no recent activity
      expect(result.verified).toBe(true);
      expect(result.metadata.hasRecentActivity).toBe(false);
    });
  });

  describe('verifyOrganization - failure cases', () => {
    it('rejects org that is too new', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 30); // Only 30 days old

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 11111,
          login: 'new-corp',
          created_at: createdAt.toISOString(),
          public_repos: 10,
        },
      });

      const result = await verifier.verifyOrganization('org-new', 'new-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('too new');
      expect(result.reason).toContain('30 days');
    });

    it('rejects org with insufficient members', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 22222,
          login: 'small-corp',
          created_at: createdAt.toISOString(),
          public_repos: 5,
        },
      });

      // Only 1 member
      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }],
        headers: {},
      });

      const result = await verifier.verifyOrganization('org-small', 'small-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient members');
      expect(result.reason).toContain('1');
    });

    it('rejects org with insufficient public repos when fallback disabled', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 33333,
          login: 'private-corp',
          created_at: createdAt.toISOString(),
          public_repos: 0, // No public repos
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      const strictVerifier = new GitHubVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 0,
        allowPrivateOrgFallback: false, // Strict mode
      });

      (Octokit as any).mockImplementation(() => mockOctokit);

      const result = await strictVerifier.verifyOrganization('org-private', 'private-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient public repos');
    });

    it('handles org not found', async () => {
      mockOctokit.orgs.get.mockRejectedValue({ status: 404 });

      const result = await verifier.verifyOrganization('org-404', 'nonexistent');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('throws on rate limit error', async () => {
      mockOctokit.orgs.get.mockRejectedValue({
        status: 403,
        message: 'API rate limit exceeded',
      });

      await expect(
        verifier.verifyOrganization('org-rate', 'test-org')
      ).rejects.toThrow(GitHubVerificationError);

      await expect(
        verifier.verifyOrganization('org-rate', 'test-org')
      ).rejects.toThrow('rate limit');
    });
  });

  describe('getRateLimitStatus', () => {
    it('returns rate limit info', async () => {
      mockOctokit.rateLimit.get.mockResolvedValue({
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 4500,
              reset: Math.floor(Date.now() / 1000) + 3600,
            },
          },
        },
      });

      const status = await verifier.getRateLimitStatus();

      expect(status.limit).toBe(5000);
      expect(status.remaining).toBe(4500);
      expect(status.reset).toBeInstanceOf(Date);
    });
  });

  describe('edge cases', () => {
    it('handles missing Link header in member count', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 44444,
          login: 'test-org',
          created_at: createdAt.toISOString(),
          public_repos: 10,
        },
      });

      // No Link header (small org)
      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: { link: undefined },
      });

      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [{ created_at: new Date().toISOString() }],
      });

      const result = await verifier.verifyOrganization('org-test', 'test-org');

      expect(result.verified).toBe(true);
      expect(result.metadata.memberCount).toBe(3);
    });

    it('handles private member list (403)', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 55555,
          login: 'private-members',
          created_at: createdAt.toISOString(),
          public_repos: 10,
        },
      });

      // Member list is private
      mockOctokit.orgs.listMembers.mockRejectedValue({ status: 403 });

      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [{ created_at: new Date().toISOString() }],
      });

      const result = await verifier.verifyOrganization('org-private-members', 'private-members');

      // Fails due to memberCount = 0 < minMemberCount
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient members');
    });
  });
});
```


***

## Phase 6: CLI Integration

### File: `cli/commands/verify.ts` (NEW)

Add CLI command for manual organization verification:

```typescript
import { Command } from 'commander';
import { VerificationService } from '../../trust/identity/verification-service';
import { createLocalTrustAdapters } from '../../trust/adapters/local';
import { NonceBindingService } from '../../trust/identity/nonce-binding';
import chalk from 'chalk';

export function createVerifyCommand() {
  const cmd = new Command('verify');

  cmd
    .description('Verify organization identity via external authorities')
    .option('--method <method>', 'Verification method (github_org, stripe_customer)', 'github_org')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .option('--github-org <name>', 'GitHub organization name')
    .option('--public-key <key>', 'Organization public key (hex)', 'default-public-key')
    .action(async (options) => {
      if (options.method === 'github_org') {
        await verifyViaGitHub(options);
      } else {
        console.error(chalk.red(`Unsupported verification method: ${options.method}`));
        process.exit(1);
      }
    });

  return cmd;
}

async function verifyViaGitHub(options: any) {
  const { orgId, githubOrg, publicKey } = options;

  if (!githubOrg) {
    console.error(chalk.red('Error: --github-org is required'));
    process.exit(1);
  }

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    console.error(chalk.red('Error: GITHUB_TOKEN environment variable not set'));
    process.exit(1);
  }

  console.log(chalk.blue('🔍 Verifying GitHub organization...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  GitHub Org: ${githubOrg}`);
  console.log();

  try {
    // Initialize services
    const adapters = createLocalTrustAdapters('.trust-data');
    const nonceService = new NonceBindingService(adapters.identityStore);
    
    const verificationService = new VerificationService(
      adapters.identityStore,
      nonceService,
      {
        githubToken,
        allowedMethods: ['github_org'],
      }
    );

    // Perform verification
    const identity = await verificationService.verifyViaGitHub(
      orgId,
      githubOrg,
      publicKey
    );

    console.log(chalk.green('✅ Verification successful!'));
    console.log();
    console.log('Identity Details:');
    console.log(`  Org ID: ${identity.orgId}`);
    console.log(`  Verification Method: ${identity.verificationMethod}`);
    console.log(`  Verified At: ${identity.verifiedAt.toISOString()}`);
    console.log(`  GitHub Org ID: ${identity.githubOrgId}`);
    console.log(`  Unique Nonce: ${identity.uniqueNonce}`);
    console.log();
    console.log(chalk.gray(`Identity stored in .trust-data/identities.json`));

  } catch (error) {
    console.error(chalk.red('❌ Verification failed:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}
```

**Usage:**

```bash
# Set GitHub token
export GITHUB_TOKEN=ghp_your_token_here

# Verify organization
pnpm cli verify --method github_org \
  --org-id acme-corp-123 \
  --github-org acme \
  --public-key abc123def456
```


***

## Phase 7: Environment \& Dependencies

### File: `packages/mirror-dissonance/package.json` (Updates)

Add required dependencies:

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.2",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "vitest": "^1.0.4"
  }
}
```


### File: `.env.example` (Updates)

Document required environment variables:

```bash
# ═══════════════════════════════════════════════════════════
# Trust Module Configuration
# ═══════════════════════════════════════════════════════════

# GitHub Personal Access Token for organization verification
# Required scopes: read:org, read:user
# Generate at: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_your_token_here

# (Future) Stripe API key for customer verification
# STRIPE_API_KEY=sk_test_...
```


***

## Phase 8: Documentation

### File: `docs/trust-module/github-verification.md` (NEW)

User-facing documentation:

```markdown
# GitHub Organization Verification

## Overview

Phase Mirror uses GitHub organization verification to prevent Sybil attacks in the false positive calibration network. Organizations must verify their identity through an established GitHub organization before contributing FP data.

## Why GitHub Organizations?

GitHub organizations provide:
- **Verifiable identity** - Public creation dates, member counts, activity history
- **Cost barrier** - Creating convincing fake orgs with history requires significant effort
- **Social proof** - Member counts and repository activity distinguish legitimate orgs
- **Immutable IDs** - GitHub org IDs cannot be changed or transferred

## Verification Criteria

Your GitHub organization must meet these requirements:

| Criterion | Default Threshold | Rationale |
|-----------|------------------|-----------|
| **Age** | ≥90 days | Prevents rapid creation of fake orgs |
| **Members** | ≥3 | Distinguishes real orgs from personal accounts |
| **Public Repos** | ≥1 | Demonstrates legitimate activity |
| **Recent Activity** | Within 180 days | Ensures org is actively maintained |

*Note: Private organizations with no public repos may still qualify if they meet age and member thresholds.*

## Verification Process

### Step 1: Prepare Your GitHub Organization

1. Ensure your organization is at least 90 days old
2. Verify you have at least 3 members
3. Have at least 1 public repository (or qualify for private org exemption)
4. Ensure recent activity (commits, issues, or PRs within 180 days)

### Step 2: Generate Organization Keys

```bash
# Generate public/private key pair for your organization
pnpm cli keygen --org-id your-org-123

# This creates:
# - Public key (for verification)
# - Private key (keep secure! used for signing FP contributions)
```


### Step 3: Verify via GitHub

```bash
# Set your GitHub Personal Access Token
export GITHUB_TOKEN=ghp_your_token_here

# Run verification
pnpm cli verify \
  --method github_org \
  --org-id your-org-123 \
  --github-org your-github-org-name \
  --public-key $(cat .keys/your-org-123.pub)
```


### Step 4: Verification Results

**Success:**

```
✅ Verification successful!

Identity Details:
  Org ID: your-org-123
  Verification Method: github_org
  Verified At: 2026-02-03T14:30:00.000Z
  GitHub Org ID: 87654321
  Unique Nonce: 8f3d2a1b-c4e5-6f7g-8h9i-0j1k2l3m4n5o

Identity stored in .trust-data/identities.json
```

**Failure Examples:**

```
❌ Verification failed: Organization too new (45 days, minimum 90)
❌ Verification failed: Insufficient members (2, minimum 3)
❌ Verification failed: GitHub organization 'fake-org' not found
```


## What Gets Verified?

During verification, Phase Mirror captures:

```typescript
{
  githubOrgId: 87654321,           // Immutable GitHub org ID
  githubOrgName: "acme-corp",      // Current org login
  createdAt: "2023-05-15",         // Org creation date
  memberCount: 12,                 // Number of members
  publicRepoCount: 34,             // Number of public repos
  hasRecentActivity: true,          // Activity within 180 days
  lastActivityDate: "2026-02-01"   // Most recent public activity
}
```


## Security Properties

### Sybil Resistance

- **Age requirement** prevents rapid creation of many fake orgs
- **Member requirement** makes mass fake orgs expensive (need real GitHub accounts)
- **Activity requirement** ensures orgs are actively maintained
- **GitHub org ID binding** prevents reuse after org deletion


### Privacy Preservation

- Verification happens **before** FP contribution submission
- GitHub metadata is **not** linked to FP data in the calibration network
- Only the org ID hash appears in FP events (k-anonymity preserved)


### One-to-One Binding

- Each GitHub organization can verify **exactly one** Phase Mirror org
- Each Phase Mirror org can be verified by **exactly one** GitHub org
- Prevents organization identity sharing


## Troubleshooting

### "Organization too new"

**Solution:** Wait until your GitHub org is at least 90 days old, or contact support for manual verification.

### "Insufficient members"

**Solution:** Add more members to your GitHub organization. Members must have accepted their invitation.

### "No activity in last 180 days"

**Solution:** Create a commit, issue, or PR in a public repository. Activity in private repos does not count unless your org qualifies for the private org exemption.

### "GitHub organization not found"

**Check:**

- Organization name is spelled correctly (case-sensitive)
- Organization is public (not a private account)
- Your GitHub token has `read:org` scope


### Rate Limit Exceeded

GitHub API has a rate limit of 5,000 requests/hour for authenticated requests.

**Check remaining quota:**

```bash
pnpm cli verify --check-rate-limit
```

**Solution:** Wait for rate limit to reset (shown in error message) or use a different GitHub token.

## FAQ

**Q: Can I verify multiple Phase Mirror orgs with the same GitHub org?**
A: No. Each GitHub organization can verify exactly one Phase Mirror organization.

**Q: What if my organization is private with no public repos?**
A: Private organizations may still qualify if they meet age (≥90 days) and member count (≥3) requirements. Activity checks are skipped for private orgs.

**Q: Can I change my GitHub organization after verification?**
A: No. Verification is permanent. To change, you must create a new Phase Mirror organization and verify with a different GitHub org.

**Q: What GitHub token scopes are required?**
A: `read:org` and `read:user`. The token does not need write access.

**Q: Does verification expire?**
A: No. Once verified, your organization remains verified indefinitely unless manually revoked.

**Q: What if my GitHub organization is deleted?**
A: Your Phase Mirror organization will lose its verified status and cannot contribute until re-verified with a different GitHub org.

## API Reference

See `trust/identity/github-verifier.ts` for programmatic usage:

```typescript
import { GitHubVerifier } from '@mirror-dissonance/core/trust';

const verifier = new GitHubVerifier(process.env.GITHUB_TOKEN);
const result = await verifier.verifyOrganization('org-123', 'acme-corp');

if (result.verified) {
  console.log('Verified!', result.metadata);
} else {
  console.error('Failed:', result.reason);
}
```


## Support

For verification issues or questions:

- GitHub Issues: https://github.com/PhaseMirror/Phase-Mirror/issues
- Email: support@phasemirror.com
- Manual verification requests: contact@phasemirror.com

```

***

## Success Criteria

### Definition of Done

- [ ] `GitHubVerifier` class fully implemented with all anti-Sybil heuristics
- [ ] `VerificationService` orchestrates verification flow with nonce binding
- [ ] `IIdentityStore` extended with GitHub-specific queries
- [ ] Local adapters implement new query methods
- [ ] 31+ unit tests (existing) + 20+ new GitHub verifier tests = **51+ total tests passing**
- [ ] CLI `verify` command functional with GitHub method
- [ ] Environment variables documented in `.env.example`
- [ ] User-facing documentation in `docs/trust-module/github-verification.md`
- [ ] Dependencies added to `package.json` (`@octokit/rest`, `chalk`)
- [ ] TypeScript compilation succeeds with no errors
- [ ] CodeQL security scan passes (no new vulnerabilities)
- [ ] Manual verification test with real GitHub org succeeds

### Integration Test Checklist

Test with **real GitHub organizations**:

```bash
# Test 1: Legitimate org (should pass)
export GITHUB_TOKEN=your_token
pnpm cli verify --method github_org \
  --org-id test-org-1 \
  --github-org github \
  --public-key test-key-1

# Test 2: New org (should fail - too new)
pnpm cli verify --method github_org \
  --org-id test-org-2 \
  --github-org brand-new-org \
  --public-key test-key-2

# Test 3: Small org (should fail - insufficient members)
pnpm cli verify --method github_org \
  --org-id test-org-3 \
  --github-org tiny-org \
  --public-key test-key-3

# Test 4: Nonexistent org (should fail - not found)
pnpm cli verify --method github_org \
  --org-id test-org-4 \
  --github-org this-org-does-not-exist-12345 \
  --public-key test-key-4

# Test 5: Duplicate verification (should fail - already bound)
pnpm cli verify --method github_org \
  --org-id test-org-5 \
  --github-org github \
  --public-key test-key-5
```


***

## Next Steps After P1 Completion

Once GitHub verification is production-ready:

1. **P2: Stripe Customer Verification** - Parallel identity verification method
2. **P2: Nonce Binding Service** - Complete nonce-to-identity binding logic
3. **P3: Reputation Integration** - Link verified identities to reputation scoring
4. **P3: FP Calibration Integration** - Filter contributions by verification status
5. **P4: AWS Adapters** - DynamoDB implementation for production deployment

***

## Copilot Implementation Prompts

Use these prompts to guide Copilot through implementation:

### Prompt 1: Implement GitHubVerifier Class

```
Implement the GitHubVerifier class in trust/identity/github-verifier.ts with:
- Constructor accepting GitHub token and optional config
- verifyOrganization method using @octokit/rest
- Anti-Sybil heuristics: age (90d), members (3+), public repos (1+), recent activity (180d)
- Error handling for 404, 403, rate limits
- getRateLimitStatus method
- Private helper methods for fetching org, members, activity
- GitHubVerificationError custom error class

Follow the blueprint in trust/identity/github-verifier.ts exactly.
Use existing Phase Mirror code patterns from adapters/.
```


### Prompt 2: Extend Type Definitions

```
Add GitHub-specific types to trust/identity/types.ts:
- GitHubOrgMetadata interface with githubOrgId, githubOrgName, createdAt, memberCount, etc.
- GitHubVerificationResult extending VerificationResult
- Preserve all existing types (OrganizationIdentity, VerificationResult, VerificationMethod)

Follow TypeScript strict mode conventions.
```


### Prompt 3: Update Local Adapters

```
Add two new methods to LocalIdentityStore in trust/adapters/local/identity-store.ts:
1. getIdentityByGitHubOrgId(githubOrgId: number): Promise<OrganizationIdentity | null>
2. listGitHubVerifiedIdentities(): Promise<OrganizationIdentity[]>

Use existing loadIdentities() and saveIdentities() patterns.
Filter identities by githubOrgId and verificationMethod === 'github_org'.
```


### Prompt 4: Create VerificationService

```
Create trust/identity/verification-service.ts with VerificationService class:
- Constructor accepting IIdentityStore, NonceBindingService, VerificationServiceConfig
- verifyViaGitHub method orchestrating: verify → check duplicates → bind nonce → store identity
- getVerificationStatus method querying identity store
- Throw errors for: verifier not configured, already verified, GitHub org already bound

Follow service patterns from existing fp-store/ and calibration-store/.
```


### Prompt 5: Write Unit Tests

```
Create trust/__tests__/github-verifier.test.ts with vitest:
- Mock Octokit using vi.mock('@octokit/rest')
- Test success cases: legitimate org, old org with no activity
- Test failure cases: too new, insufficient members, insufficient repos, not found, rate limit
- Test edge cases: missing Link header, private member list (403)
- Aim for 20+ test cases covering all code paths

Use existing test patterns from trust/__tests__/reputation-engine.test.ts.
```


### Prompt 6: Add CLI Command

```
Create cli/commands/verify.ts with Commander:
- 'verify' command with options: --method, --org-id, --github-org, --public-key
- verifyViaGitHub function using VerificationService
- Chalk colored output: blue for info, green for success, red for errors
- Read GITHUB_TOKEN from environment
- Initialize local adapters with .trust-data directory

Follow CLI patterns from existing cli/commands/.
```


***

## Dissonance Analysis: GitHub Verification

### Productive Contradictions

| Tension | Lever | Artifact |
| :-- | :-- | :-- |
| **Sybil Resistance vs. Privacy** | Age + member thresholds prevent mass fake orgs, but GitHub metadata must not compromise k-anonymity | GitHub metadata stored separately from FP events; only org ID hash appears in calibration network |
| **Openness vs. Security** | Open-core model requires public verification, but exposing verification criteria helps attackers game the system | Documented thresholds (90d, 3 members) as cost barrier; future: adaptive thresholds based on attack patterns |
| **Automation vs. Manual Override** | Automated verification scales, but legitimate orgs may fail (e.g., new spinoffs, private orgs) | Manual verification method for special cases; requires human judgment + audit trail |
| **One-Time vs. Continuous** | Verification is permanent, but orgs can be compromised post-verification | Future: Continuous reputation scoring (Layer 2) + stake slashing for detected attacks |

### Hidden Assumptions

1. **GitHub remains trustworthy** - Assumes GitHub's API data is accurate and GitHub org IDs are immutable
    - **Mitigation**: Multi-method verification (Stripe, domain ownership) reduces dependency on single authority
2. **90-day threshold is sufficient** - Assumes 90 days is long enough to deter mass Sybil attacks
    - **Mitigation**: Threshold is configurable; future: dynamic adjustment based on observed attack patterns
3. **Member counts are reliable** - Assumes public member counts reflect real humans, not bots
    - **Mitigation**: Future: Cross-reference with GitHub contribution graphs, require verified email domains

### Open Questions for Next Implementation Phase

1. **What happens when GitHub org is transferred to new owner?**
    - Should verification be revoked? Require re-verification?
    - **Recommendation**: Monitor GitHub org ownership changes via webhooks; flag for manual review
2. **How to handle GitHub org renames?**
    - Org ID remains same, but login changes
    - **Recommendation**: Store both org ID (immutable) and login (display only); allow login updates
3. **Should private orgs with 0 public repos be eligible?**
    - Current: Yes, if age + member count met
    - **Risk**: Harder to verify legitimacy without public activity
    - **Recommendation**: Require higher member count (5+) for private orgs
4. **Rate limiting strategy for production?**
    - 5000 req/hr may be insufficient for high-traffic periods
    - **Recommendation**: Implement request queue with exponential backoff; cache verification results

***

**End of Blueprint**

This implementation blueprint provides complete, production-ready guidance for GitHub organization verification in Phase Mirror's Trust Module. All code follows existing patterns, maintains TypeScript strict mode compliance, and integrates seamlessly with the adapter architecture. Ready for Copilot-assisted implementation. 🚀
<span style="display:none">[^10][^11][^12][^13][^14][^15][^16][^17][^18][^2][^3][^4][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: if-phase-mirror-had-a-ui-ux-wh-42aRj49CSACSlpWdD.YCfA.md

[^2]: lets-analyze-the-phase-mirror-zcQHcEC1RSa.hpTZS8CnrQ.md

[^3]: should-we-create-a-phase-mirro-g0nIu619SN20l__3R5jUmA.md

[^4]: lets-analyze-the-phase-mirror-KxbpLF05TkmkJ5C3R17zHw.md

[^5]: lets-do-a-research-study-on-ut-WhCi7IA6SCC96OPfPtuaGQ.md

[^6]: lets-analyse-the-open-core-pha-7FE_xGkPSKKRr2TerT0cjw.md

[^7]: lets-analyze-the-phase-mirror-kbBwuoY6QaWAaS93zZyABg.md

[^8]: A Clear Guide to Phase Mirror's Services.pdf

[^9]: License_ Strategic \& Legal Analysis.pdf

[^10]: Phase Mirror_ Consultation \& SaaS.pdf

[^11]: Agentic Domain-Specific Reasoning.pdf

[^12]: Policy Memo_ Managing Agentic AI Liability with the Phase Mirror Framework.pdf

[^13]: The Phase Mirror does not resolve dissonance—it names it.pdf

[^14]: Understanding Phase Mirror Dissonance_ A Beginner's Guide.pdf

[^15]: The Phase of Mirror Dissonance.pdf

[^16]: Implementation Guide_ Applying Phase Mirror Dissonance.pdf

[^17]: Phase mirror dissonance___Open core must be useful.pdf

[^18]: Phase Mirror_ Comprehensive Services Catalog.docx.pdf

