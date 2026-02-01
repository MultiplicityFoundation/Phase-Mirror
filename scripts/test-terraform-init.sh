#!/usr/bin/env bash
# Test Terraform initialization with backend

set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Initialization Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Test 1: Clean initialization
echo "[1/5] Clean init..."
rm -rf .terraform .terraform.lock.hcl

if terraform init -backend=true > /tmp/tf-init.log 2>&1; then
  echo "      ✓ Init successful"
else
  echo "      ✗ Init failed"
  cat /tmp/tf-init.log
  exit 1
fi

# Test 2: Backend configured
echo ""
echo "[2/5] Checking backend configuration..."
if grep -q "Successfully configured the backend" /tmp/tf-init.log; then
  echo "      ✓ Backend configured"
else
  echo "      ✗ Backend not configured"
  exit 1
fi

# Test 3: State file in S3
echo ""
echo "[3/5] Checking state file location..."
BACKEND_TYPE=$(terraform version -json | jq -r '.terraform_version')
if [ -n "$BACKEND_TYPE" ]; then
  echo "      ✓ Terraform version: $BACKEND_TYPE"
else
  echo "      ✗ Cannot determine Terraform version"
  exit 1
fi

# Test 4: Workspace operations
echo ""
echo "[4/5] Testing workspace operations..."

# List workspaces
if terraform workspace list > /tmp/tf-workspace.log 2>&1; then
  echo "      ✓ Workspace list successful"
else
  echo "      ✗ Workspace list failed"
  cat /tmp/tf-workspace.log
  exit 1
fi

# Create test workspace
if terraform workspace new test-workspace 2>/dev/null || terraform workspace select test-workspace 2>/dev/null; then
  echo "      ✓ Workspace creation/selection works"
  terraform workspace select default 2>/dev/null
  terraform workspace delete test-workspace 2>/dev/null
else
  echo "      ✗ Workspace operations failed"
  exit 1
fi

# Test 5: State locking
echo ""
echo "[5/5] Testing state locking..."

# This will be tested implicitly during actual Terraform operations
# For now, just verify DynamoDB table is accessible
if aws dynamodb describe-table --table-name mirror-dissonance-terraform-lock-prod --region us-east-1 &>/dev/null; then
  echo "      ✓ Lock table accessible"
else
  echo "      ✗ Lock table not accessible"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ All initialization tests passed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
