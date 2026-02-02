#!/usr/bin/env bash
# Run performance benchmarks

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

export AWS_REGION="${AWS_REGION:-us-east-1}"
export ENVIRONMENT="${ENVIRONMENT:-staging}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Performance Benchmarks"
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

# Build package
echo ""
echo "[2/4] Building package..."
npm run build

# Run benchmarks
echo ""
echo "[3/4] Running benchmarks..."
echo ""

# Crypto benchmarks
echo "▸ Cryptographic Operations..."
npm test -- src/__tests__/benchmarks/crypto.bench.ts --testTimeout=120000

# DynamoDB benchmarks
echo ""
echo "▸ DynamoDB Operations..."
npm test -- src/__tests__/benchmarks/dynamodb.bench.ts --testTimeout=120000

# E2E workflow benchmarks
echo ""
echo "▸ End-to-End Workflows..."
npm test -- src/__tests__/benchmarks/e2e-workflow.bench.ts --testTimeout=120000

# Load testing (optional - takes 5+ minutes)
if [ "${RUN_LOAD_TESTS:-false}" = "true" ]; then
  echo ""
  echo "▸ Load Testing (5+ minutes)..."
  npm test -- src/__tests__/benchmarks/load.bench.ts --testTimeout=600000
fi

# Generate summary
echo ""
echo "[4/4] Generating summary..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Benchmarks complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Results saved to test output"
echo ""
echo "To run load tests:"
echo "  RUN_LOAD_TESTS=true ./scripts/test/run-benchmarks.sh"
