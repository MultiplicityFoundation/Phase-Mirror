/**
 * Unit tests for RevenueTrackingService
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock Stripe BEFORE importing RevenueTrackingService
const mockStripe: any = {
  customers: {
    retrieve: jest.fn(),
  },
  paymentIntents: {
    list: jest.fn(),
  },
  subscriptions: {
    list: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn(() => mockStripe);
});

import { RevenueTrackingService } from '../identity/revenue-tracking.js';
import { IIdentityStoreAdapter } from '../adapters/types.js';
import { OrganizationIdentity } from '../identity/types.js';

describe('RevenueTrackingService', () => {
  let mockIdentityStore: jest.Mocked<IIdentityStoreAdapter>;
  let service: RevenueTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock identity store
    mockIdentityStore = {
      getIdentity: jest.fn(),
      storeIdentity: jest.fn(),
      revokeIdentity: jest.fn(),
      getNonceUsageCount: jest.fn(),
      getIdentityByStripeCustomerId: jest.fn(),
      listStripeVerifiedIdentities: jest.fn(),
      getNonceBinding: jest.fn(),
      storeNonceBinding: jest.fn(),
      getNonceBindingByNonce: jest.fn(),
    };

    // Create service with mocked dependencies
    service = new RevenueTrackingService(mockIdentityStore, mockStripe as any);
  });

  describe('getRevenueVerifiedOrgs', () => {
    it('should return empty array when no Stripe-verified identities', async () => {
      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([]);

      const result = await service.getRevenueVerifiedOrgs();

      expect(result).toEqual([]);
    });

    it('should return revenue-verified orgs with customer data', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60); // 60 days ago

      const identity: OrganizationIdentity = {
        orgId: 'org-123',
        publicKey: 'pubkey-123',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2026-01-01'),
        uniqueNonce: 'nonce-123',
        stripeCustomerId: 'cus_ABC123',
      };

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([identity]);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_ABC123',
        email: 'test@example.com',
        name: 'Test Customer',
        created: createdTimestamp,
        deleted: false,
        metadata: {},
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [
          { id: 'pi_1', status: 'succeeded' },
          { id: 'pi_2', status: 'succeeded' },
        ],
      });

      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: 'sub_123',
            status: 'active',
            items: { data: [{ price: { product: 'prod_test' } }] },
          },
        ],
      });

      const result = await service.getRevenueVerifiedOrgs();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        orgId: 'org-123',
        stripeCustomerId: 'cus_ABC123',
        verifiedAt: new Date('2026-01-01'),
        accountAgeDays: 60,
        paymentCount: 2,
        hasActiveSubscription: true,
      });
    });

    it('should skip deleted customers', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-123',
        publicKey: 'pubkey-123',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2026-01-01'),
        uniqueNonce: 'nonce-123',
        stripeCustomerId: 'cus_DELETED',
      };

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([identity]);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_DELETED',
        deleted: true,
      });

      const result = await service.getRevenueVerifiedOrgs();

      expect(result).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-123',
        publicKey: 'pubkey-123',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2026-01-01'),
        uniqueNonce: 'nonce-123',
        stripeCustomerId: 'cus_ERROR',
      };

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([identity]);

      mockStripe.customers.retrieve.mockRejectedValue(new Error('API error'));

      const result = await service.getRevenueVerifiedOrgs();

      expect(result).toEqual([]);
    });

    it('should identify business-verified customers', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);

      const identity: OrganizationIdentity = {
        orgId: 'org-biz',
        publicKey: 'pubkey-biz',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2026-01-01'),
        uniqueNonce: 'nonce-biz',
        stripeCustomerId: 'cus_BIZ123',
      };

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([identity]);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_BIZ123',
        created: createdTimestamp,
        deleted: false,
        tax_ids: {
          data: [{ id: 'tax_123', type: 'us_ein', value: '12-3456789' }],
        },
      });

      mockStripe.paymentIntents.list.mockResolvedValue({ data: [] });
      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const result = await service.getRevenueVerifiedOrgs();

      expect(result[0].isBusinessVerified).toBe(true);
      expect(result[0].customerType).toBe('company');
    });
  });

  describe('getRevenueStats', () => {
    it('should return zero stats when no orgs', async () => {
      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([]);

      const stats = await service.getRevenueStats();

      expect(stats).toEqual({
        totalStripeVerifiedOrgs: 0,
        avgAccountAgeDays: 0,
        avgPaymentCount: 0,
        activeSubscriptionCount: 0,
        businessVerifiedCount: 0,
        individualCount: 0,
        companyCount: 0,
      });
    });

    it('should calculate statistics correctly', async () => {
      const createdTimestamp1 = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60); // 60 days
      const createdTimestamp2 = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60); // 90 days

      const identities: OrganizationIdentity[] = [
        {
          orgId: 'org-1',
          publicKey: 'pubkey-1',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-01'),
          uniqueNonce: 'nonce-1',
          stripeCustomerId: 'cus_1',
        },
        {
          orgId: 'org-2',
          publicKey: 'pubkey-2',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-02'),
          uniqueNonce: 'nonce-2',
          stripeCustomerId: 'cus_2',
        },
      ];

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue(identities);

      // Mock first customer
      mockStripe.customers.retrieve
        .mockResolvedValueOnce({
          id: 'cus_1',
          created: createdTimestamp1,
          deleted: false,
          name: 'Customer 1',
        })
        .mockResolvedValueOnce({
          id: 'cus_2',
          created: createdTimestamp2,
          deleted: false,
          tax_ids: { data: [{ id: 'tax_1' }] },
        });

      // Mock payments
      mockStripe.paymentIntents.list
        .mockResolvedValueOnce({
          data: [
            { id: 'pi_1', status: 'succeeded' },
            { id: 'pi_2', status: 'succeeded' },
          ],
        })
        .mockResolvedValueOnce({
          data: [{ id: 'pi_3', status: 'succeeded' }],
        });

      // Mock subscriptions
      mockStripe.subscriptions.list
        .mockResolvedValueOnce({
          data: [{ id: 'sub_1', status: 'active' }],
        })
        .mockResolvedValueOnce({
          data: [],
        });

      const stats = await service.getRevenueStats();

      expect(stats.totalStripeVerifiedOrgs).toBe(2);
      expect(stats.avgAccountAgeDays).toBe(75); // (60 + 90) / 2
      expect(stats.avgPaymentCount).toBe(1.5); // (2 + 1) / 2
      expect(stats.activeSubscriptionCount).toBe(1);
      expect(stats.businessVerifiedCount).toBe(1);
      expect(stats.individualCount).toBe(1);
      expect(stats.companyCount).toBe(1);
    });
  });

  describe('getActiveSubscribers', () => {
    it('should return orgs with active subscriptions', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      const identities: OrganizationIdentity[] = [
        {
          orgId: 'org-1',
          publicKey: 'pubkey-1',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-01'),
          uniqueNonce: 'nonce-1',
          stripeCustomerId: 'cus_1',
        },
        {
          orgId: 'org-2',
          publicKey: 'pubkey-2',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-02'),
          uniqueNonce: 'nonce-2',
          stripeCustomerId: 'cus_2',
        },
      ];

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue(identities);

      mockStripe.customers.retrieve
        .mockResolvedValueOnce({
          id: 'cus_1',
          created: createdTimestamp,
          deleted: false,
        })
        .mockResolvedValueOnce({
          id: 'cus_2',
          created: createdTimestamp,
          deleted: false,
        });

      mockStripe.paymentIntents.list.mockResolvedValue({ data: [] });

      // First customer has active subscription, second doesn't
      mockStripe.subscriptions.list
        .mockResolvedValueOnce({
          data: [{ id: 'sub_1', status: 'active' }],
        })
        .mockResolvedValueOnce({
          data: [],
        });

      const result = await service.getActiveSubscribers();

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org-1');
      expect(result[0].hasActiveSubscription).toBe(true);
    });

    it('should filter by product IDs when specified', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-1',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2026-01-01'),
        uniqueNonce: 'nonce-1',
        stripeCustomerId: 'cus_1',
      };

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue([identity]);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_1',
        created: createdTimestamp,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({ data: [] });

      mockStripe.subscriptions.list
        .mockResolvedValueOnce({
          data: [
            {
              id: 'sub_1',
              status: 'active',
              items: { data: [{ price: { product: 'prod_enterprise' } }] },
            },
          ],
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: 'sub_1',
              status: 'active',
              items: { data: [{ price: { product: 'prod_enterprise' } }] },
            },
          ],
        });

      const result = await service.getActiveSubscribers(['prod_enterprise']);

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org-1');
    });
  });

  describe('getHighValueOrgs', () => {
    it('should return orgs with payment count above threshold', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      const identities: OrganizationIdentity[] = [
        {
          orgId: 'org-high',
          publicKey: 'pubkey-high',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-01'),
          uniqueNonce: 'nonce-high',
          stripeCustomerId: 'cus_high',
        },
        {
          orgId: 'org-low',
          publicKey: 'pubkey-low',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-02'),
          uniqueNonce: 'nonce-low',
          stripeCustomerId: 'cus_low',
        },
      ];

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue(identities);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_test',
        created: createdTimestamp,
        deleted: false,
      });

      // First customer: 10 payments, Second customer: 2 payments
      mockStripe.paymentIntents.list
        .mockResolvedValueOnce({
          data: Array(10).fill({ status: 'succeeded' }),
        })
        .mockResolvedValueOnce({
          data: Array(2).fill({ status: 'succeeded' }),
        });

      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const result = await service.getHighValueOrgs(5);

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org-high');
      expect(result[0].paymentCount).toBe(10);
    });
  });

  describe('getOrgsByVerificationDate', () => {
    it('should filter orgs by verification date range', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      const identities: OrganizationIdentity[] = [
        {
          orgId: 'org-jan',
          publicKey: 'pubkey-jan',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-01-15'),
          uniqueNonce: 'nonce-jan',
          stripeCustomerId: 'cus_jan',
        },
        {
          orgId: 'org-feb',
          publicKey: 'pubkey-feb',
          verificationMethod: 'stripe_customer',
          verifiedAt: new Date('2026-02-15'),
          uniqueNonce: 'nonce-feb',
          stripeCustomerId: 'cus_feb',
        },
      ];

      mockIdentityStore.listStripeVerifiedIdentities.mockResolvedValue(identities);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_test',
        created: createdTimestamp,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({ data: [] });
      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const result = await service.getOrgsByVerificationDate(startDate, endDate);

      expect(result).toHaveLength(1);
      expect(result[0].orgId).toBe('org-jan');
    });
  });
});
