/**
 * Revenue Tracking Service
 * 
 * Optional service for tracking revenue-verified organizations.
 * Provides analytics on revenue-generating organizations in the
 * trust network, helping identify high-value contributors.
 * 
 * This is an optional feature for operators who want to:
 * - Analyze contribution patterns from paying customers
 * - Identify high-value organizations for support prioritization
 * - Track revenue verification trends over time
 * - Generate reports on Stripe-verified organizations
 */

import Stripe from 'stripe';
import { IIdentityStoreAdapter } from '../adapters/types.js';
import { OrganizationIdentity } from './types.js';

/**
 * Statistics about revenue-verified organizations.
 */
export interface RevenueStats {
  totalStripeVerifiedOrgs: number;
  avgAccountAgeDays: number;
  avgPaymentCount: number;
  activeSubscriptionCount: number;
  businessVerifiedCount: number;
  individualCount: number;
  companyCount: number;
}

/**
 * Detailed information about a revenue-verified organization.
 */
export interface RevenueVerifiedOrg {
  orgId: string;
  stripeCustomerId: string;
  verifiedAt: Date;
  accountAgeDays: number;
  paymentCount: number;
  hasActiveSubscription: boolean;
  isBusinessVerified: boolean;
  customerType?: string;
}

/**
 * Revenue tracking service for Stripe-verified organizations.
 * 
 * Provides analytics on revenue-generating organizations in the
 * trust network, helping identify high-value contributors.
 * 
 * @example
 * const tracker = new RevenueTrackingService(identityStore, stripe);
 * const stats = await tracker.getRevenueStats();
 * console.log(`${stats.totalStripeVerifiedOrgs} Stripe-verified orgs`);
 * console.log(`Avg payment count: ${stats.avgPaymentCount}`);
 */
export class RevenueTrackingService {
  constructor(
    private readonly identityStore: IIdentityStoreAdapter,
    private readonly stripe: Stripe
  ) {}

  /**
   * Get all revenue-verified organizations.
   * 
   * @returns Array of organizations verified via Stripe
   */
  async getRevenueVerifiedOrgs(): Promise<RevenueVerifiedOrg[]> {
    const identities = await this.identityStore.listStripeVerifiedIdentities();
    
    const orgs: RevenueVerifiedOrg[] = [];
    
    for (const identity of identities) {
      if (!identity.stripeCustomerId) {
        continue; // Skip non-Stripe verified identities
      }

      try {
        // Fetch fresh customer data from Stripe for analytics
        const customer = await this.stripe.customers.retrieve(identity.stripeCustomerId);
        
        if (customer.deleted) {
          continue; // Skip deleted customers
        }

        const typedCustomer = customer as Stripe.Customer;
        const accountAgeDays = this.calculateAgeDays(typedCustomer.created);
        
        // Get payment count
        const paymentCount = await this.getPaymentCount(identity.stripeCustomerId);
        
        // Get subscription status
        const subscriptions = await this.stripe.subscriptions.list({
          customer: identity.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        const hasActiveSubscription = subscriptions.data.length > 0;
        
        // Determine customer type and business verification
        const customerType = this.extractCustomerType(typedCustomer);
        const isBusinessVerified = this.hasBusinessVerification(typedCustomer);

        orgs.push({
          orgId: identity.orgId,
          stripeCustomerId: identity.stripeCustomerId,
          verifiedAt: identity.verifiedAt,
          accountAgeDays,
          paymentCount,
          hasActiveSubscription,
          isBusinessVerified,
          customerType,
        });
      } catch (error) {
        // Skip customers that can't be fetched (deleted, API error, etc.)
        console.warn(`Failed to fetch customer ${identity.stripeCustomerId}:`, error);
        continue;
      }
    }

    return orgs;
  }

  /**
   * Get aggregated statistics about revenue-verified organizations.
   * 
   * @returns Statistics including counts, averages, and distribution
   */
  async getRevenueStats(): Promise<RevenueStats> {
    const orgs = await this.getRevenueVerifiedOrgs();
    
    if (orgs.length === 0) {
      return {
        totalStripeVerifiedOrgs: 0,
        avgAccountAgeDays: 0,
        avgPaymentCount: 0,
        activeSubscriptionCount: 0,
        businessVerifiedCount: 0,
        individualCount: 0,
        companyCount: 0,
      };
    }

    const totalAgeDays = orgs.reduce((sum, org) => sum + org.accountAgeDays, 0);
    const totalPayments = orgs.reduce((sum, org) => sum + org.paymentCount, 0);
    const activeSubscriptions = orgs.filter(org => org.hasActiveSubscription).length;
    const businessVerified = orgs.filter(org => org.isBusinessVerified).length;
    const individuals = orgs.filter(org => org.customerType === 'individual').length;
    const companies = orgs.filter(org => org.customerType === 'company').length;

    return {
      totalStripeVerifiedOrgs: orgs.length,
      avgAccountAgeDays: Math.round(totalAgeDays / orgs.length),
      avgPaymentCount: Math.round((totalPayments / orgs.length) * 10) / 10, // Round to 1 decimal
      activeSubscriptionCount: activeSubscriptions,
      businessVerifiedCount: businessVerified,
      individualCount: individuals,
      companyCount: companies,
    };
  }

  /**
   * Get organizations with active subscriptions.
   * 
   * @param productIds Optional filter by specific product IDs
   * @returns Organizations with active subscriptions
   */
  async getActiveSubscribers(productIds?: string[]): Promise<RevenueVerifiedOrg[]> {
    const orgs = await this.getRevenueVerifiedOrgs();
    
    if (!productIds || productIds.length === 0) {
      return orgs.filter(org => org.hasActiveSubscription);
    }

    // If specific products requested, need to check subscription details
    const filtered: RevenueVerifiedOrg[] = [];
    
    for (const org of orgs) {
      if (!org.hasActiveSubscription) {
        continue;
      }

      try {
        const subscriptions = await this.stripe.subscriptions.list({
          customer: org.stripeCustomerId,
          status: 'active',
          limit: 100,
        });

        const hasRequiredProduct = subscriptions.data.some(sub => {
          const products = sub.items.data.map(item => item.price.product as string);
          return products.some(p => productIds.includes(p));
        });

        if (hasRequiredProduct) {
          filtered.push(org);
        }
      } catch (error) {
        console.warn(`Failed to check subscriptions for ${org.stripeCustomerId}:`, error);
        continue;
      }
    }

    return filtered;
  }

  /**
   * Get high-value organizations based on payment history.
   * 
   * @param minPayments Minimum number of successful payments (default: 5)
   * @returns Organizations with at least minPayments successful payments
   */
  async getHighValueOrgs(minPayments: number = 5): Promise<RevenueVerifiedOrg[]> {
    const orgs = await this.getRevenueVerifiedOrgs();
    return orgs.filter(org => org.paymentCount >= minPayments);
  }

  /**
   * Get organizations verified within a specific time period.
   * 
   * @param startDate Start of time period
   * @param endDate End of time period (default: now)
   * @returns Organizations verified within the period
   */
  async getOrgsByVerificationDate(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<RevenueVerifiedOrg[]> {
    const orgs = await this.getRevenueVerifiedOrgs();
    
    return orgs.filter(org => {
      const verifiedAt = org.verifiedAt;
      return verifiedAt >= startDate && verifiedAt <= endDate;
    });
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  private async getPaymentCount(customerId: string): Promise<number> {
    try {
      const paymentIntents = await this.stripe.paymentIntents.list({
        customer: customerId,
        limit: 100, // For most customers, 100 is sufficient
      });

      return paymentIntents.data.filter(pi => pi.status === 'succeeded').length;
    } catch (error) {
      return 0; // Return 0 if we can't fetch payments
    }
  }

  private calculateAgeDays(createdTimestamp: number): number {
    const created = new Date(createdTimestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private extractCustomerType(customer: Stripe.Customer): string | undefined {
    // Check metadata first
    if (customer.metadata?.customer_type) {
      return customer.metadata.customer_type;
    }

    // Infer from tax IDs
    if (customer.tax_ids && 
        typeof customer.tax_ids === 'object' && 
        'data' in customer.tax_ids && 
        Array.isArray(customer.tax_ids.data) && 
        customer.tax_ids.data.length > 0) {
      return 'company';
    }

    // Default to individual if name exists
    if (customer.name) {
      return 'individual';
    }

    return undefined;
  }

  private hasBusinessVerification(customer: Stripe.Customer): boolean {
    // Check metadata flag
    if (customer.metadata?.business_verified === 'true') {
      return true;
    }

    // Check for tax IDs (basic business verification)
    if (customer.tax_ids && 
        typeof customer.tax_ids === 'object' && 
        'data' in customer.tax_ids && 
        Array.isArray(customer.tax_ids.data) && 
        customer.tax_ids.data.length > 0) {
      return true;
    }

    return false;
  }
}
