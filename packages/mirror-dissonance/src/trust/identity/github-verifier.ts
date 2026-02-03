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

import { Octokit } from '@octokit/rest';
import {
  IGitHubVerifier,
  GitHubVerificationResult,
  GitHubVerificationConfig,
  GitHubVerificationError,
  RateLimitStatus,
} from './types.js';

// Re-export GitHubVerificationError for convenience
export { GitHubVerificationError } from './types.js';

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
    githubOrgLogin: string
  ): Promise<GitHubVerificationResult> {
    try {
      // Step 1: Fetch organization metadata
      const org = await this.fetchOrganization(githubOrgLogin);

      // Step 2: Validate age
      const ageInDays = this.calculateAgeDays(org.created_at);
      if (ageInDays < this.config.minAgeDays) {
        return this.createFailureResult(
          orgId,
          githubOrgLogin,
          `Organization too new (${ageInDays} days, minimum ${this.config.minAgeDays})`
        );
      }

      // Step 3: Validate member count (requires additional API call)
      const memberCount = await this.fetchMemberCount(githubOrgLogin);
      if (memberCount < this.config.minMemberCount) {
        return this.createFailureResult(
          orgId,
          githubOrgLogin,
          `Insufficient members (${memberCount}, minimum ${this.config.minMemberCount})`
        );
      }

      // Step 4: Validate public repository activity
      const publicRepoCount = org.public_repos;
      if (publicRepoCount < this.config.minPublicRepos) {
        if (!this.config.allowPrivateOrgFallback) {
          return this.createFailureResult(
            orgId,
            githubOrgLogin,
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
          githubOrgLogin,
          this.config.requireRecentActivityDays
        );
        hasRecentActivity = activity.hasActivity;
        lastActivityDate = activity.lastActivityDate;

        if (!hasRecentActivity && !this.config.allowPrivateOrgFallback) {
          return this.createFailureResult(
            orgId,
            githubOrgLogin,
            `No activity in last ${this.config.requireRecentActivityDays} days`
          );
        }
      }

      // All checks passed
      return {
        verified: true,
        method: 'github_org',
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
          githubOrgLogin,
          `GitHub organization '${githubOrgLogin}' not found`
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
          return parseInt(match[1], 10);
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

      const latestEvent = events[0];
      const lastActivityDate = new Date(latestEvent.created_at!);

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
      method: 'github_org',
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
