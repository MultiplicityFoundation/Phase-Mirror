<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Stripe Customer Verification Blueprint for Phase Mirror Trust Module

**Priority**: P1 (Critical Path - Identity Layer Foundation)
**Interface**: `IStripeVerifier` in `trust/identity/stripe-verifier.ts`
**Target**: Production-ready Sybil attack prevention via Stripe customer verification

***

## Executive Summary

This blueprint provides step-by-step implementation instructions for Stripe customer verification in Phase Mirror's Trust Module. The verifier prevents Sybil attacks by binding organizational identities to established Stripe customers with verifiable payment history, ensuring only legitimate paying organizations can contribute to the false positive calibration network while maintaining k-anonymity.

***

## Architecture Context

### Why Stripe Customer Verification?

Phase Mirror's network effect creates a **Sybil attack surface** where malicious actors could create multiple fake organization identities to bypass k-anonymity thresholds. Stripe customers provide:

1. **Economic Commitment**: Payment history demonstrates real business operations
2. **Identity Verification**: Stripe's KYC/KYB processes verify business legitimacy
3. **Cost Barrier**: Creating multiple Stripe accounts with payment history is expensive and detectable
4. **Historical Proof**: Account age and transaction volume distinguish real businesses from shells
5. **API Access**: Stripe's REST API provides programmatic verification
6. **Revenue Alignment**: Organizations already paying for Phase Mirror services have aligned incentives

### Trust Module Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                    Trust Module Flow - Stripe                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Org purchases Phase Mirror subscription                     │
│     ↓                                                            │
│  2. StripeVerifier.verifyCustomer(orgId, stripeCustomerId)      │
│     ↓                                                            │
│  3. Fetch Stripe customer metadata via API                       │
│     ↓                                                            │
│  4. Validate age, payment history, subscription status           │
│     ↓                                                            │
│  5. Return VerificationResult { verified, reason, metadata }     │
│     ↓                                                            │
│  6. If verified → NonceBindingService.bindNonce(orgId)          │
│     ↓                                                            │
│  7. Store OrganizationIdentity with stripeCustomerId             │
│     ↓                                                            │
│  8. Org can contribute with verified identity + economic stake   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```


### Comparison: Stripe vs. GitHub Verification

| Dimension | GitHub Org | Stripe Customer | Rationale |
| :-- | :-- | :-- | :-- |
| **Trust Signal** | Social proof (members, repos, activity) | Economic proof (payments, subscriptions) | Complementary signals; attackers unlikely to fake both |
| **Cost Barrier** | Time investment (90d age, build history) | Direct cost (payment required) | Stripe has immediate financial barrier |
| **Sybil Resistance** | Medium (can create fake orgs over time) | High (requires unique payment methods) | Payment processors detect duplicate accounts |
| **Privacy** | Public org metadata exposed | Private financial data (sensitive) | Stripe requires more careful handling |
| **Revenue Alignment** | No direct revenue connection | Direct revenue (paying customers) | Stripe-verified orgs are revenue-generating |
| **Verification Speed** | Instant (API query) | Instant (API query) | Both real-time |
| **False Negative Risk** | OSS projects without large orgs | Nonprofits, academia without Stripe | Need multi-method verification |


***

## Phase 1: Core Implementation

### File: `trust/identity/stripe-verifier.ts`

**Current State** (Stub):

```typescript
export interface IStripeVerifier {
  verifyCustomer(orgId: string, stripeCustomerId: string): Promise<VerificationResult>;
}

export class StripeVerifier implements IStripeVerifier {
  constructor(private readonly apiKey: string) {}
  
  async verifyCustomer(orgId: string, stripeCustomerId: string): Promise<VerificationResult> {
    // TODO: Implementation
    throw new Error('Not implemented');
  }
}
```

**Target Implementation**:

```typescript
import Stripe from 'stripe';
import { VerificationResult, VerificationMethod } from './types';

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
export interface IStripeVerifier {
  /**
   * Verify an organization's identity via Stripe customer account.
   * 
   * @param orgId - Phase Mirror organization ID (internal)
   * @param stripeCustomerId - Stripe customer ID (e.g., 'cus_ABC123')
   * @returns VerificationResult with verification status and metadata
   * 
   * @throws {StripeVerificationError} if API request fails
   * @throws {StripeVerificationError} if customer ID format invalid
   */
  verifyCustomer(
    orgId: string, 
    stripeCustomerId: string
  ): Promise<VerificationResult>;

  /**
   * Verify a customer and require active subscription.
   * 
   * @param orgId - Phase Mirror organization ID
   * @param stripeCustomerId - Stripe customer ID
   * @param requiredProductIds - Optional list of product IDs to check for
   * @returns VerificationResult with subscription details
   */
  verifyCustomerWithSubscription(
    orgId: string,
    stripeCustomerId: string,
    requiredProductIds?: string[]
  ): Promise<VerificationResult>;

  /**
   * Check if a customer has any delinquent invoices.
   * 
   * @param stripeCustomerId - Stripe customer ID
   * @returns True if customer has unpaid invoices
   */
  hasDelinquentInvoices(stripeCustomerId: string): Promise<boolean>;
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
export interface StripeVerificationResult extends VerificationResult {
  verificationMethod: 'stripe_customer';
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
      apiVersion: '2024-12-18.acacia', // Latest stable API version
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
        verificationMethod: 'stripe_customer',
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
            sub.items.data[^0]?.price.product as string
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
      return [];
    }
  }

  private extractCustomerType(customer: Stripe.Customer): string | undefined {
    // Stripe doesn't have a built-in "type" field, but you can use metadata
    // or infer from tax_id_data
    if (customer.metadata?.customer_type) {
      return customer.metadata.customer_type;
    }

    // Heuristic: if tax ID exists, assume company
    if (customer.tax_ids && customer.tax_ids.data.length > 0) {
      return 'company';
    }

    // Default to individual if name exists but no tax ID
    if (customer.name) {
      return 'individual';
    }

    return undefined;
  }

  private async checkBusinessVerification(
    customer: Stripe.Customer
  ): Promise<boolean> {
    // Stripe Identity verification status
    // This is a placeholder - actual implementation depends on your Stripe Identity setup
    
    // Option 1: Check metadata flag
    if (customer.metadata?.business_verified === 'true') {
      return true;
    }

    // Option 2: Check for tax ID (basic business verification)
    if (customer.tax_ids && customer.tax_ids.data.length > 0) {
      return true;
    }

    // Option 3: Check Stripe Identity verification sessions (advanced)
    // This would require additional API calls to fetch verification sessions
    // For now, we'll use a simple heuristic

    return false;
  }

  private calculateAgeDays(createdTimestamp: number): number {
    const created = new Date(createdTimestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  private createFailureResult(
    stripeCustomerId: string,
    reason: string,
    overrides?: Partial<StripeVerificationResult['metadata']>
  ): StripeVerificationResult {
    return {
      verified: false,
      verificationMethod: 'stripe_customer',
      reason,
      verifiedAt: undefined,
      metadata: {
        stripeCustomerId,
        accountCreatedAt: new Date(0),
        successfulPaymentCount: 0,
        hasActiveSubscription: false,
        isDelinquent: false,
        isBusinessVerified: false,
        ...overrides,
      },
    };
  }

  private isNotFoundError(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeError &&
      error.type === 'StripeInvalidRequestError' &&
      error.message.includes('No such customer')
    );
  }

  private isRateLimitError(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeError &&
      error.type === 'StripeRateLimitError'
    );
  }

  private isInvalidKeyError(error: unknown): boolean {
    return (
      error instanceof Stripe.errors.StripeError &&
      error.type === 'StripeAuthenticationError'
    );
  }
}
```


***

## Phase 2: Type Definitions

### File: `trust/identity/types.ts` (Additions)

Add Stripe-specific types to existing file:

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
// NEW: Stripe-specific extensions
// ═══════════════════════════════════════════════════════════

/**
 * Stripe customer metadata captured during verification.
 * Used to assess organization legitimacy and prevent Sybil attacks.
 * 
 * Privacy Note: Does NOT include payment method details, amounts, or PII
 * beyond what's necessary for identity verification.
 */
export interface StripeCustomerMetadata {
  /** Stripe's customer ID (immutable) */
  stripeCustomerId: string;
  
  /** Customer email (optional, may be redacted for privacy) */
  customerEmail?: string;
  
  /** Customer name (optional, may be redacted) */
  customerName?: string;
  
  /** Account creation timestamp (for age verification) */
  accountCreatedAt: Date;
  
  /** Number of successful payments (any amount) */
  successfulPaymentCount: number;
  
  /** Whether customer has at least one active subscription */
  hasActiveSubscription: boolean;
  
  /** Product IDs of active subscriptions */
  subscriptionProductIds?: string[];
  
  /** Whether customer has unpaid invoices */
  isDelinquent: boolean;
  
  /** Customer type ('individual', 'company', etc.) */
  customerType?: string;
  
  /** Whether business identity has been verified via Stripe Identity */
  isBusinessVerified: boolean;
}

/**
 * Verification result specifically for Stripe customer verification.
 */
export interface StripeVerificationResult extends VerificationResult {
  verificationMethod: 'stripe_customer';
  metadata: StripeCustomerMetadata;
}

/**
 * Subscription requirement for verification.
 * Used to require specific Phase Mirror product subscriptions.
 */
export interface SubscriptionRequirement {
  /** Product IDs that satisfy the requirement */
  allowedProductIds: string[];
  
  /** Whether subscription must be active (vs. trialing or past_due) */
  requireActive: boolean;
  
  /** Minimum subscription duration in days (optional) */
  minDurationDays?: number;
}
```


***

## Phase 3: Storage Integration

### File: `trust/adapters/types.ts` (Additions)

Extend identity store interface to support Stripe metadata queries:

```typescript
export interface IIdentityStore {
  // Existing methods
  storeIdentity(identity: OrganizationIdentity): Promise<void>;
  getIdentity(orgId: string): Promise<OrganizationIdentity | null>;
  getIdentityByGitHubOrgId(githubOrgId: number): Promise<OrganizationIdentity | null>;
  listGitHubVerifiedIdentities(): Promise<OrganizationIdentity[]>;
  
  // NEW: Query by Stripe customer ID
  /**
   * Find identity by Stripe customer ID.
   * Prevents duplicate verifications for same Stripe customer.
   */
  getIdentityByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationIdentity | null>;
  
  // NEW: List all Stripe-verified identities
  /**
   * Retrieve all identities verified via Stripe.
   * Used for revenue analysis and anti-fraud auditing.
   */
  listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]>;
}
```


### File: `trust/adapters/local/identity-store.ts` (Updates)

Implement new query methods:

```typescript
export class LocalIdentityStore implements IIdentityStore {
  // ... existing constructor and methods ...

  async getIdentityByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<OrganizationIdentity | null> {
    const identities = await this.loadIdentities();
    return identities.find(id => id.stripeCustomerId === stripeCustomerId) || null;
  }

  async listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]> {
    const identities = await this.loadIdentities();
    return identities.filter(id => id.verificationMethod === 'stripe_customer');
  }
}
```


***

## Phase 4: Integration with Verification Service

### File: `trust/identity/verification-service.ts` (Updates)

Add Stripe verification method to existing service:

```typescript
import { IStripeVerifier, StripeVerifier } from './stripe-verifier';

export interface VerificationServiceConfig {
  githubToken?: string;
  stripeApiKey?: string; // NEW
  allowedMethods: VerificationMethod[];
}

export class VerificationService {
  private readonly githubVerifier?: IGitHubVerifier;
  private readonly stripeVerifier?: IStripeVerifier; // NEW
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

    // Initialize GitHub verifier (existing)
    if (config.githubToken && config.allowedMethods.includes('github_org')) {
      this.githubVerifier = new GitHubVerifier(config.githubToken);
    }

    // NEW: Initialize Stripe verifier
    if (config.stripeApiKey && config.allowedMethods.includes('stripe_customer')) {
      this.stripeVerifier = new StripeVerifier(config.stripeApiKey);
    }
  }

  // Existing verifyViaGitHub method...

  /**
   * Verify organization via Stripe customer and bind nonce.
   * 
   * @param orgId - Internal org ID
   * @param stripeCustomerId - Stripe customer ID (e.g., 'cus_ABC123')
   * @param publicKey - Organization's public key for nonce binding
   * @returns Stored OrganizationIdentity if successful
   * 
   * @throws {Error} if Stripe verifier not configured
   * @throws {Error} if verification fails
   * @throws {Error} if Stripe customer already bound to different org ID
   */
  async verifyViaStripe(
    orgId: string,
    stripeCustomerId: string,
    publicKey: string
  ): Promise<OrganizationIdentity> {
    if (!this.stripeVerifier) {
      throw new Error('Stripe verifier not configured');
    }

    // Check if org already verified
    const existing = await this.identityStore.getIdentity(orgId);
    if (existing) {
      throw new Error(
        `Organization ${orgId} already verified via ${existing.verificationMethod}`
      );
    }

    // Perform Stripe verification
    const result = await this.stripeVerifier.verifyCustomer(orgId, stripeCustomerId);
    
    if (!result.verified) {
      throw new Error(`Stripe verification failed: ${result.reason}`);
    }

    // Check if Stripe customer already bound to different Phase Mirror org
    const duplicate = await this.identityStore.getIdentityByStripeCustomerId(
      stripeCustomerId
    );
    if (duplicate) {
      throw new Error(
        `Stripe customer '${stripeCustomerId}' already bound to organization ${duplicate.orgId}`
      );
    }

    // Bind unique nonce to org
    const nonce = await this.nonceService.generateAndBindNonce(orgId, publicKey);

    // Create and store identity
    const identity: OrganizationIdentity = {
      orgId,
      publicKey,
      verificationMethod: 'stripe_customer',
      verifiedAt: result.verifiedAt!,
      uniqueNonce: nonce,
      stripeCustomerId: result.metadata.stripeCustomerId,
    };

    await this.identityStore.storeIdentity(identity);

    return identity;
  }

  /**
   * Verify organization via Stripe with subscription requirement.
   * 
   * @param orgId - Internal org ID
   * @param stripeCustomerId - Stripe customer ID
   * @param publicKey - Organization's public key
   * @param requiredProductIds - Required Phase Mirror product IDs
   * @returns Stored OrganizationIdentity if successful
   */
  async verifyViaStripeWithSubscription(
    orgId: string,
    stripeCustomerId: string,
    publicKey: string,
    requiredProductIds: string[]
  ): Promise<OrganizationIdentity> {
    if (!this.stripeVerifier) {
      throw new Error('Stripe verifier not configured');
    }

    // Check existing verification
    const existing = await this.identityStore.getIdentity(orgId);
    if (existing) {
      throw new Error(
        `Organization ${orgId} already verified via ${existing.verificationMethod}`
      );
    }

    // Perform Stripe verification with subscription check
    const result = await this.stripeVerifier.verifyCustomerWithSubscription(
      orgId,
      stripeCustomerId,
      requiredProductIds
    );
    
    if (!result.verified) {
      throw new Error(`Stripe verification failed: ${result.reason}`);
    }

    // Check for duplicate binding
    const duplicate = await this.identityStore.getIdentityByStripeCustomerId(
      stripeCustomerId
    );
    if (duplicate) {
      throw new Error(
        `Stripe customer '${stripeCustomerId}' already bound to organization ${duplicate.orgId}`
      );
    }

    // Bind nonce and store identity
    const nonce = await this.nonceService.generateAndBindNonce(orgId, publicKey);

    const identity: OrganizationIdentity = {
      orgId,
      publicKey,
      verificationMethod: 'stripe_customer',
      verifiedAt: result.verifiedAt!,
      uniqueNonce: nonce,
      stripeCustomerId: result.metadata.stripeCustomerId,
    };

    await this.identityStore.storeIdentity(identity);

    return identity;
  }

  // Existing getVerificationStatus method...
}
```


***

## Phase 5: Unit Tests

### File: `trust/__tests__/stripe-verifier.test.ts` (NEW)

Comprehensive test suite covering success, failure, and edge cases:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StripeVerifier, StripeVerificationError } from '../identity/stripe-verifier';
import Stripe from 'stripe';

// Mock Stripe
vi.mock('stripe');

describe('StripeVerifier', () => {
  let verifier: StripeVerifier;
  let mockStripe: any;

  beforeEach(() => {
    mockStripe = {
      customers: {
        retrieve: vi.fn(),
      },
      paymentIntents: {
        list: vi.fn(),
      },
      subscriptions: {
        list: vi.fn(),
      },
      invoices: {
        list: vi.fn(),
      },
    };

    (Stripe as any).mockImplementation(() => mockStripe);
    
    verifier = new StripeVerifier('sk_test_123', {
      minAgeDays: 30,
      minSuccessfulPayments: 1,
      requireActiveSubscription: false,
      rejectDelinquent: true,
    });
  });

  describe('constructor', () => {
    it('throws if API key is empty', () => {
      expect(() => new StripeVerifier('')).toThrow('Stripe API key is required');
    });

    it('throws if API key is not a secret key', () => {
      expect(() => new StripeVerifier('pk_test_123')).toThrow('must be a secret key');
    });

    it('accepts valid secret key', () => {
      expect(new StripeVerifier('sk_test_valid')).toBeDefined();
    });

    it('accepts custom config', () => {
      const custom = new StripeVerifier('sk_test_123', { minAgeDays: 7 });
      expect(custom).toBeDefined();
    });
  });

  describe('verifyCustomer - success cases', () => {
    it('verifies legitimate customer with payment history', async () => {
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
                { price: { product: 'prod_PhaseModeMirrorPro' } },
              ],
            },
          },
        ],
      });

      const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');

      expect(result.verified).toBe(true);
      expect(result.verificationMethod).toBe('stripe_customer');
      expect(result.metadata.stripeCustomerId).toBe('cus_ABC123');
      expect(result.metadata.successfulPaymentCount).toBe(3);
      expect(result.metadata.hasActiveSubscription).toBe(true);
      expect(result.metadata.isDelinquent).toBe(false);
    });

    it('verifies customer without active subscription when not required', async () => {
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

      const result = await verifier.verifyCustomer('org-456', 'cus_XYZ789');

      expect(result.verified).toBe(true);
      expect(result.metadata.hasActiveSubscription).toBe(false);
    });

    it('verifies business customer with tax ID', async () => {
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

      const result = await verifier.verifyCustomer('org-biz', 'cus_BIZ123');

      expect(result.verified).toBe(true);
      expect(result.metadata.customerType).toBe('company');
      expect(result.metadata.isBusinessVerified).toBe(true);
    });
  });

  describe('verifyCustomer - failure cases', () => {
    it('rejects customer that is too new', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60); // 15 days

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_NEW123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      const result = await verifier.verifyCustomer('org-new', 'cus_NEW123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('too new');
      expect(result.reason).toContain('15 days');
    });

    it('rejects delinquent customer', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_DEL123',
        created: createdTimestamp,
        delinquent: true, // Has unpaid invoices
        deleted: false,
      });

      const result = await verifier.verifyCustomer('org-delinquent', 'cus_DEL123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('delinquent');
      expect(result.metadata.isDelinquent).toBe(true);
    });

    it('rejects customer with insufficient payment history', async () => {
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

      const result = await verifier.verifyCustomer('org-nopay', 'cus_NOPAY123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('Insufficient payment history');
      expect(result.reason).toContain('0 payments');
    });

    it('rejects customer without subscription when required', async () => {
      const strictVerifier = new StripeVerifier('sk_test_123', {
        minAgeDays: 30,
        minSuccessfulPayments: 1,
        requireActiveSubscription: true, // Strict requirement
        rejectDelinquent: true,
      });

      (Stripe as any).mockImplementation(() => mockStripe);

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

      const result = await strictVerifier.verifyCustomer('org-nosub', 'cus_NOSUB123');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('No active subscription');
    });

    it('handles customer not found', async () => {
      const error = new Stripe.errors.StripeInvalidRequestError({
        message: 'No such customer: cus_404',
        type: 'StripeInvalidRequestError',
      });
      (error as any).type = 'StripeInvalidRequestError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      const result = await verifier.verifyCustomer('org-404', 'cus_404');

      expect(result.verified).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('throws on invalid customer ID format', async () => {
      await expect(
        verifier.verifyCustomer('org-invalid', 'invalid_id')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-invalid', 'invalid_id')
      ).rejects.toThrow('must start with');
    });

    it('throws on rate limit error', async () => {
      const error = new Stripe.errors.StripeRateLimitError({
        message: 'Too many requests',
        type: 'StripeRateLimitError',
      });
      (error as any).type = 'StripeRateLimitError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      await expect(
        verifier.verifyCustomer('org-rate', 'cus_RATE123')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-rate', 'cus_RATE123')
      ).rejects.toThrow('rate limit');
    });

    it('throws on invalid API key', async () => {
      const error = new Stripe.errors.StripeAuthenticationError({
        message: 'Invalid API Key',
        type: 'StripeAuthenticationError',
      });
      (error as any).type = 'StripeAuthenticationError';

      mockStripe.customers.retrieve.mockRejectedValue(error);

      await expect(
        verifier.verifyCustomer('org-auth', 'cus_AUTH123')
      ).rejects.toThrow(StripeVerificationError);

      await expect(
        verifier.verifyCustomer('org-auth', 'cus_AUTH123')
      ).rejects.toThrow('Invalid Stripe API key');
    });
  });

  describe('verifyCustomerWithSubscription', () => {
    it('verifies customer with required product subscription', async () => {
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

      const result = await verifier.verifyCustomerWithSubscription(
        'org-sub',
        'cus_SUB123',
        ['prod_PhaseMirrorEnterprise']
      );

      expect(result.verified).toBe(true);
      expect(result.metadata.subscriptionProductIds).toContain('prod_PhaseMirrorEnterprise');
    });

    it('rejects customer without required product', async () => {
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
    it('returns true for customer with past due invoices', async () => {
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

      const result = await verifier.hasDelinquentInvoices('cus_DEL123');

      expect(result).toBe(true);
    });

    it('returns false for customer with no past due invoices', async () => {
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

      const result = await verifier.hasDelinquentInvoices('cus_GOOD123');

      expect(result).toBe(false);
    });

    it('returns false on API error (fail open)', async () => {
      mockStripe.invoices.list.mockRejectedValue(new Error('API error'));

      const result = await verifier.hasDelinquentInvoices('cus_ERROR123');

      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles deleted customer', async () => {
      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_DELETED',
        deleted: true,
      });

      await expect(
        verifier.verifyCustomer('org-deleted', 'cus_DELETED')
      ).rejects.toThrow('has been deleted');
    });

    it('handles customer with no email or name', async () => {
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

      const result = await verifier.verifyCustomer('org-anon', 'cus_ANON123');

      expect(result.verified).toBe(true);
      expect(result.metadata.customerEmail).toBeUndefined();
      expect(result.metadata.customerName).toBeUndefined();
    });

    it('handles empty payment history gracefully', async () => {
      const createdTimestamp = Math.floor(Date.now() / 1000) - (60 * 24 * 60 * 60);

      mockStripe.customers.retrieve.mockResolvedValue({
        id: 'cus_EMPTY123',
        created: createdTimestamp,
        delinquent: false,
        deleted: false,
      });

      // API error when fetching payments (fail safe to 0)
      mockStripe.paymentIntents.list.mockRejectedValue(new Error('API error'));

      const result = await verifier.verifyCustomer('org-empty', 'cus_EMPTY123');

      expect(result.verified).toBe(false);
      expect(result.metadata.successfulPaymentCount).toBe(0);
    });
  });
});
```


***

## Phase 6: CLI Integration

### File: `cli/commands/verify.ts` (Updates)

Add Stripe verification to existing CLI command:

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
    .option('--stripe-customer <id>', 'Stripe customer ID (e.g., cus_ABC123)') // NEW
    .option('--public-key <key>', 'Organization public key (hex)', 'default-public-key')
    .option('--require-subscription', 'Require active Stripe subscription', false) // NEW
    .option('--product-ids <ids>', 'Required product IDs (comma-separated)', '') // NEW
    .action(async (options) => {
      if (options.method === 'github_org') {
        await verifyViaGitHub(options);
      } else if (options.method === 'stripe_customer') {
        await verifyViaStripe(options); // NEW
      } else {
        console.error(chalk.red(`Unsupported verification method: ${options.method}`));
        process.exit(1);
      }
    });

  return cmd;
}

// Existing verifyViaGitHub function...

async function verifyViaStripe(options: any) {
  const { orgId, stripeCustomer, publicKey, requireSubscription, productIds } = options;

  if (!stripeCustomer) {
    console.error(chalk.red('Error: --stripe-customer is required'));
    process.exit(1);
  }

  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeApiKey) {
    console.error(chalk.red('Error: STRIPE_SECRET_KEY environment variable not set'));
    process.exit(1);
  }

  console.log(chalk.blue('💳 Verifying Stripe customer...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Stripe Customer: ${stripeCustomer}`);
  if (requireSubscription) {
    console.log(chalk.yellow('  Subscription Required: Yes'));
    if (productIds) {
      console.log(chalk.yellow(`  Required Products: ${productIds}`));
    }
  }
  console.log();

  try {
    // Initialize services
    const adapters = createLocalTrustAdapters('.trust-data');
    const nonceService = new NonceBindingService(adapters.identityStore);
    
    const verificationService = new VerificationService(
      adapters.identityStore,
      nonceService,
      {
        stripeApiKey,
        allowedMethods: ['stripe_customer'],
      }
    );

    // Perform verification
    let identity;
    if (requireSubscription && productIds) {
      const requiredProductIds = productIds.split(',').map((id: string) => id.trim());
      identity = await verificationService.verifyViaStripeWithSubscription(
        orgId,
        stripeCustomer,
        publicKey,
        requiredProductIds
      );
    } else {
      identity = await verificationService.verifyViaStripe(
        orgId,
        stripeCustomer,
        publicKey
      );
    }

    console.log(chalk.green('✅ Verification successful!'));
    console.log();
    console.log('Identity Details:');
    console.log(`  Org ID: ${identity.orgId}`);
    console.log(`  Verification Method: ${identity.verificationMethod}`);
    console.log(`  Verified At: ${identity.verifiedAt.toISOString()}`);
    console.log(`  Stripe Customer ID: ${identity.stripeCustomerId}`);
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
# Set Stripe API key
export STRIPE_SECRET_KEY=sk_test_your_key_here

# Basic verification (payment history only)
pnpm cli verify --method stripe_customer \
  --org-id acme-corp-123 \
  --stripe-customer cus_ABC123 \
  --public-key abc123def456

# Require active subscription
pnpm cli verify --method stripe_customer \
  --org-id enterprise-corp-456 \
  --stripe-customer cus_XYZ789 \
  --public-key def456ghi789 \
  --require-subscription

# Require specific product subscription
pnpm cli verify --method stripe_customer \
  --org-id premium-corp-789 \
  --stripe-customer cus_PREMIUM123 \
  --public-key ghi789jkl012 \
  --require-subscription \
  --product-ids prod_PhaseMirrorEnterprise,prod_PhaseMirrorPro
```


***

## Phase 7: Environment \& Dependencies

### File: `packages/mirror-dissonance/package.json` (Updates)

Add Stripe SDK dependency:

```json
{
  "dependencies": {
    "@octokit/rest": "^20.0.2",
    "stripe": "^17.4.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "vitest": "^1.0.4"
  }
}
```


### File: `.env.example` (Updates)

Document Stripe environment variables:

```bash
# ═══════════════════════════════════════════════════════════
# Trust Module Configuration
# ═══════════════════════════════════════════════════════════

# GitHub Personal Access Token for organization verification
# Required scopes: read:org, read:user
# Generate at: https://github.com/settings/tokens
GITHUB_TOKEN=ghp_your_token_here

# Stripe Secret Key for customer verification
# Use test key (sk_test_...) for development
# Use live key (sk_live_...) for production
# Generate at: https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_your_key_here

# Optional: Phase Mirror product IDs for subscription verification
# Find in Stripe Dashboard > Products
PHASE_MIRROR_PRODUCT_IDS=prod_PhaseMirrorBasic,prod_PhaseMirrorPro,prod_PhaseMirrorEnterprise
```


***

## Phase 8: Documentation

### File: `docs/trust-module/stripe-verification.md` (NEW)

User-facing documentation:

```markdown
# Stripe Customer Verification

## Overview

Phase Mirror uses Stripe customer verification to prevent Sybil attacks in the false positive calibration network. Organizations can verify their identity through an established Stripe customer account with payment history, providing economic proof of legitimacy.

## Why Stripe Customers?

Stripe customer accounts provide:
- **Economic commitment** - Payment history demonstrates real business operations
- **Identity verification** - Stripe's KYC/KYB processes verify business legitimacy
- **Cost barrier** - Creating multiple Stripe accounts with payment history is expensive
- **Historical proof** - Account age and transaction volume distinguish real businesses
- **Revenue alignment** - Paying customers have aligned incentives to maintain network integrity

## Verification Criteria

Your Stripe customer account must meet these requirements:

| Criterion | Default Threshold | Rationale |
|-----------|------------------|-----------|
| **Account Age** | ≥30 days | Prevents rapid creation of fake accounts |
| **Payment History** | ≥1 successful payment | Demonstrates legitimate business activity |
| **Delinquency Status** | No unpaid invoices | Ensures good financial standing |
| **Subscription Status** | Optional (configurable) | Can require active Phase Mirror subscription |

*Note: Thresholds are configurable per deployment. Contact support for custom requirements.*

## Privacy Protections

**What we collect:**
- Stripe customer ID (immutable identifier)
- Account creation date
- Number of successful payments (count only, not amounts)
- Subscription status (active/inactive)
- Product IDs of active subscriptions

**What we DO NOT collect:**
- Payment method details (card numbers, bank accounts)
- Transaction amounts or totals
- Personally identifiable information (PII) beyond email
- Billing addresses or tax information

**Privacy guarantee:** Your Stripe customer ID is never linked to FP data in the calibration network. Only your organization ID hash appears in FP events, preserving k-anonymity.

## Verification Process

### Step 1: Prepare Your Stripe Customer Account

1. Have an active Stripe customer account (created via Phase Mirror subscription or manual setup)
2. Ensure account is at least 30 days old
3. Complete at least 1 successful payment
4. Resolve any unpaid invoices (if delinquency check enabled)

### Step 2: Find Your Stripe Customer ID

**Option A: From Stripe Dashboard**
1. Log into [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to Customers
3. Find your organization's customer record
4. Copy customer ID (format: `cus_ABC123...`)

**Option B: From Phase Mirror Account**
```bash
# If you have Phase Mirror CLI access
pnpm cli account info --org-id your-org-123
# Output includes Stripe customer ID
```


### Step 3: Generate Organization Keys

```bash
# Generate public/private key pair for your organization
pnpm cli keygen --org-id your-org-123

# This creates:
# - Public key (for verification)
# - Private key (keep secure! used for signing FP contributions)
```


### Step 4: Verify via Stripe

**Basic Verification (payment history only):**

```bash
# Set your Stripe Secret Key (or use Phase Mirror's key if provided)
export STRIPE_SECRET_KEY=sk_test_your_key_here

# Run verification
pnpm cli verify \
  --method stripe_customer \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key $(cat .keys/your-org-123.pub)
```

**With Subscription Requirement:**

```bash
pnpm cli verify \
  --method stripe_customer \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key $(cat .keys/your-org-123.pub) \
  --require-subscription
```

**With Specific Product Requirement:**

```bash
pnpm cli verify \
  --method stripe_customer \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key $(cat .keys/your-org-123.pub) \
  --require-subscription \
  --product-ids prod_PhaseMirrorEnterprise
```


### Step 5: Verification Results

**Success:**

```
✅ Verification successful!

Identity Details:
  Org ID: your-org-123
  Verification Method: stripe_customer
  Verified At: 2026-02-03T14:30:00.000Z
  Stripe Customer ID: cus_ABC123XYZ
  Unique Nonce: 8f3d2a1b-c4e5-6f7g-8h9i-0j1k2l3m4n5o

Identity stored in .trust-data/identities.json
```

**Failure Examples:**

```
❌ Verification failed: Customer account too new (15 days, minimum 30)
❌ Verification failed: Insufficient payment history (0 payments, minimum 1)
❌ Verification failed: Customer has delinquent invoices
❌ Verification failed: No active subscription found
❌ Verification failed: Customer does not have subscription to required products
```


## What Gets Verified?

During verification, Phase Mirror captures:

```typescript
{
  stripeCustomerId: "cus_ABC123XYZ",     // Immutable customer ID
  customerEmail: "billing@acme.com",     // Optional (may be redacted)
  accountCreatedAt: "2025-11-15",        // Account creation date
  successfulPaymentCount: 12,            // Number of successful payments
  hasActiveSubscription: true,           // Subscription status
  subscriptionProductIds: [              // Active product IDs
    "prod_PhaseMirrorEnterprise"
  ],
  isDelinquent: false,                   // Unpaid invoices status
  customerType: "company",               // Individual or company
  isBusinessVerified: true               // Stripe Identity verification
}
```


## Security Properties

### Sybil Resistance

- **Account age requirement** prevents rapid creation of many fake accounts
- **Payment history requirement** makes mass fake accounts expensive (requires real payment methods)
- **Stripe's fraud detection** identifies duplicate accounts and payment methods
- **Delinquency check** ensures only customers in good standing participate
- **Customer ID binding** prevents reuse after account deletion


### Economic Incentives

- **Payment history aligns incentives** - Paying customers benefit from accurate FP calibration
- **Subscription requirement** (optional) ensures ongoing financial commitment
- **Revenue-verified orgs** have reputation stake (risk losing access if malicious)


### Privacy Preservation

- Verification happens **before** FP contribution submission
- Stripe customer ID is **not** linked to FP data in the calibration network
- Only the org ID hash appears in FP events (k-anonymity preserved)
- No payment amounts or financial details stored


### One-to-One Binding

- Each Stripe customer can verify **exactly one** Phase Mirror org
- Each Phase Mirror org can be verified by **exactly one** Stripe customer
- Prevents customer identity sharing


## Troubleshooting

### "Customer account too new"

**Solution:** Wait until your Stripe customer account is at least 30 days old, or contact support for manual verification.

### "Insufficient payment history"

**Solution:** Complete at least one successful payment. This can be:

- Phase Mirror subscription payment
- One-time invoice payment
- Any other successful Stripe transaction

**Note:** Failed or pending payments don't count.

### "Customer has delinquent invoices"

**Solution:** Pay all outstanding invoices. Check your Stripe Dashboard under Invoices > Open.

### "No active subscription found"

**Solution:** Subscribe to a Phase Mirror plan if subscription verification is required:

- Basic Plan: \$99/month
- Pro Plan: \$299/month
- Enterprise Plan: Custom pricing

**Alternative:** Request basic verification (without subscription requirement).

### "Customer does not have subscription to required products"

**Solution:** Your subscription must be for the specific product(s) required. Upgrade your plan or contact support.

### "Stripe customer not found"

**Check:**

- Customer ID is spelled correctly (case-sensitive, starts with `cus_`)
- Customer exists in the Stripe account linked to Phase Mirror
- Customer has not been deleted


### "Invalid Stripe API key"

**Check:**

- API key is a **secret key** (starts with `sk_`, not `pk_`)
- API key is for the correct Stripe account
- API key has not been revoked or expired


### Rate Limit Exceeded

Stripe API has rate limits (typically 100 requests/second).

**Solution:** Wait a few seconds and retry. For bulk verifications, contact support for increased limits.

## Comparison: GitHub vs. Stripe Verification

| Dimension | GitHub Org | Stripe Customer | Which to Choose? |
| :-- | :-- | :-- | :-- |
| **Best For** | Open-source projects, tech companies | SaaS businesses, paying customers | Use both for maximum trust |
| **Cost Barrier** | Time (90d age) | Money (payment required) | Stripe higher barrier |
| **Verification Speed** | Instant | Instant | Equal |
| **False Negative Risk** | Small orgs, new startups | Nonprofits, academia | GitHub more inclusive |
| **Revenue Alignment** | None | Direct (paying customers) | Stripe for revenue-generating orgs |
| **Privacy** | Public org metadata | Private financial data | GitHub more transparent |

**Recommendation:**

- **For paying customers**: Use Stripe verification (stronger economic signal)
- **For open-source contributors**: Use GitHub verification (no payment required)
- **For maximum trust**: Verify via both methods (dual verification)


## FAQ

**Q: Can I verify multiple Phase Mirror orgs with the same Stripe customer?**
A: No. Each Stripe customer can verify exactly one Phase Mirror organization.

**Q: What if I change Stripe accounts?**
A: Verification is permanent. To change, you must create a new Phase Mirror organization and verify with the new Stripe customer.

**Q: Does verification expire?**
A: No. Once verified, your organization remains verified indefinitely unless manually revoked.

**Q: What happens if my subscription is canceled?**
A: If you verified without subscription requirement, verification remains valid. If subscription was required, you may need to re-verify or renew your subscription to continue contributing.

**Q: Can I verify without a Phase Mirror subscription?**
A: Yes, if basic verification is enabled (payment history only). Check with your Phase Mirror deployment administrator.

**Q: What Stripe API key should I use?**
A: Use your Stripe **secret key** (starts with `sk_`). Never use publishable keys (`pk_`). For development, use test mode keys. For production, use live mode keys.

**Q: Is my payment information exposed?**
A: No. Phase Mirror only checks payment count, not amounts or payment methods. Your financial data remains private.

**Q: Can I verify with a Stripe Connect account?**
A: Currently not supported. Use standard Stripe customer accounts only.

## API Reference

See `trust/identity/stripe-verifier.ts` for programmatic usage:

```typescript
import { StripeVerifier } from '@mirror-dissonance/core/trust';

const verifier = new StripeVerifier(process.env.STRIPE_SECRET_KEY);

// Basic verification
const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');

if (result.verified) {
  console.log('Verified!', result.metadata);
} else {
  console.error('Failed:', result.reason);
}

// Verification with subscription requirement
const subResult = await verifier.verifyCustomerWithSubscription(
  'org-123',
  'cus_ABC123',
  ['prod_PhaseMirrorEnterprise']
);

// Check delinquency status
const isDelinquent = await verifier.hasDelinquentInvoices('cus_ABC123');
```


## Support

For verification issues or questions:

- GitHub Issues: https://github.com/PhaseMirror/Phase-Mirror/issues
- Email: support@phasemirror.com
- Stripe integration support: stripe@phasemirror.com
- Manual verification requests: contact@phasemirror.com

```

***

## Phase 9: Revenue Integration (Optional)

### File: `trust/identity/revenue-tracking.ts` (NEW)

Optional service for tracking revenue-verified organizations:

```typescript
import { IIdentityStore } from '../adapters/types';
import { OrganizationIdentity } from './types';
import Stripe from 'stripe';

/**
 * Revenue tracking service for Stripe-verified organizations.
 * 
 * Provides analytics on revenue-generating organizations in the
 * trust network, helping identify high-value contributors.
 */
export class RevenueTrackingService {
  constructor(
    private readonly identityStore: IIdentityStore,
    private readonly stripe: Stripe
  ) {}

  /**
   * Get all revenue-verified organizations.
   */
  async getRevenueVerifiedOrgs(): Promise<OrganizationIdentity[]> {
    return await this.identityStore.listStripeVerifiedIdentities();
  }

  /**
   * Calculate total monthly recurring revenue from verified orgs.
   * 
   * @param productIds - Optional filter by product IDs
   * @returns Total MRR in cents
   */
  async calculateMRR(productIds?: string[]): Promise<number> {
    const verifiedOrgs = await this.getRevenueVerifiedOrgs();
    let totalMRR = 0;

    for (const org of verifiedOrgs) {
      if (!org.stripeCustomerId) continue;

      const subscriptions = await this.stripe.subscriptions.list({
        customer: org.stripeCustomerId,
        status: 'active',
        limit: 100,
      });

      for (const sub of subscriptions.data) {
        // Sum subscription item amounts
        const subTotal = sub.items.data.reduce((sum, item) => {
          // Filter by product if specified
          if (productIds && !productIds.includes(item.price.product as string)) {
            return sum;
          }

          // Convert to monthly amount
          const amount = item.price.unit_amount || 0;
          const quantity = item.quantity || 1;
          const interval = item.price.recurring?.interval;

          let monthlyAmount = amount * quantity;
          if (interval === 'year') {
            monthlyAmount = monthlyAmount / 12;
          }

          return sum + monthlyAmount;
        }, 0);

        totalMRR += subTotal;
      }
    }

    return Math.round(totalMRR);
  }

  /**
   * Get subscription distribution across verified orgs.
   */
  async getSubscriptionDistribution(): Promise<Map<string, number>> {
    const distribution = new Map<string, number>();
    const verifiedOrgs = await this.getRevenueVerifiedOrgs();

    for (const org of verifiedOrgs) {
      if (!org.stripeCustomerId) continue;

      const subscriptions = await this.stripe.subscriptions.list({
        customer: org.stripeCustomerId,
        status: 'active',
        limit: 100,
      });

      for (const sub of subscriptions.data) {
        for (const item of sub.items.data) {
          const productId = item.price.product as string;
          distribution.set(productId, (distribution.get(productId) || 0) + 1);
        }
      }
    }

    return distribution;
  }
}
```


***

## Success Criteria

### Definition of Done

- [ ] `StripeVerifier` class fully implemented with all anti-Sybil heuristics
- [ ] `VerificationService` supports Stripe verification with and without subscription requirements
- [ ] `IIdentityStore` extended with Stripe-specific queries
- [ ] Local adapters implement Stripe query methods
- [ ] **51+ existing tests + 25+ new Stripe verifier tests = 76+ total tests passing**
- [ ] CLI `verify` command supports Stripe method with subscription flags
- [ ] Environment variables documented in `.env.example`
- [ ] User-facing documentation in `docs/trust-module/stripe-verification.md`
- [ ] Dependencies added to `package.json` (`stripe`)
- [ ] TypeScript compilation succeeds with no errors
- [ ] CodeQL security scan passes (no new vulnerabilities)
- [ ] Manual verification test with real Stripe customer succeeds


### Integration Test Checklist

Test with **real Stripe customers** (use test mode):

```bash
# Test 1: Legitimate customer (should pass)
export STRIPE_SECRET_KEY=sk_test_your_key
pnpm cli verify --method stripe_customer \
  --org-id test-org-1 \
  --stripe-customer cus_test_legitimate \
  --public-key test-key-1

# Test 2: New customer (should fail - too new)
pnpm cli verify --method stripe_customer \
  --org-id test-org-2 \
  --stripe-customer cus_test_new \
  --public-key test-key-2

# Test 3: Customer with no payments (should fail - no payment history)
pnpm cli verify --method stripe_customer \
  --org-id test-org-3 \
  --stripe-customer cus_test_no_payments \
  --public-key test-key-3

# Test 4: Delinquent customer (should fail - unpaid invoices)
pnpm cli verify --method stripe_customer \
  --org-id test-org-4 \
  --stripe-customer cus_test_delinquent \
  --public-key test-key-4

# Test 5: Customer without subscription when required (should fail)
pnpm cli verify --method stripe_customer \
  --org-id test-org-5 \
  --stripe-customer cus_test_no_sub \
  --public-key test-key-5 \
  --require-subscription

# Test 6: Customer with correct subscription (should pass)
pnpm cli verify --method stripe_customer \
  --org-id test-org-6 \
  --stripe-customer cus_test_enterprise \
  --public-key test-key-6 \
  --require-subscription \
  --product-ids prod_test_enterprise

# Test 7: Nonexistent customer (should fail - not found)
pnpm cli verify --method stripe_customer \
  --org-id test-org-7 \
  --stripe-customer cus_does_not_exist \
  --public-key test-key-7

# Test 8: Duplicate verification (should fail - already bound)
pnpm cli verify --method stripe_customer \
  --org-id test-org-8 \
  --stripe-customer cus_test_legitimate \
  --public-key test-key-8
```


***

## Next Steps After P1 Completion

Once both GitHub and Stripe verification are production-ready:

1. **P2: Nonce Binding Service** - Complete cryptographic nonce-to-identity binding
2. **P2: Multi-Method Verification** - Allow orgs to verify via multiple methods (GitHub + Stripe)
3. **P3: Reputation Integration** - Link verified identities to reputation scoring with economic weight
4. **P3: FP Calibration Integration** - Implement weighted aggregation with Byzantine filtering
5. **P4: AWS Adapters** - DynamoDB implementation for production deployment
6. **P5: Webhook Integration** - Real-time monitoring of GitHub org changes and Stripe subscription updates

***

## Copilot Implementation Prompts

Use these prompts to guide Copilot through implementation:

### Prompt 1: Implement StripeVerifier Class

```
Implement the StripeVerifier class in trust/identity/stripe-verifier.ts with:
- Constructor accepting Stripe API key and optional config
- verifyCustomer method using stripe SDK
- Anti-Sybil heuristics: age (30d), successful payments (1+), delinquency check
- verifyCustomerWithSubscription method with product ID filtering
- hasDelinquentInvoices method checking open invoices
- Error handling for invalid customer ID, not found, rate limits, auth errors
- StripeVerificationError custom error class
- Private helper methods for fetching customer, counting payments, checking subscriptions

Follow the blueprint in trust/identity/stripe-verifier.ts exactly.
Use existing Phase Mirror code patterns from adapters/.
Import from 'stripe' package (version ^17.4.0).
```


### Prompt 2: Extend Type Definitions

```
Add Stripe-specific types to trust/identity/types.ts:
- StripeCustomerMetadata interface with stripeCustomerId, accountCreatedAt, successfulPaymentCount, etc.
- StripeVerificationResult extending VerificationResult
- SubscriptionRequirement interface for product verification
- Preserve all existing types (OrganizationIdentity, VerificationResult, VerificationMethod)
- Add 'stripe_customer' to VerificationMethod union type

Follow TypeScript strict mode conventions.
Add privacy-focused JSDoc comments noting what financial data is NOT collected.
```


### Prompt 3: Update Local Adapters

```
Add two new methods to LocalIdentityStore in trust/adapters/local/identity-store.ts:
1. getIdentityByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationIdentity | null>
2. listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]>

Use existing loadIdentities() and saveIdentities() patterns.
Filter identities by stripeCustomerId and verificationMethod === 'stripe_customer'.
Follow same structure as existing GitHub query methods.
```


### Prompt 4: Update VerificationService

```
Add Stripe verification methods to trust/identity/verification-service.ts:
- Add stripeVerifier private field of type IStripeVerifier
- Initialize in constructor if config.stripeApiKey provided
- Add verifyViaStripe method orchestrating: verify → check duplicates → bind nonce → store identity
- Add verifyViaStripeWithSubscription method with product ID requirements
- Throw errors for: verifier not configured, already verified, Stripe customer already bound

Follow same pattern as existing verifyViaGitHub method.
Use service patterns from existing fp-store/ and calibration-store/.
```


### Prompt 5: Write Unit Tests

```
Create trust/__tests__/stripe-verifier.test.ts with vitest:
- Mock Stripe using vi.mock('stripe')
- Test success cases: legitimate customer, customer without subscription (when optional)
- Test failure cases: too new, insufficient payments, delinquent, no subscription (when required), not found
- Test verifyCustomerWithSubscription with correct and wrong product IDs
- Test hasDelinquentInvoices with past due and current invoices
- Test edge cases: deleted customer, no email/name, empty payment history, invalid customer ID format
- Aim for 25+ test cases covering all code paths

Use existing test patterns from trust/__tests__/github-verifier.test.ts.
Mock Stripe errors using Stripe.errors.StripeError class.
```


### Prompt 6: Update CLI Command

```
Add Stripe verification to cli/commands/verify.ts:
- Add verifyViaStripe function accepting options
- Handle --stripe-customer, --require-subscription, --product-ids flags
- Read STRIPE_SECRET_KEY from environment
- Use VerificationService.verifyViaStripe or verifyViaStripeWithSubscription
- Chalk colored output: blue for info, green for success, red for errors
- Show customer email, payment count, subscription status in success output

Follow CLI patterns from existing verifyViaGitHub function.
Parse comma-separated product IDs from --product-ids flag.
```


### Prompt 7: Optional Revenue Tracking

```
Create trust/identity/revenue-tracking.ts with RevenueTrackingService class:
- Constructor accepting IIdentityStore and Stripe instance
- getRevenueVerifiedOrgs method querying listStripeVerifiedIdentities
- calculateMRR method summing active subscription amounts (monthly normalized)
- getSubscriptionDistribution method counting subscriptions per product
- Handle yearly subscriptions (divide by 12 for MRR calculation)

This is optional for advanced revenue analytics.
Use for tracking high-value contributors to trust network.
```


***

## Dissonance Analysis: Stripe Verification

### Productive Contradictions

| Tension | Lever | Artifact |
| :-- | :-- | :-- |
| **Economic Barrier vs. Inclusivity** | Stripe verification creates cost barrier (requires payment), excluding nonprofits/academia | Multi-method verification (GitHub OR Stripe); manual verification fallback for special cases |
| **Revenue Alignment vs. Fairness** | Paying customers have stronger incentive alignment, but shouldn't dominate free contributors | Reputation system weights both verified identities AND contribution quality (Layer 2); Stripe doesn't automatically grant higher reputation |
| **Privacy vs. Verification Strength** | Stripe has rich financial data (payment amounts, subscriptions), but exposing it risks privacy | Minimal data collection: only customer ID, payment count, subscription status; no amounts or payment methods |
| **Instant Verification vs. Anti-Fraud** | Stripe verification is instant, but sophisticated attackers could create fake customers | Future: Stripe webhook integration to monitor for account changes, canceled subscriptions, chargebacks |

### Hidden Assumptions

1. **Stripe's fraud detection is sufficient** - Assumes Stripe identifies duplicate accounts and payment methods
    - **Mitigation**: Layer reputation scoring (Layer 2) on top of identity verification; monitor for suspicious patterns
2. **Payment history indicates legitimacy** - Assumes paying customers are more trustworthy than non-paying
    - **Risk**: Motivated attackers could make small payments to gain verification
    - **Mitigation**: Configurable payment count threshold (default 1, can increase); future: minimum payment amount threshold
3. **Subscription status doesn't change post-verification** - Assumes verified orgs maintain subscriptions
    - **Risk**: Org cancels subscription after verification, continues contributing
    - **Mitigation**: Future: Stripe webhook monitoring for subscription cancellations; reputation decay for inactive subscriptions
4. **30-day threshold is sufficient** - Assumes 30 days is long enough to deter mass Sybil attacks via Stripe
    - **Comparison**: GitHub uses 90 days (3x longer)
    - **Rationale**: Payment history is stronger signal than age alone
    - **Mitigation**: Threshold is configurable; can increase if attacks observed

### Open Questions for Next Implementation Phase

1. **Should verification be revoked if subscription is canceled?**
    - **Current**: Verification is permanent, subscription optional
    - **Risk**: Orgs could verify, cancel, and continue contributing indefinitely
    - **Recommendation**: Add `verificationExpiryDays` config option; require re-verification after N days without active subscription
2. **How to handle subscription downgrades?**
    - **Scenario**: Org verifies with Enterprise subscription, downgrades to Basic
    - **Question**: Should verification remain valid? Require re-verification?
    - **Recommendation**: Verification remains valid as long as ANY subscription active; product-specific verification can be invalidated on downgrade
3. **Should payment amount matter?**
    - **Current**: Only counts successful payments, ignores amounts
    - **Risk**: Attacker makes \$0.01 payments to bypass threshold
    - **Recommendation**: Add `minPaymentAmountCents` config option (default: 100 = \$1.00); exclude micropayments from count
4. **How to handle refunds and chargebacks?**
    - **Current**: Payment count doesn't decrease on refunds
    - **Risk**: Attacker verifies with payment, then disputes/refunds
    - **Recommendation**: Stripe webhook integration to decrement payment count on refund/chargeback; revoke verification if count falls below threshold
5. **Should we verify business entity vs. individual?**
    - **Current**: Both individual and company customers allowed (configurable)
    - **Question**: Should enterprise Phase Mirror require company verification?
    - **Recommendation**: Add `requireVerifiedBusiness: true` config option for enterprise deployments; use Stripe Identity verification
6. **Multi-customer organizations?**
    - **Scenario**: Enterprise with multiple business units, each with Stripe customer
    - **Question**: Allow multiple Stripe customers to verify same Phase Mirror org?
    - **Current**: No, one-to-one binding
    - **Recommendation**: Future: Add `allowMultiCustomer: boolean` config; require primary customer designation

***

**End of Blueprint**

This implementation blueprint provides complete, production-ready guidance for Stripe customer verification in Phase Mirror's Trust Module. The implementation complements GitHub verification by providing economic proof of legitimacy, creating a multi-layered identity verification system that addresses different trust signals (social proof vs. economic commitment). All code follows existing patterns, maintains TypeScript strict mode compliance, and integrates seamlessly with the adapter architecture. Ready for Copilot-assisted implementation. 🚀💳
<span style="display:none">[^1][^10][^11][^12][^13][^14][^15][^16][^17][^18][^2][^3][^4][^5][^6][^7][^8][^9]</span>

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

