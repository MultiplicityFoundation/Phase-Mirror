# Stripe Customer Verification - Integration Tests

This directory contains integration tests for the Stripe customer verification feature in Phase Mirror's Trust Module.

## Prerequisites

1. **Stripe Test Account**: You need a Stripe account with test mode enabled
2. **Test Mode Secret Key**: Get your test mode secret key from https://dashboard.stripe.com/test/apikeys
3. **Test Customers**: Create test customers in your Stripe dashboard with different characteristics

## Setting Up Test Customers

Before running the integration tests, create the following test customers in your Stripe test dashboard:

### Required Test Customers

1. **cus_test_legitimate** - Legitimate customer that should pass verification
   - Account age: >30 days old
   - Payment history: At least 1 successful payment
   - No delinquent invoices
   - Optionally: Active subscription

2. **cus_test_new** - Recently created customer
   - Account age: <30 days old
   - Should fail verification due to age

3. **cus_test_no_payments** - Customer with no payment history
   - Account age: >30 days old
   - Payment history: 0 successful payments
   - Should fail verification due to lack of payment history

4. **cus_test_delinquent** - Customer with unpaid invoices
   - Account age: >30 days old
   - Payment history: At least 1 successful payment
   - Has open/past-due invoices
   - Should fail verification due to delinquency

5. **cus_test_no_sub** - Customer without subscription
   - Account age: >30 days old
   - Payment history: At least 1 successful payment
   - No active subscription
   - Should fail when --require-subscription is used

6. **cus_test_enterprise** - Customer with enterprise subscription
   - Account age: >30 days old
   - Payment history: At least 1 successful payment
   - Active subscription to product "prod_test_enterprise"
   - Should pass verification with subscription requirement

### How to Create Test Customers in Stripe

1. Go to: https://dashboard.stripe.com/test/customers
2. Click "Add customer" or "New"
3. Fill in customer details:
   - Email: Use a unique email for each test customer
   - Name: Descriptive name (e.g., "Test Legitimate Customer")
   - Description: Note the purpose (e.g., "For Phase Mirror integration tests")
4. For customers needing payment history:
   - Go to the customer's page
   - Click "Actions" → "Create a payment"
   - Create a successful payment using a test card (4242 4242 4242 4242)
5. For delinquent customers:
   - Create an invoice that's past due
   - Or mark an invoice as uncollectible
6. For customers with subscriptions:
   - Create a product first (if you haven't already)
   - Add a subscription to the customer

## Running the Integration Tests

### Basic Test Run

```bash
# Set your Stripe test mode secret key
export STRIPE_SECRET_KEY=sk_test_your_secret_key_here

# Run the integration test script
./test-integration-verify.sh
```

### Manual Testing

You can also run individual test cases manually:

```bash
# Test 1: Legitimate customer (should pass)
pnpm cli verify stripe \
  --org-id test-org-1 \
  --stripe-customer cus_test_legitimate \
  --public-key test-key-1

# Test 2: New customer (should fail)
pnpm cli verify stripe \
  --org-id test-org-2 \
  --stripe-customer cus_test_new \
  --public-key test-key-2

# Test 5: Subscription required (should fail if no subscription)
pnpm cli verify stripe \
  --org-id test-org-5 \
  --stripe-customer cus_test_no_sub \
  --public-key test-key-5 \
  --require-subscription

# Test 6: Subscription with specific product (should pass)
pnpm cli verify stripe \
  --org-id test-org-6 \
  --stripe-customer cus_test_enterprise \
  --public-key test-key-6 \
  --require-subscription \
  --product-ids prod_test_enterprise

# List verified identities
pnpm cli verify list --method stripe_customer
```

## Test Scenarios

The integration test script covers 8 key scenarios:

1. ✅ **Legitimate Customer** - Should pass with valid customer
2. ❌ **Too New** - Should fail with account <30 days old
3. ❌ **No Payments** - Should fail with 0 successful payments
4. ❌ **Delinquent** - Should fail with unpaid invoices
5. ❌ **No Subscription** - Should fail when subscription required
6. ✅ **With Subscription** - Should pass with correct subscription
7. ❌ **Not Found** - Should fail with nonexistent customer
8. ❌ **Already Bound** - Should fail when customer already verified

## Expected Output

### Successful Verification

```
🔍 Verifying organization via Stripe...

✅ Stripe verification successful!

Stripe Customer Details:
  Customer ID: cus_test_legitimate
  Email: test@example.com
  Account Created: 2025-11-15T10:30:00.000Z
  Payment Count: 3
  Active Subscription: Yes
  Products: prod_PhaseMirrorPro
  Customer Type: company
  Business Verified: Yes

🔐 Generating cryptographic nonce...

✅ Identity stored successfully!

Identity Details:
  Org ID: test-org-1
  Verification Method: stripe_customer
  Verified At: 2026-02-04T01:30:00.000Z
  Stripe Customer ID: cus_test_legitimate
  Unique Nonce: 8f3d2a1b-c4e5-6f7g-8h9i-0j1k2l3m4n5o

Identity stored in .phase-mirror-data/identities.json
```

### Failed Verification

```
🔍 Verifying organization via Stripe...

❌ Verification failed: Customer account too new (15 days, minimum 30)
```

## Troubleshooting

### "STRIPE_SECRET_KEY environment variable not set"

**Solution**: Export your Stripe test mode secret key:
```bash
export STRIPE_SECRET_KEY=sk_test_your_key_here
```

### "Customer not found"

**Solution**: Make sure you've created the test customers in your Stripe test dashboard and are using the correct customer IDs.

### "Customer account too new"

This is expected for `cus_test_new`. For other customers, make sure they were created at least 30 days ago. You can either:
- Wait 30 days (not practical)
- Manually adjust the verification config (for testing only)
- Use an existing old test customer

### "Insufficient payment history"

**Solution**: Create a successful payment for the customer:
1. Go to the customer in Stripe dashboard
2. Click "Actions" → "Create a payment"
3. Use test card: 4242 4242 4242 4242
4. Complete the payment

## Configuration Options

The CLI verify command supports several configuration options:

```bash
oracle verify stripe \
  --org-id <your-org-id> \
  --stripe-customer <stripe-customer-id> \
  --public-key <your-public-key> \
  [--require-subscription] \
  [--product-ids <comma-separated-product-ids>] \
  [--verbose]
```

### Flags

- `--org-id`: Your organization ID (required)
- `--stripe-customer`: Stripe customer ID starting with `cus_` (required)
- `--public-key`: Your organization's public key for nonce binding (required)
- `--require-subscription`: Require an active subscription (optional)
- `--product-ids`: Comma-separated list of required product IDs (optional)
- `--verbose`: Show detailed verification information (optional)

## Environment Variables

- `STRIPE_SECRET_KEY`: Your Stripe secret key (required)
- `PHASE_MIRROR_DATA_DIR`: Directory for storing verification data (optional, defaults to `.phase-mirror-data`)

## Data Storage

Verified identities are stored in JSON files:

- `{data-dir}/identities.json` - Organization identities
- `{data-dir}/nonce-bindings.json` - Cryptographic nonce bindings

For tests, data is stored in `.phase-mirror-test-data/` directory.

## Cleaning Up Test Data

```bash
# Remove all test verification data
rm -rf .phase-mirror-test-data

# Remove individual identity
# (use the CLI in the future when revoke command is added)
```

## Next Steps

After successful integration testing:

1. Set up production Stripe customers
2. Configure production secret keys
3. Implement webhook monitoring for subscription changes
4. Set up monitoring and alerting for verification failures
5. Consider implementing automated verification for new customers

## Support

For issues or questions:
- GitHub Issues: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- Email: support@phasemirror.com
- Stripe integration: stripe@phasemirror.com
