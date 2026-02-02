#!/usr/bin/env bash
# Run E2E integration tests against staging

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export AWS_REGION="${AWS_REGION:-us-east-1}"
export ENVIRONMENT="${ENVIRONMENT:-staging}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "E2E Integration Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "Region: $AWS_REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$REPO_ROOT/packages/mirror-dissonance"

# Verify AWS credentials
echo "[1/4] Verifying AWS credentials..."
if ! aws sts get-caller-identity &>/dev/null; then
  echo "      ✗ AWS credentials not configured"
  exit 1
fi
echo "      ✓ AWS credentials valid"

# Verify infrastructure
echo ""
echo "[2/4] Verifying infrastructure..."
if ! pnpm test -- src/__tests__/e2e/setup.test.ts --testNamePattern="infrastructure" &>/dev/null; then
  echo "      ✗ Infrastructure not ready"
  echo "      Run: cd infra/terraform && terraform apply -var-file=staging.tfvars"
  exit 1
fi
echo "      ✓ Infrastructure ready"

# Run tests
echo ""
echo "[3/4] Running E2E tests..."
pnpm test -- src/__tests__/e2e/ --testTimeout=30000 --verbose

# Summary
echo ""
echo "[4/4] Test summary..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ E2E tests complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
