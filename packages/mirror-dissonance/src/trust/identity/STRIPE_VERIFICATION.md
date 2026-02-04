# Stripe Customer Verification

## Overview

The Stripe customer verification feature prevents Sybil attacks in Phase Mirror's Trust Module by verifying organizational identities through established Stripe customers with verifiable payment history. This ensures only legitimate paying organizations can contribute to the false positive calibration network while maintaining k-anonymity.

## Quick Start

### CLI Usage

The easiest way to verify your organization is via the Phase Mirror CLI:

```bash
# Set your Stripe secret key (test mode for development)
export STRIPE_SECRET_KEY=sk_test_your_key

# Verify your organization
pnpm cli verify stripe \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key your-public-key

# With subscription requirement
pnpm cli verify stripe \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key your-public-key \
  --require-subscription

# With specific product requirement
pnpm cli verify stripe \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key your-public-key \
  --require-subscription \
  --product-ids prod_PhaseMirrorEnterprise,prod_PhaseMirrorPro

# List verified identities
pnpm cli verify list --method stripe_customer
```

### Programmatic Usage

```typescript
import { StripeVerifier } from '@mirror-dissonance/core/trust/identity/stripe-verifier';

// Initialize verifier with Stripe secret key
const verifier = new StripeVerifier(process.env.STRIPE_SECRET_KEY);

// Verify an organization
const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');

if (result.verified) {
  console.log('✅ Verification successful!');
  console.log('Stripe Customer ID:', result.metadata.stripeCustomerId);
  console.log('Account Created:', result.metadata.accountCreatedAt);
  console.log('Payment Count:', result.metadata.successfulPaymentCount);
} else {
  console.log('❌ Verification failed:', result.reason);
}
```

## Verification Results

### Success Example

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

### Failure Examples

```
❌ Verification failed: Customer account too new (15 days, minimum 30)
❌ Verification failed: Insufficient payment history (0 payments, minimum 1)
❌ Verification failed: Customer has delinquent invoices
❌ Verification failed: No active subscription found
❌ Verification failed: Customer does not have subscription to required products
```

## Anti-Sybil Heuristics

The verifier implements multiple heuristics to prevent Sybil attacks:

### Default Thresholds

| Criterion | Default | Rationale |
|-----------|---------|-----------|
| **Account Age** | ≥30 days | Prevents rapid creation of fake accounts |
| **Payment History** | ≥1 successful payment | Makes mass fake accounts expensive |
| **Delinquency Check** | Enabled | Ensures customers in good standing |
| **Subscription** | Optional | Can require ongoing financial commitment |

### Custom Configuration

You can customize thresholds based on your security requirements:

```typescript
const verifier = new StripeVerifier(process.env.STRIPE_SECRET_KEY, {
  minAgeDays: 60,                        // Require 60 days age
  minSuccessfulPayments: 3,              // Require 3+ payments
  requireActiveSubscription: true,        // Require active subscription
  rejectDelinquent: true,                // Reject delinquent customers
  allowedCustomerTypes: ['company'],     // Only allow companies
  requireVerifiedBusiness: true          // Require Stripe Identity verification
});
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

## Advanced Usage

### Verification with Subscription Requirement

```typescript
// Require specific product subscription
const result = await verifier.verifyCustomerWithSubscription(
  'org-123',
  'cus_ABC123',
  ['prod_PhaseMirrorEnterprise', 'prod_PhaseMirrorPro']
);

if (result.verified) {
  console.log('Subscription products:', result.metadata.subscriptionProductIds);
}
```

### Check Delinquency Status

```typescript
// Check if customer has past-due invoices
const isDelinquent = await verifier.hasDelinquentInvoices('cus_ABC123');

if (isDelinquent) {
  console.log('⚠️ Customer has unpaid invoices');
}
```

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
- Basic Plan: $99/month
- Pro Plan: $299/month
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
|-----------|-----------|-----------------|------------------|
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

See `trust/identity/stripe-verifier.ts` for complete API documentation.

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
  
  hasDelinquentInvoices(stripeCustomerId: string): Promise<boolean>;
}
```

### Configuration Options

```typescript
interface StripeVerificationConfig {
  minAgeDays: number;                    // Default: 30
  minSuccessfulPayments: number;         // Default: 1
  requireActiveSubscription: boolean;    // Default: false
  rejectDelinquent: boolean;             // Default: true
  allowedCustomerTypes: string[];        // Default: ['individual', 'company']
  requireVerifiedBusiness: boolean;      // Default: false
}
```

### Verification Result

```typescript
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
```

## Error Handling

The verifier throws `StripeVerificationError` for API-level failures:

```typescript
try {
  const result = await verifier.verifyCustomer('org-123', 'cus_ABC123');
} catch (error) {
  if (error instanceof StripeVerificationError) {
    console.error('Verification error:', error.code, error.message);
    // Possible codes: NOT_FOUND, API_ERROR, RATE_LIMIT, INVALID_KEY, INVALID_CUSTOMER_ID, DELINQUENT
  }
}
```

## Support

For verification issues or questions:
- GitHub Issues: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- Email: support@phasemirror.com
- Stripe integration support: stripe@phasemirror.com
- Manual verification requests: contact@phasemirror.com

## Related Documentation

- [GitHub Organization Verification](./GITHUB_VERIFICATION.md)
- [Nonce Binding Service](./NONCE_BINDING.md)
- [Trust Module README](../README.md)
