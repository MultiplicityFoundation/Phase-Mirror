#!/usr/bin/env bash
# Run all backend verification tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Backend Test Suite"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
  local test_name="$1"
  local test_script="$2"
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Running: $test_name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  if "$SCRIPT_DIR/$test_script"; then
    echo ""
    echo "✓ PASSED: $test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    echo ""
    echo "✗ FAILED: $test_name"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
  
  echo ""
}

# Test 1: Verify backend resources exist
run_test "Backend Resources Verification" "verify-backend.sh"

# Test 2: Test Terraform initialization
run_test "Terraform Initialization" "test-terraform-init.sh"

# Test 3: LocalStack backend (optional)
if docker ps --filter "name=localstack" --format "{{.Names}}" | grep -q .; then
  run_test "LocalStack Backend Test" "test-backend-localstack.sh"
else
  echo "⏭  Skipping LocalStack test (LocalStack not running)"
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Test Suite Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $TESTS_FAILED -eq 0 ]; then
  echo "✓ All tests passed"
  exit 0
else
  echo "✗ Some tests failed"
  exit 1
fi
