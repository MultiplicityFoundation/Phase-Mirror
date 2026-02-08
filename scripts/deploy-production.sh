#!/usr/bin/env bash
# Deploy Phase Mirror production infrastructure
#
# Prerequisites:
#   - Terraform backend initialised (scripts/bootstrap-terraform-backend.sh)
#   - Staging deployment verified (scripts/verify-staging.sh)
#   - Production nonce bootstrapped (scripts/bootstrap-nonce.sh production)
#   - PRODUCTION_DEPLOYMENT_CHECKLIST.md reviewed and signed off

set -euo pipefail

REGION="${1:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror Production Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Repository root: ${REPO_ROOT}"
echo ""

cd "${REPO_ROOT}/infra/terraform"

# Step 1: Verify backend
echo "[1/7] Verifying Terraform backend..."
if ! "${REPO_ROOT}/scripts/verify-backend.sh" > /dev/null 2>&1; then
  echo "      ✗ Backend verification failed"
  exit 1
fi
echo "      ✓ Backend verified"

# Step 2: Initialize Terraform
echo ""
echo "[2/7] Initializing Terraform..."
terraform init -reconfigure

# Step 3: Create/select production workspace
echo ""
echo "[3/7] Selecting production workspace..."
terraform workspace select production 2>/dev/null || terraform workspace new production
echo "      ✓ Workspace: $(terraform workspace show)"

# Step 4: Validate configuration
echo ""
echo "[4/7] Validating configuration..."
terraform validate
echo "      ✓ Configuration valid"

# Step 5: Generate plan
echo ""
echo "[5/7] Generating deployment plan..."
terraform plan -var-file=production.tfvars -out=production.tfplan

# Step 6: Manual review gate
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠  REVIEW the plan above carefully."
echo "   Confirm:"
echo "     - No unexpected deletions"
echo "     - Resource counts match staging"
echo "     - Tags and naming correct"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "[6/7] Apply? (yes/no)"
read -r APPLY

if [ "$APPLY" != "yes" ]; then
  echo "Deployment cancelled"
  rm -f production.tfplan
  exit 1
fi

# Step 7: Apply
terraform apply production.tfplan

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Production deployment complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Outputs:"
terraform output -json | jq '.'

# Save outputs
terraform output -json > "${REPO_ROOT}/production-outputs.json"
echo ""
echo "Outputs saved to: production-outputs.json"
echo ""
echo "Next steps:"
echo "  1. Run ./scripts/verify-pitr.sh production"
echo "  2. Complete docs/ops/PRODUCTION_DEPLOYMENT_CHECKLIST.md"
echo "  3. Set AWS_ROLE_ARN_PRODUCTION in GitHub secrets"
echo "  4. Subscribe ops email to SNS topic"
