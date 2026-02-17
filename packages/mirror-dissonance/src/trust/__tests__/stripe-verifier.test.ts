/**
 * Unit tests for StripeVerifier
 *
 * Uses constructor dependency injection (stripeOverride) to supply
 * a mock Stripe instance instead of jest.mock, which does not
 * reliably intercept ESM imports in this project configuration.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

import { StripeVerifier, StripeVerificationError } from '../identity/stripe-verifier.js';

// Shared mock Stripe shape — fresh functions are created in beforeEach
let mockStripe: any;

/** Helper: create a StripeVerifier with the mock Stripe injected */
function createVerifier(
  apiKey = 'sk_test_123',
  config?: any
) {
  return new StripeVerifier(apiKey, config, mockStripe);
}

describe('StripeVerifier', () => {
  beforeEach(() => {
    mockStripe = {
      customers: {
        retrieve: jest.fn(),
      },
      paymentIntents: {
        list: jest.fn(),
      },
      subscriptions: {
        list: jest.fn(),
      },
      invoices: {
        list: jest.fn(),
      },
    };
  });

  describe('constructor', () => {
    it('should throw if API key is empty', () => {
      expect(() => new StripeVerifier('')).toThrow('Stripe API key is required');
    });

    it('should throw if API key is whitespace', () => {
      expect(() => new StripeVerifier('   ')).toThrow('Stripe API key is required');
    });

    it('should throw if API key is not a secret key', () => {
      expect(() => new StripeVerifier('pk_test_123')).toThrow('must be a secret key');
    });

    it('should accept valid secret key', () => {
      const verifier = createVerifier('sk_test_valid');
      expect(verifier).toBeDefined();
    });

    it('should accept custom config', () => {
      const verifier = createVerifier('sk_test_123', { minAgeDays: 7 });
      expect(verifier).toBeDefined();
    });
  });

  describe('verifyCustomer - success cases', () => {
    it('should verify legitimate customer with payment history', async () => {
      // Mock customer (created 60 days ago)
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_ABC123',
        email: 'test@example.com',
        name: 'Acme Corp',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      // Mock payment history (3 successful payments)
      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [
          { id: 'pi_1', status: 'succeeded' },
          { id: 'pi_2', status: 'succeeded' },
          { id: 'pi_3', status: 'succeeded' },
        ],
      });

      // Mock subscriptions (1 active)
      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: 'sub_123',
            status: 'active',
            items: {
              data: [
                { price: { product: 'prod_PhaseMirrorPro' } },
              ],
            },
          },
        ],
      });

      const verifier = createVerifier('sk_test_123', {
        minAgeDays: 30,
        minSuccessfulPayments: 1,
        requireActiveSubscription: false,
        rejectDelinquent: true,
        allowedCustomerTypes: ['individual', 'company'],
        requireVerifiedBusiness: false,
      });

      const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');

      expect(result.verified).toBe(true);
      expect(result.method).toBe('stripe_customer');
      expect(result.metadata.stripeCustomerId).toBe('cus_ABC123');
      expect(result.metadata.customerEmail).toBe('test@example.com');
      expect(result.metadata.successfulPaymentCount).toBe(3);
      expect(result.metadata.hasActiveSubscription).toBe(true);
      expect(result.metadata.isDelinquent).toBe(false);
      expect(result.verifiedAt).toBeInstanceOf(Date);
    });

    it('should verify customer without active subscription when not required', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_XYZ789',
        email: 'test@example.com',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      // No active subscriptions
      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-456', 'cus_XYZ789');

      expect(result.verified).toBe(true);
      expect(result.metadata.hasActiveSubscription).toBe(false);
    });

    it('should verify business customer with tax ID', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (90 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_BIZ123',
        email: 'billing@business.com',
        name: 'Business Inc',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
        tax_ids: {
          data: [{ id: 'tax_123', type: 'us_ein', value: '12-3456789' }],
        },
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-biz', 'cus_BIZ123');

      expect(result.verified).toBe(true);
      expect(result.metadata.customerType).toBe('company');
      expect(result.metadata.isBusinessVerified).toBe(true);
    });
  });

  describe('verifyCustomer - failure cases', () => {
    it('should reject customer that is too new', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60); // 15 days

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_NEW123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-new', 'cus_NEW123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('too new');
      expect(result.reason).toContain('15 days');
    });

    it('should reject delinquent customer', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_DEL123',
        created: createdTimestamp,
        delinquent: true, // Has unpaid invoices
        deleted: false,
      });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-delinquent', 'cus_DEL123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('delinquent');
      expect(result.metadata.isDelinquent).toBe(true);
    });

    it('should reject customer with insufficient payment history', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_NOPAY123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      // No successful payments
      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [
          { id: 'pi_1', status: 'canceled' },
          { id: 'pi_2', status: 'requires_payment_method' },
        ],
      });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-nopay', 'cus_NOPAY123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient payment history');
      expect(result.reason).toContain('0 payments');
    });

    it('should reject customer without subscription when required', async () => {
      const verifier = createVerifier('sk_test_123', {
        minAgeDays: 30,
        minSuccessfulPayments: 1,
        requireActiveSubscription: true, // Strict requirement
        rejectDelinquent: true,
        allowedCustomerTypes: ['individual', 'company'],
        requireVerifiedBusiness: false,
      });

      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_NOSUB123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const result = await verifier.verifyCustomer('org-nosub', 'cus_NOSUB123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No active subscription');
    });

    it('should handle customer not found', async () => {
      const error: any = new Error('No such customer: cus_404');
      error.type = 'StripeInvalidRequestError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-404', 'cus_404');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should throw on invalid customer ID format', async () => {
      const verifier = createVerifier();

      await expect(
        verifier.verifyCustomer('org-invalid', 'invalid_id')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-invalid', 'invalid_id')
      ).rejects.toThrow('must start with');
    });

    it('should throw on rate limit error', async () => {
      const error: any = new Error('Too many requests');
      error.type = 'StripeRateLimitError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      const verifier = createVerifier();

      await expect(
        verifier.verifyCustomer('org-rate', 'cus_RATE123')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-rate', 'cus_RATE123')
      ).rejects.toThrow('rate limit');
    });

    it('should throw on invalid API key', async () => {
      const error: any = new Error('Invalid API Key');
      error.type = 'StripeAuthenticationError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      const verifier = createVerifier();

      await expect(
        verifier.verifyCustomer('org-auth', 'cus_AUTH123')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-auth', 'cus_AUTH123')
      ).rejects.toThrow('Invalid Stripe API key');
    });
  });

  describe('verifyCustomerWithSubscription', () => {
    it('should verify customer with required product subscription', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_SUB123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: 'sub_123',
            status: 'active',
            items: {
              data: [{ price: { product: 'prod_PhaseMirrorEnterprise' } }],
            },
          },
        ],
      });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomerWithSubscription(
        'org-sub',
        'cus_SUB123',
        ['prod_PhaseMirrorEnterprise']
      );

      expect(result.verified).toBe(true);
      expect(result.metadata.subscriptionProductIds).toContain('prod_PhaseMirrorEnterprise');
    });

    it('should reject customer without required product', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_WRONG123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      mockStripe.subscriptions.list.mockResolvedValue({
        data: [
          {
            id: 'sub_123',
            status: 'active',
            items: {
              data: [{ price: { product: 'prod_PhaseMirrorBasic' } }],
            },
          },
        ],
      });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomerWithSubscription(
        'org-wrong',
        'cus_WRONG123',
        ['prod_PhaseMirrorEnterprise']
      );

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('does not have subscription to required products');
    });
  });

  describe('hasDelinquentInvoices', () => {
    it('should return true for customer with past due invoices', async () => {
      const pastDue = Math.floor(Date.now() / 1000) - 10000; // Past due

      mockStripe.invoices.list.mockResolvedValue({
        data: [
          {
            id: 'in_123',
            status: 'open',
            due_date: pastDue,
          },
        ],
      });

      const verifier = createVerifier();
      const result = await verifier.hasDelinquentInvoices('cus_DEL123');

      expect(result).toBe(true);
    });

    it('should return false for customer with no past due invoices', async () => {
      const futureDate = Math.floor(Date.now() / 1000) + 86400; // Due tomorrow

      mockStripe.invoices.list.mockResolvedValue({
        data: [
          {
            id: 'in_123',
            status: 'open',
            due_date: futureDate,
          },
        ],
      });

      const verifier = createVerifier();
      const result = await verifier.hasDelinquentInvoices('cus_GOOD123');

      expect(result).toBe(false);
    });

    it('should throw on API error (fail-closed per ADR-030)', async () => {
      mockStripe.invoices.list.mockRejectedValue(new Error('API error'));

      const verifier = createVerifier();

      await expect(
        verifier.hasDelinquentInvoices('cus_ERROR123')
      ).rejects.toThrow('Unable to check delinquent invoices');
    });
  });

  describe('edge cases', () => {
    it('should handle deleted customer', async () => {
      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_DELETED',
        deleted: true,
      });

      const verifier = createVerifier();

      await expect(
        verifier.verifyCustomer('org-deleted', 'cus_DELETED')
      ).rejects.toThrow('has been deleted');
    });

    it('should handle customer with no email or name', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_ANON123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
        // No email or name
      });

      mockStripe.paymentIntents.list.mockResolvedValue({
        data: [{ id: 'pi_1', status: 'succeeded' }],
      });

      mockStripe.subscriptions.list.mockResolvedValue({ data: [] });

      const verifier = createVerifier();
      const result = await verifier.verifyCustomer('org-anon', 'cus_ANON123');

      expect(result.verified).toBe(true);
      expect(result.metadata.customerEmail).toBeUndefined();
      expect(result.metadata.customerName).toBeUndefined();
    });

    it('should throw on payment API error (fail-closed per ADR-030)', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_EMPTY123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      // API error when fetching payments — should now throw, not return 0
      mockStripe.paymentIntents.list.mockRejectedValue(new Error('API error'));

      const verifier = createVerifier();

      await expect(
        verifier.verifyCustomer('org-empty', 'cus_EMPTY123')
      ).rejects.toThrow('Unable to count payments');
    });
  });
});
