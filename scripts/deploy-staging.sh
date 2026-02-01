#!/usr/bin/env bash
# Deploy Phase Mirror staging infrastructure

set -euo pipefail

cd "$(dirname "$0")/../infra/terraform"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror Staging Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Verify backend
echo "[1/6] Verifying Terraform backend..."
if ! ../../scripts/verify-backend.sh > /dev/null 2>&1; then
  echo "      ✗ Backend verification failed"
  exit 1
fi
echo "      ✓ Backend verified"

# Step 2: Initialize Terraform
echo ""
echo "[2/6] Initializing Terraform..."
terraform init -reconfigure

# Step 3: Create/select staging workspace
echo ""
echo "[3/6] Selecting staging workspace..."
terraform workspace select staging 2>/dev/null || terraform workspace new staging
echo "      ✓ Workspace: $(terraform workspace show)"

# Step 4: Validate configuration
echo ""
echo "[4/6] Validating configuration..."
terraform validate
echo "      ✓ Configuration valid"

# Step 5: Generate plan
echo ""
echo "[5/6] Generating deployment plan..."
terraform plan -var-file=staging.tfvars -out=staging.tfplan

# Step 6: Review and apply
echo ""
echo "[6/6] Review plan above. Apply? (yes/no)"
read -r APPLY

if [ "$APPLY" = "yes" ]; then
  terraform apply staging.tfplan
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✓ Staging deployment complete"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Outputs:"
  terraform output -json | jq '.'
  
  # Save outputs
  terraform output -json > ../../staging-outputs.json
  echo ""
  echo "Outputs saved to: staging-outputs.json"
else
  echo "Deployment cancelled"
  rm -f staging.tfplan
fi
