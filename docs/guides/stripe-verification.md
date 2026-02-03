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

### Step 3: Verify via API

Using the Phase Mirror Stripe verifier programmatically:

```typescript
import { StripeVerifier } from '@mirror-dissonance/core/trust';

// Initialize verifier with your Stripe secret key
const verifier = new StripeVerifier(process.env.STRIPE_SECRET_KEY);

// Basic verification (payment history only)
const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');

if (result.verified) {
  console.log('Verified!', result.metadata);
  // Store identity with result.metadata.stripeCustomerId
} else {
  console.error('Failed:', result.reason);
}
```

### Step 4: Verification with Subscription Requirement

```typescript
// Require active subscription to specific products
const result = await verifier.verifyCustomerWithSubscription(
  'org-123',
  'cus_ABC123',
  ['prod_PhaseMirrorEnterprise', 'prod_PhaseMirrorPro']
);

if (result.verified) {
  console.log('Subscription verified:', result.metadata.subscriptionProductIds);
}
```

### Step 5: Check Delinquency Status

```typescript
// Check if customer has unpaid invoices
const isDelinquent = await verifier.hasDelinquentInvoices('cus_ABC123');

if (isDelinquent) {
  console.log('Customer has past due invoices');
}
```

## Configuration Options

The StripeVerifier accepts a configuration object:

```typescript
const verifier = new StripeVerifier('sk_test_...', {
  minAgeDays: 30,                      // Minimum account age in days
  minSuccessfulPayments: 1,            // Minimum successful payment count
  requireActiveSubscription: false,    // Require active subscription
  rejectDelinquent: true,              // Reject customers with unpaid invoices
  allowedCustomerTypes: ['individual', 'company'], // Allowed customer types
  requireVerifiedBusiness: false       // Require business verification (tax ID)
});
```

### Configuration Examples

**Strict verification (enterprise deployments):**
```typescript
{
  minAgeDays: 90,
  minSuccessfulPayments: 5,
  requireActiveSubscription: true,
  rejectDelinquent: true,
  requireVerifiedBusiness: true
}
```

**Lenient verification (testing/development):**
```typescript
{
  minAgeDays: 7,
  minSuccessfulPayments: 0,
  requireActiveSubscription: false,
  rejectDelinquent: false
}
```

## Verification Results

### Success Response

```typescript
{
  verified: true,
  method: 'stripe_customer',
  reason: 'Stripe customer verified',
  verifiedAt: Date,
  metadata: {
    stripeCustomerId: 'cus_ABC123',
    customerEmail: 'billing@acme.com',
    customerName: 'Acme Corp',
    accountCreatedAt: Date,
    successfulPaymentCount: 12,
    hasActiveSubscription: true,
    subscriptionProductIds: ['prod_PhaseMirrorPro'],
    isDelinquent: false,
    customerType: 'company',
    isBusinessVerified: true
  }
}
```

### Failure Responses

**Account too new:**
```typescript
{
  verified: false,
  method: 'stripe_customer',
  reason: 'Customer account too new (15 days, minimum 30)',
  metadata: { ... }
}
```

**Insufficient payment history:**
```typescript
{
  verified: false,
  reason: 'Insufficient payment history (0 payments, minimum 1)',
  metadata: { successfulPaymentCount: 0, ... }
}
```

**Delinquent customer:**
```typescript
{
  verified: false,
  reason: 'Customer has delinquent invoices',
  metadata: { isDelinquent: true, ... }
}
```

## Error Handling

The verifier throws `StripeVerificationError` for API failures:

```typescript
import { StripeVerificationError } from '@mirror-dissonance/core/trust';

try {
  const result = await verifier.verifyCustomer('org-123', 'cus_INVALID');
} catch (error) {
  if (error instanceof StripeVerificationError) {
    console.error('Verification error:', error.code);
    // Possible codes: NOT_FOUND, API_ERROR, RATE_LIMIT, INVALID_KEY, INVALID_CUSTOMER_ID, DELINQUENT
  }
}
```

### Error Codes

| Code | Description | Action |
|------|-------------|--------|
| `INVALID_CUSTOMER_ID` | Customer ID format invalid | Check format (must start with `cus_`) |
| `NOT_FOUND` | Customer not found | Verify customer exists in Stripe |
| `RATE_LIMIT` | Stripe API rate limit exceeded | Wait and retry |
| `INVALID_KEY` | Invalid Stripe API key | Check API key is valid secret key (`sk_`) |
| `API_ERROR` | General Stripe API error | Check Stripe status, retry |
| `DELINQUENT` | Customer has unpaid invoices | Pay outstanding invoices |

## Security Properties

### Sybil Resistance

1. **Account age requirement** - Prevents rapid creation of many fake accounts
2. **Payment history requirement** - Makes mass fake accounts expensive (requires real payment methods)
3. **Stripe's fraud detection** - Identifies duplicate accounts and payment methods
4. **Delinquency check** - Ensures only customers in good standing participate
5. **Customer ID binding** - Prevents reuse after account deletion

### Economic Incentives

1. **Payment history** - Aligns incentives (paying customers benefit from accurate FP calibration)
2. **Subscription requirement** (optional) - Ensures ongoing financial commitment
3. **Revenue-verified orgs** - Have reputation stake (risk losing access if malicious)

### Privacy Preservation

1. **Verification before contribution** - Happens before FP submission
2. **No linkage** - Stripe customer ID not linked to FP data in calibration network
3. **K-anonymity preserved** - Only org ID hash appears in FP events
4. **Minimal data** - No payment amounts or financial details stored

## Troubleshooting

### "Customer account too new"

**Solution:** Wait until your Stripe customer account is at least 30 days old, or contact support for manual verification.

### "Insufficient payment history"

**Solution:** Complete at least one successful payment. This can be:
- Phase Mirror subscription payment
- One-time invoice payment
- Any other successful Stripe transaction

*Note: Failed or pending payments don't count.*

### "Customer has delinquent invoices"

**Solution:** Pay all outstanding invoices. Check your Stripe Dashboard under Invoices > Open.

### "No active subscription found"

**Solution:** Subscribe to a Phase Mirror plan if subscription verification is required, or request basic verification (without subscription requirement).

### "Stripe customer not found"

**Check:**
- Customer ID is spelled correctly (case-sensitive, starts with `cus_`)
- Customer exists in the Stripe account linked to Phase Mirror
- Customer has not been deleted

### "Invalid Stripe API key"

**Check:**
- API key is a secret key (starts with `sk_`, not `pk_`)
- API key is for the correct Stripe account
- API key has not been revoked or expired

### Rate Limit Exceeded

Stripe API has rate limits (typically 100 requests/second).

**Solution:** Wait a few seconds and retry. For bulk verifications, contact support for increased limits.

## Comparison: GitHub vs. Stripe Verification

| Dimension | GitHub Org | Stripe Customer | Which to Choose? |
|-----------|-----------|----------------|------------------|
| **Best For** | Open-source projects, tech companies | SaaS businesses, paying customers | Use both for maximum trust |
| **Cost Barrier** | Time (90d age) | Money (payment required) | Stripe higher barrier |
| **Verification Speed** | Instant | Instant | Equal |
| **False Negative Risk** | Small orgs, new startups | Nonprofits, academia | GitHub more inclusive |
| **Revenue Alignment** | None | Direct (paying customers) | Stripe for revenue-generating orgs |
| **Privacy** | Public org metadata | Private financial data | GitHub more transparent |

**Recommendation:**
- For **paying customers**: Use Stripe verification (stronger economic signal)
- For **open-source contributors**: Use GitHub verification (no payment required)
- For **maximum trust**: Verify via both methods (dual verification)

## API Reference

### StripeVerifier Class

```typescript
class StripeVerifier implements IStripeVerifier {
  constructor(apiKey: string, config?: Partial<StripeVerificationConfig>);
  
  verifyCustomer(
    orgId: string,
    stripeCustomerId: string
  ): Promise<StripeVerificationResult>;
  
  verifyCustomerWithSubscription(
    orgId: string,
    stripeCustomerId: string,
    requiredProductIds?: string[]
  ): Promise<StripeVerificationResult>;
  
  hasDelinquentInvoices(
    stripeCustomerId: string
  ): Promise<boolean>;
}
```

### Interfaces

```typescript
interface StripeVerificationConfig {
  minAgeDays: number;
  minSuccessfulPayments: number;
  requireActiveSubscription: boolean;
  rejectDelinquent: boolean;
  allowedCustomerTypes: string[];
  requireVerifiedBusiness: boolean;
}

interface StripeVerificationResult {
  verified: boolean;
  method: 'stripe_customer';
  reason?: string;
  verifiedAt?: Date;
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

class StripeVerificationError extends Error {
  code: 'NOT_FOUND' | 'API_ERROR' | 'RATE_LIMIT' | 'INVALID_KEY' | 'INVALID_CUSTOMER_ID' | 'DELINQUENT';
  details?: unknown;
}
```

## FAQ

### Q: Can I verify multiple Phase Mirror orgs with the same Stripe customer?

**A:** No. Each Stripe customer can verify exactly one Phase Mirror organization.

### Q: What if I change Stripe accounts?

**A:** Verification is permanent. To change, you must create a new Phase Mirror organization and verify with the new Stripe customer.

### Q: Does verification expire?

**A:** No. Once verified, your organization remains verified indefinitely unless manually revoked.

### Q: What happens if my subscription is canceled?

**A:** If you verified without subscription requirement, verification remains valid. If subscription was required, you may need to re-verify or renew your subscription to continue contributing.

### Q: Can I verify without a Phase Mirror subscription?

**A:** Yes, if basic verification is enabled (payment history only). Check with your Phase Mirror deployment administrator.

### Q: What Stripe API key should I use?

**A:** Use your Stripe secret key (starts with `sk_`). Never use publishable keys (`pk_`). For development, use test mode keys. For production, use live mode keys.

### Q: Is my payment information exposed?

**A:** No. Phase Mirror only checks payment count, not amounts or payment methods. Your financial data remains private.

### Q: Can I verify with a Stripe Connect account?

**A:** Currently not supported. Use standard Stripe customer accounts only.

## Support

For verification issues or questions:

- **GitHub Issues:** https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Documentation:** https://github.com/MultiplicityFoundation/Phase-Mirror/tree/main/docs
- **Email:** support@phasemirror.com

## License

This feature is part of Phase Mirror and is licensed under the Apache 2.0 License.
