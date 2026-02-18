/**
 * Tests for the verify command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock fns ─────────────────────────────────────────────────────────
const mockGetIdentity = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockStoreIdentity = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetIdentityByStripeCustomerId = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockListStripeVerifiedIdentities = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

const mockVerifyOrganization = jest.fn<() => Promise<any>>().mockResolvedValue({
  verified: true,
  metadata: {
    githubOrgName: 'test-gh-org',
    githubOrgId: 12345,
    createdAt: new Date('2020-01-01'),
    memberCount: 10,
    publicRepoCount: 5,
    hasRecentActivity: true,
  },
});

const mockVerifyCustomer = jest.fn<() => Promise<any>>().mockResolvedValue({
  verified: true,
  metadata: {
    stripeCustomerId: 'cus_123',
    email: 'test@example.com',
    created: new Date('2020-01-01'),
  },
});

const mockGenerateAndBindNonce = jest.fn<() => Promise<any>>().mockResolvedValue({
  binding: { nonce: 'test-nonce-abc123' },
});

// Must include L0InvariantViolation & OracleDegradedError because
// ../lib/errors.ts (imported transitively) re-exports them from core
class MockL0InvariantViolation extends Error {
  constructor(public invariantId: string, public evidence: Record<string, unknown>) {
    super(`L0 invariant violated: ${invariantId}`); this.name = 'L0InvariantViolation';
  }
}
class MockOracleDegradedError extends Error {
  constructor(public reason: string, public canProceed: boolean) {
    super(`Oracle degraded: ${reason}`); this.name = 'OracleDegradedError';
  }
}

jest.unstable_mockModule('@mirror-dissonance/core', () => ({
  GitHubVerifier: jest.fn().mockImplementation(() => ({
    verifyOrganization: mockVerifyOrganization,
  })),
  StripeVerifier: jest.fn().mockImplementation(() => ({
    verifyCustomer: mockVerifyCustomer,
    verifyCustomerWithSubscription: jest.fn<() => Promise<any>>().mockResolvedValue({
      verified: true, metadata: {},
    }),
  })),
  NonceBindingService: jest.fn().mockImplementation(() => ({
    generateAndBindNonce: mockGenerateAndBindNonce,
  })),
  createLocalTrustAdapters: jest.fn().mockReturnValue({
    identityStore: {
      getIdentity: mockGetIdentity,
      storeIdentity: mockStoreIdentity,
      getIdentityByStripeCustomerId: mockGetIdentityByStripeCustomerId,
      listStripeVerifiedIdentities: mockListStripeVerifiedIdentities,
    },
  }),
  L0InvariantViolation: MockL0InvariantViolation,
  OracleDegradedError: MockOracleDegradedError,
}));

// Mock ora
jest.unstable_mockModule('ora', () => ({
  default: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    fail: jest.fn(),
    text: '',
  }),
}));

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { verifyCommand } = await import('../commands/verify.js');

describe('verify command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply mocks after clearAllMocks
    mockGetIdentity.mockResolvedValue(null);
    mockGetIdentityByStripeCustomerId.mockResolvedValue(null);
    mockListStripeVerifiedIdentities.mockResolvedValue([]);
    mockVerifyOrganization.mockResolvedValue({
      verified: true,
      metadata: {
        githubOrgName: 'test-gh-org',
        githubOrgId: 12345,
        createdAt: new Date('2020-01-01'),
        memberCount: 10,
        publicRepoCount: 5,
        hasRecentActivity: true,
      },
    });
    mockVerifyCustomer.mockResolvedValue({
      verified: true,
      metadata: {
        stripeCustomerId: 'cus_123',
        email: 'test@example.com',
        created: new Date('2020-01-01'),
      },
    });
    mockGenerateAndBindNonce.mockResolvedValue({
      binding: { nonce: 'test-nonce-abc123' },
    });
    process.env.PHASE_MIRROR_DATA_DIR = '.test-data-verify';
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  });

  describe('github', () => {
    it('verifies a GitHub organization', async () => {
      await verifyCommand.github({
        orgId: 'test-org',
        githubOrg: 'test-gh-org',
        publicKey: 'a'.repeat(64),
      });

      expect(mockVerifyOrganization).toHaveBeenCalledWith('test-org', 'test-gh-org');
      expect(mockStoreIdentity).toHaveBeenCalled();
    });

    it('throws when GITHUB_TOKEN is missing', async () => {
      delete process.env.GITHUB_TOKEN;

      await expect(
        verifyCommand.github({ orgId: 'x', githubOrg: 'y', publicKey: 'a'.repeat(64) })
      ).rejects.toThrow('GITHUB_TOKEN');
    });
  });

  describe('stripe', () => {
    it('verifies a Stripe integration', async () => {
      await verifyCommand.stripe({
        orgId: 'stripe-org',
        stripeCustomer: 'cus_123',
        publicKey: 'a'.repeat(64),
      });

      expect(mockVerifyCustomer).toHaveBeenCalledWith('stripe-org', 'cus_123');
      expect(mockStoreIdentity).toHaveBeenCalled();
    });

    it('throws when STRIPE_SECRET_KEY is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY;

      await expect(
        verifyCommand.stripe({ orgId: 'x', stripeCustomer: 'y', publicKey: 'a'.repeat(64) })
      ).rejects.toThrow('STRIPE_SECRET_KEY');
    });
  });

  describe('list', () => {
    it('lists verified identities', async () => {
      await verifyCommand.list({});

      expect(mockListStripeVerifiedIdentities).toHaveBeenCalled();
    });
  });
});
