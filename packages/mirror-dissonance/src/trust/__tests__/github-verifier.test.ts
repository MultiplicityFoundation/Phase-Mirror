/**
 * Unit tests for GitHubVerifier
 *
 * Uses constructor dependency injection (octokitOverride) to supply
 * a mock Octokit instance instead of jest.mock, which does not
 * reliably intercept ESM imports in this project configuration.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { GitHubVerifier } from '../identity/github-verifier.js';
import { GitHubVerificationError, GitHubVerificationConfig } from '../identity/types.js';

// Shared mock Octokit shape — fresh functions are created in beforeEach
let mockOctokit: any;

/** Helper: create a GitHubVerifier with the mock Octokit injected */
function createVerifier(
  token = 'test-token',
  config?: Partial<GitHubVerificationConfig>
) {
  return new GitHubVerifier(token, config, mockOctokit);
}

describe('GitHubVerifier', () => {
  beforeEach(() => {
    mockOctokit = {
      orgs: {
        get: jest.fn(),
        listMembers: jest.fn(),
      },
      activity: {
        listPublicOrgEvents: jest.fn(),
      },
      rateLimit: {
        get: jest.fn(),
      },
    };
  });

  describe('constructor', () => {
    it('should throw if token is empty', () => {
      expect(() => new GitHubVerifier('')).toThrow('GitHub API token is required');
    });

    it('should throw if token is whitespace', () => {
      expect(() => new GitHubVerifier('   ')).toThrow('GitHub API token is required');
    });

    it('should accept valid token', () => {
      const verifier = new GitHubVerifier('valid-token');
      expect(verifier).toBeDefined();
    });

    it('should accept custom config', () => {
      const verifier = createVerifier('token', { minAgeDays: 30 });
      expect(verifier).toBeDefined();
    });

    it('should use default config when not provided', () => {
      const verifier = createVerifier();
      expect(verifier).toBeDefined();
    });
  });

  describe('verifyOrganization - success cases', () => {
    it('should verify legitimate organization', async () => {
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

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-123', 'acme-corp');

      expect(result.verified).toBe(true);
      expect(result.method).toBe('github_org');
      expect(result.metadata.githubOrgId).toBe(12345);
      expect(result.metadata.githubOrgName).toBe('acme-corp');
      expect(result.metadata.memberCount).toBe(5);
      expect(result.metadata.publicRepoCount).toBe(25);
      expect(result.metadata.hasRecentActivity).toBe(true);
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('should verify old established org with no recent activity', async () => {
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

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true, // Fallback enabled
      });

      const result = await verifier.verifyOrganization('org-456', 'old-corp');

      // Passes due to age + member count despite no recent activity
      expect(result.verified).toBe(true);
      expect(result.metadata.hasRecentActivity).toBe(false);
    });

    it('should verify org with exact minimum thresholds', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 90); // Exactly 90 days

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 11111,
          login: 'min-org',
          created_at: createdAt.toISOString(),
          public_repos: 1, // Exactly 1 repo
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }], // Exactly 3 members
        headers: {},
      });

      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [{ created_at: new Date().toISOString() }],
      });

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-min', 'min-org');

      expect(result.verified).toBe(true);
    });

    it('should verify private org with no public repos when fallback enabled', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 200);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 99999,
          login: 'private-corp',
          created_at: createdAt.toISOString(),
          public_repos: 0, // No public repos
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
        headers: {},
      });

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true,
      });

      const result = await verifier.verifyOrganization('org-private', 'private-corp');

      expect(result.verified).toBe(true);
      expect(result.metadata.publicRepoCount).toBe(0);
    });
  });

  describe('verifyOrganization - failure cases', () => {
    it('should reject org that is too new', async () => {
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

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-new', 'new-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('too new');
      expect(result.reason).toContain('30 days');
      expect(result.reason).toContain('minimum 90');
    });

    it('should reject org with insufficient members', async () => {
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

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-small', 'small-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient members');
      expect(result.reason).toContain('1');
      expect(result.reason).toContain('minimum 3');
    });

    it('should reject org with insufficient public repos when fallback disabled', async () => {
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

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 0,
        allowPrivateOrgFallback: false, // Strict mode
      });

      const result = await verifier.verifyOrganization('org-private', 'private-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient public repos');
    });

    it('should reject org with no recent activity when fallback disabled', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 44444,
          login: 'stale-corp',
          created_at: createdAt.toISOString(),
          public_repos: 10,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      // No events
      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [],
      });

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: false,
      });

      const result = await verifier.verifyOrganization('org-stale', 'stale-corp');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No activity in last 180 days');
    });

    it('should handle org not found', async () => {
      mockOctokit.orgs.get.mockRejectedValue({ status: 404 });

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-404', 'nonexistent');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
      expect(result.reason).toContain('nonexistent');
    });

    it('should throw on rate limit error', async () => {
      mockOctokit.orgs.get.mockRejectedValue({
        status: 403,
        message: 'API rate limit exceeded',
      });

      const verifier = createVerifier();

      await expect(
        verifier.verifyOrganization('org-rate', 'test-org')
      ).rejects.toThrow(GitHubVerificationError);

      await expect(
        verifier.verifyOrganization('org-rate', 'test-org')
      ).rejects.toThrow('rate limit');
    });

    it('should throw on generic API error', async () => {
      mockOctokit.orgs.get.mockRejectedValue(new Error('Network error'));

      const verifier = createVerifier();

      await expect(
        verifier.verifyOrganization('org-error', 'test-org')
      ).rejects.toThrow(GitHubVerificationError);

      await expect(
        verifier.verifyOrganization('org-error', 'test-org')
      ).rejects.toThrow('API request failed');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit info', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 3600;
      
      mockOctokit.rateLimit.get.mockResolvedValue({
        data: {
          resources: {
            core: {
              limit: 5000,
              remaining: 4500,
              reset: resetTime,
            },
          },
        },
      });

      const verifier = createVerifier();
      const status = await verifier.getRateLimitStatus();

      expect(status.limit).toBe(5000);
      expect(status.remaining).toBe(4500);
      expect(status.reset).toBeInstanceOf(Date);
    });

    it('should throw on API error', async () => {
      mockOctokit.rateLimit.get.mockRejectedValue(new Error('API error'));

      const verifier = createVerifier();

      await expect(verifier.getRateLimitStatus()).rejects.toThrow(GitHubVerificationError);
      await expect(verifier.getRateLimitStatus()).rejects.toThrow('Failed to fetch rate limit status');
    });
  });

  describe('edge cases', () => {
    it('should handle missing Link header in member count', async () => {
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

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-test', 'test-org');

      expect(result.verified).toBe(true);
      expect(result.metadata.memberCount).toBe(3);
    });

    it('should parse Link header correctly', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 55555,
          login: 'big-org',
          created_at: createdAt.toISOString(),
          public_repos: 50,
        },
      });

      // Link header with pagination
      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }],
        headers: { 
          link: '<https://api.github.com/orgs/big-org/members?page=2>; rel="next", <https://api.github.com/orgs/big-org/members?page=42>; rel="last"'
        },
      });

      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [{ created_at: new Date().toISOString() }],
      });

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-big', 'big-org');

      expect(result.verified).toBe(true);
      expect(result.metadata.memberCount).toBe(42);
    });

    it('should handle private member list (403)', async () => {
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

      const verifier = createVerifier();
      const result = await verifier.verifyOrganization('org-private-members', 'private-members');

      // Fails due to memberCount = 0 < minMemberCount
      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient members');
    });

    it('should handle empty events array', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 66666,
          login: 'no-events',
          created_at: createdAt.toISOString(),
          public_repos: 5,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      mockOctokit.activity.listPublicOrgEvents.mockResolvedValue({
        data: [],
      });

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true,
      });

      const result = await verifier.verifyOrganization('org-no-events', 'no-events');

      expect(result.verified).toBe(true);
      expect(result.metadata.hasRecentActivity).toBe(false);
    });

    it('should handle events API error gracefully', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 77777,
          login: 'events-error',
          created_at: createdAt.toISOString(),
          public_repos: 5,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      // Events API throws error
      mockOctokit.activity.listPublicOrgEvents.mockRejectedValue(new Error('Events unavailable'));

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true,
      });

      const result = await verifier.verifyOrganization('org-events-error', 'events-error');

      expect(result.verified).toBe(true);
      expect(result.metadata.hasRecentActivity).toBe(false);
    });

    it('should not check activity when requireRecentActivityDays is 0', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 88888,
          login: 'no-activity-check',
          created_at: createdAt.toISOString(),
          public_repos: 5,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 0, // Disabled
        allowPrivateOrgFallback: true,
      });

      const result = await verifier.verifyOrganization('org-no-check', 'no-activity-check');

      expect(result.verified).toBe(true);
      expect(mockOctokit.activity.listPublicOrgEvents).not.toHaveBeenCalled();
    });

    it('should not check activity when org has no public repos', async () => {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - 180);

      mockOctokit.orgs.get.mockResolvedValue({
        data: {
          id: 99999,
          login: 'no-repos',
          created_at: createdAt.toISOString(),
          public_repos: 0,
        },
      });

      mockOctokit.orgs.listMembers.mockResolvedValue({
        data: [{ id: 1 }, { id: 2 }, { id: 3 }],
        headers: {},
      });

      const verifier = createVerifier('token', {
        minAgeDays: 90,
        minMemberCount: 3,
        minPublicRepos: 1,
        requireRecentActivityDays: 180,
        allowPrivateOrgFallback: true,
      });

      const result = await verifier.verifyOrganization('org-no-repos', 'no-repos');

      expect(result.verified).toBe(true);
      expect(mockOctokit.activity.listPublicOrgEvents).not.toHaveBeenCalled();
    });
  });

  describe('GitHubVerificationError', () => {
    it('should create error with code and details', () => {
      const error = new GitHubVerificationError(
        'Test error',
        'API_ERROR',
        { foo: 'bar' }
      );

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('API_ERROR');
      expect(error.details).toEqual({ foo: 'bar' });
      expect(error.name).toBe('GitHubVerificationError');
    });

    it('should create error without details', () => {
      const error = new GitHubVerificationError('Test error', 'NOT_FOUND');

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.details).toBeUndefined();
    });
  });
});
