#!/bin/bash
# Integration Test Script for Stripe Customer Verification
# 
# This script demonstrates the 8 integration test scenarios from the blueprint.
# Note: These tests require actual Stripe test mode customers to be set up.
#
# Setup:
# 1. Create test customers in your Stripe test dashboard
# 2. Set STRIPE_SECRET_KEY environment variable
# 3. Run this script to test all scenarios

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Stripe Customer Verification Integration Tests     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
if [ -z "$STRIPE_SECRET_KEY" ]; then
    echo -e "${RED}ERROR: STRIPE_SECRET_KEY environment variable not set${NC}"
    echo "Please set your Stripe test mode secret key:"
    echo "  export STRIPE_SECRET_KEY=sk_test_your_key"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}ERROR: pnpm not found${NC}"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi

# Data directory for test identities
TEST_DATA_DIR=".phase-mirror-test-data"
export PHASE_MIRROR_DATA_DIR="$TEST_DATA_DIR"

echo -e "${YELLOW}Using test data directory: $TEST_DATA_DIR${NC}"
echo ""

# Clean up test data directory
rm -rf "$TEST_DATA_DIR"
mkdir -p "$TEST_DATA_DIR"

# Test counter
PASSED=0
FAILED=0

# Helper function to run a test
run_test() {
    local test_num=$1
    local description=$2
    local expected_result=$3  # "pass" or "fail"
    shift 3
    local cmd="$@"
    
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Test $test_num: $description${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
    echo "Command: $cmd"
    echo ""
    
    if eval "$cmd"; then
        if [ "$expected_result" == "pass" ]; then
            echo -e "${GREEN}✓ Test $test_num PASSED (as expected)${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Test $test_num FAILED (expected to fail but passed)${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        if [ "$expected_result" == "fail" ]; then
            echo -e "${GREEN}✓ Test $test_num PASSED (failed as expected)${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ Test $test_num FAILED (expected to pass but failed)${NC}"
            FAILED=$((FAILED + 1))
        fi
    fi
    echo ""
}

echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}   NOTE: These tests require actual Stripe customers   ${NC}"
echo -e "${YELLOW}   Create them in your Stripe test dashboard first     ${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "To create test customers:"
echo "1. Go to: https://dashboard.stripe.com/test/customers"
echo "2. Create customers with different characteristics:"
echo "   - cus_test_legitimate: Old account with payments"
echo "   - cus_test_new: Recently created account"
echo "   - cus_test_no_payments: Old account with no payments"
echo "   - cus_test_delinquent: Account with unpaid invoices"
echo "   - cus_test_no_sub: Account without subscription"
echo "   - cus_test_enterprise: Account with enterprise subscription"
echo ""
read -p "Press Enter when ready to run tests (or Ctrl+C to cancel)..."
echo ""

# Test 1: Legitimate customer (should pass)
run_test 1 \
    "Legitimate customer with payment history" \
    "pass" \
    "pnpm cli verify stripe \
      --org-id test-org-1 \
      --stripe-customer cus_test_legitimate \
      --public-key test-key-1"

# Test 2: New customer (should fail - too new)
run_test 2 \
    "New customer (should fail - too new)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-2 \
      --stripe-customer cus_test_new \
      --public-key test-key-2"

# Test 3: Customer with no payments (should fail - no payment history)
run_test 3 \
    "Customer with no payments (should fail)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-3 \
      --stripe-customer cus_test_no_payments \
      --public-key test-key-3"

# Test 4: Delinquent customer (should fail - unpaid invoices)
run_test 4 \
    "Delinquent customer (should fail)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-4 \
      --stripe-customer cus_test_delinquent \
      --public-key test-key-4"

# Test 5: Customer without subscription when required (should fail)
run_test 5 \
    "Customer without subscription when required (should fail)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-5 \
      --stripe-customer cus_test_no_sub \
      --public-key test-key-5 \
      --require-subscription"

# Test 6: Customer with correct subscription (should pass)
run_test 6 \
    "Customer with correct subscription (should pass)" \
    "pass" \
    "pnpm cli verify stripe \
      --org-id test-org-6 \
      --stripe-customer cus_test_enterprise \
      --public-key test-key-6 \
      --require-subscription \
      --product-ids prod_test_enterprise"

# Test 7: Nonexistent customer (should fail - not found)
run_test 7 \
    "Nonexistent customer (should fail - not found)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-7 \
      --stripe-customer cus_does_not_exist \
      --public-key test-key-7"

# Test 8: Duplicate verification (should fail - already bound)
# This uses the same customer from Test 1
run_test 8 \
    "Duplicate verification (should fail - already bound)" \
    "fail" \
    "pnpm cli verify stripe \
      --org-id test-org-8 \
      --stripe-customer cus_test_legitimate \
      --public-key test-key-8"

# Summary
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}              Test Results Summary                     ${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "Total Tests: $((PASSED + FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "Failed: 0"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All integration tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some integration tests failed${NC}"
    exit 1
fi
