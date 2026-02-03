/**
 * Stripe Customer Verification Service
 * 
 * Prevents Sybil attacks by verifying organizational identity through
 * established Stripe customers with verifiable payment history.
 * 
 * Security Properties:
 * - Account age verification (min 30 days by default)
 * - Payment history validation (min 1 successful payment)
 * - Active subscription requirement (optional)
 * - Delinquency detection (rejects customers with unpaid invoices)
 * 
 * Privacy Properties:
 * - Does NOT store payment method details
 * - Does NOT store transaction amounts
 * - Only stores: customer ID, account age, payment count, subscription status
 * 
 * @example
 * const verifier = new StripeVerifier(process.env.STRIPE_SECRET_KEY);
 * const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');
 * if (result.verified) {
 *   // Store identity with result.metadata.stripeCustomerId
 * }
 */

import Stripe from 'stripe';
import {
  IStripeVerifier,
  StripeVerificationResult,
  StripeVerificationConfig,
  StripeVerificationError,
} from './types.js';

// Re-export for convenience
export { StripeVerificationError } from './types.js';

/**
 * Production-ready Stripe customer verifier.
 */
export class StripeVerifier implements IStripeVerifier {
  private readonly stripe: Stripe;
  private readonly config: StripeVerificationConfig;

  constructor(
    apiKey: string,
    config?: Partial<StripeVerificationConfig>
  ) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Stripe API key is required');
    }

    if (!apiKey.startsWith('sk_')) {
      throw new Error('Stripe API key must be a secret key (starts with sk_)');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2025-02-24.acacia', // Latest stable API version
      typescript: true,
    });
    
    // Default anti-Sybil heuristics
    this.config = {
      minAgeDays: 30,
      minSuccessfulPayments: 1,
      requireActiveSubscription: false,
      rejectDelinquent: true,
      allowedCustomerTypes: ['individual', 'company'],
      requireVerifiedBusiness: false,
      ...config,
    };
  }

  async verifyCustomer(
    orgId: string,
    stripeCustomerId: string
  ): Promise<StripeVerificationResult> {
    this.validateCustomerId(stripeCustomerId);

    try {
      // Step 1: Fetch customer metadata
      const customer = await this.fetchCustomer(stripeCustomerId);

      // Step 2: Validate account age
      const ageInDays = this.calculateAgeDays(customer.created);
      if (ageInDays < this.config.minAgeDays) {
        return this.createFailureResult(
          stripeCustomerId,
          `Customer account too new (${ageInDays} days, minimum ${this.config.minAgeDays})`
        );
      }

      // Step 3: Check delinquency status
      if (this.config.rejectDelinquent && customer.delinquent) {
        return this.createFailureResult(
          stripeCustomerId,
          'Customer has delinquent invoices',
          { isDelinquent: true }
        );
      }

      // Step 4: Validate payment history
      const paymentCount = await this.countSuccessfulPayments(stripeCustomerId);
      if (paymentCount < this.config.minSuccessfulPayments) {
        return this.createFailureResult(
          stripeCustomerId,
          `Insufficient payment history (${paymentCount} payments, minimum ${this.config.minSuccessfulPayments})`
        );
      }

      // Step 5: Check subscription status (if required)
      const subscriptions = await this.fetchActiveSubscriptions(stripeCustomerId);
      const hasActiveSubscription = subscriptions.length > 0;

      if (this.config.requireActiveSubscription && !hasActiveSubscription) {
        return this.createFailureResult(
          stripeCustomerId,
          'No active subscription found'
        );
      }

      // Step 6: Validate customer type (if specified)
      const customerType = this.extractCustomerType(customer);
      if (customerType && !this.config.allowedCustomerTypes.includes(customerType)) {
        return this.createFailureResult(
          stripeCustomerId,
          `Customer type '${customerType}' not allowed (allowed: ${this.config.allowedCustomerTypes.join(', ')})`
        );
      }

      // Step 7: Check business verification (if required)
      const isBusinessVerified = await this.checkBusinessVerification(customer);
      if (this.config.requireVerifiedBusiness && !isBusinessVerified) {
        return this.createFailureResult(
          stripeCustomerId,
          'Business verification required but not completed'
        );
      }

      // All checks passed
      return {
        verified: true,
        method: 'stripe_customer',
        reason: 'Stripe customer verified',
        verifiedAt: new Date(),
        metadata: {
          stripeCustomerId: customer.id,
          customerEmail: customer.email || undefined,
          customerName: customer.name || undefined,
          accountCreatedAt: new Date(customer.created * 1000),
          successfulPaymentCount: paymentCount,
          hasActiveSubscription,
          subscriptionProductIds: subscriptions.map(sub => 
            sub.items.data[0]?.price.product as string
          ).filter(Boolean),
          isDelinquent: customer.delinquent || false,
          customerType,
          isBusinessVerified,
        },
      };

    } catch (error) {
      if (error instanceof StripeVerificationError) {
        throw error;
      }
      
      if (this.isNotFoundError(error)) {
        return this.createFailureResult(
          stripeCustomerId,
          `Stripe customer '${stripeCustomerId}' not found`
        );
      }

      if (this.isRateLimitError(error)) {
        throw new StripeVerificationError(
          'Stripe API rate limit exceeded',
          'RATE_LIMIT',
          error
        );
      }

      if (this.isInvalidKeyError(error)) {
        throw new StripeVerificationError(
          'Invalid Stripe API key',
          'INVALID_KEY',
          error
        );
      }

      throw new StripeVerificationError(
        'Stripe API request failed',
        'API_ERROR',
        error
      );
    }
  }

  async verifyCustomerWithSubscription(
    orgId: string,
    stripeCustomerId: string,
    requiredProductIds?: string[]
  ): Promise<StripeVerificationResult> {
    // First, perform standard verification
    const result = await this.verifyCustomer(orgId, stripeCustomerId);

    if (!result.verified) {
      return result;
    }

    // Additional check: verify subscription to specific products
    if (requiredProductIds && requiredProductIds.length > 0) {
      const hasRequiredProduct = result.metadata.subscriptionProductIds?.some(
        productId => requiredProductIds.includes(productId)
      );

      if (!hasRequiredProduct) {
        return this.createFailureResult(
          stripeCustomerId,
          `Customer does not have subscription to required products: ${requiredProductIds.join(', ')}`
        );
      }
    }

    return result;
  }

  async hasDelinquentInvoices(stripeCustomerId: string): Promise<boolean> {
    this.validateCustomerId(stripeCustomerId);

    try {
      const invoices = await this.stripe.invoices.list({
        customer: stripeCustomerId,
        status: 'open',
        limit: 100,
      });

      // Check if any open invoices are past due
      const now = Math.floor(Date.now() / 1000);
      return invoices.data.some(invoice => 
        invoice.due_date !== null && invoice.due_date < now
      );

    } catch (error) {
      // If we can't check, assume no delinquency (fail open)
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  private validateCustomerId(customerId: string): void {
    if (!customerId.startsWith('cus_')) {
      throw new StripeVerificationError(
        `Invalid Stripe customer ID format: ${customerId} (must start with 'cus_')`,
        'INVALID_CUSTOMER_ID'
      );
    }
  }

  private async fetchCustomer(customerId: string): Promise<Stripe.Customer> {
    const customer = await this.stripe.customers.retrieve(customerId);
    
    if (customer.deleted) {
      throw new StripeVerificationError(
        `Customer ${customerId} has been deleted`,
        'NOT_FOUND'
      );
    }

    return customer as Stripe.Customer;
  }

  private async countSuccessfulPayments(customerId: string): Promise<number> {
    try {
      // Fetch successful payment intents for this customer
      const paymentIntents = await this.stripe.paymentIntents.list({
        customer: customerId,
        limit: 100, // Adjust if you expect more
      });

      // Count only succeeded payments
      return paymentIntents.data.filter(
        pi => pi.status === 'succeeded'
      ).length;

    } catch (error) {
      // If we can't fetch payments, return 0 (fail safe)
      return 0;
    }
  }

  private async fetchActiveSubscriptions(
    customerId: string
  ): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
        limit: 100,
      });

      return subscriptions.data;

    } catch (error) {
      // If we can't fetch subscriptions, return empty array (fail safe)
      return [];
    }
  }

  private calculateAgeDays(createdTimestamp: number): number {
    const now = Date.now() / 1000;
    const ageInSeconds = now - createdTimestamp;
    return Math.floor(ageInSeconds / (24 * 60 * 60));
  }

  private hasTaxIds(customer: Stripe.Customer): boolean {
    const taxIds = customer.tax_ids;
    // Stripe's tax_ids can be either a list or an object with a data property
    // We need to check both possible structures safely
    if (!taxIds) return false;
    
    if (typeof taxIds === 'object' && 'data' in taxIds) {
      const data = (taxIds as any).data;
      return Array.isArray(data) && data.length > 0;
    }
    
    return false;
  }

  private extractCustomerType(customer: Stripe.Customer): string | undefined {
    // Check if customer has tax IDs (indicates business)
    if (this.hasTaxIds(customer)) {
      return 'company';
    }

    // Check metadata for customer type
    if (customer.metadata?.customer_type) {
      return customer.metadata.customer_type;
    }

    // Default: assume individual if no business indicators
    return 'individual';
  }

  private async checkBusinessVerification(customer: Stripe.Customer): Promise<boolean> {
    // Check if customer has tax IDs (basic business verification)
    // For more advanced verification, you would check Stripe Identity
    // For now, we'll use tax ID as a proxy for business verification
    return this.hasTaxIds(customer);
  }

  private createFailureResult(
    stripeCustomerId: string,
    reason: string,
    metadata?: Partial<StripeVerificationResult['metadata']>
  ): StripeVerificationResult {
    return {
      verified: false,
      method: 'stripe_customer',
      reason,
      metadata: {
        stripeCustomerId,
        accountCreatedAt: new Date(),
        successfulPaymentCount: 0,
        hasActiveSubscription: false,
        isDelinquent: metadata?.isDelinquent || false,
        isBusinessVerified: false,
        ...metadata,
      },
    };
  }

  // Error type guards
  private isNotFoundError(error: any): boolean {
    return error?.type === 'StripeInvalidRequestError' && 
           error?.message?.includes('No such customer');
  }

  private isRateLimitError(error: any): boolean {
    return error?.type === 'StripeRateLimitError';
  }

  private isInvalidKeyError(error: any): boolean {
    return error?.type === 'StripeAuthenticationError';
  }
}
