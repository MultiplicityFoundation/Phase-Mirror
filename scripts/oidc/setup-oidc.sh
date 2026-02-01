#!/usr/bin/env bash
# Complete OIDC setup for GitHub Actions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GitHub Actions OIDC Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Create OIDC provider
echo "[1/4] Creating OIDC provider..."
"$SCRIPT_DIR/create-oidc-provider.sh"

echo ""
echo "[2/4] Deploying IAM roles via Terraform..."

cd "$REPO_ROOT/infra/terraform"

# Initialize if needed
if [ ! -d ".terraform" ]; then
  terraform init
fi

# Select staging workspace
terraform workspace select staging || terraform workspace new staging

# Plan
terraform plan -var-file=staging.tfvars -target=module.iam -out=iam.tfplan

echo ""
echo "Review the plan above. Apply? (yes/no)"
read -r APPLY

if [ "$APPLY" != "yes" ]; then
  echo "Setup cancelled"
  exit 0
fi

# Apply
terraform apply iam.tfplan

echo ""
echo "[3/4] Retrieving role ARNs..."

TERRAFORM_ROLE_ARN=$(terraform output -raw github_terraform_role_arn)
DEPLOY_ROLE_ARN=$(terraform output -raw github_deploy_role_arn)

echo "      Terraform Role: $TERRAFORM_ROLE_ARN"
echo "      Deploy Role:    $DEPLOY_ROLE_ARN"

echo ""
echo "[4/4] GitHub Secrets Configuration"
echo ""
echo "Add these secrets to your GitHub repository:"
echo "  Settings → Secrets and variables → Actions → New repository secret"
echo ""
echo "Secret Name: AWS_TERRAFORM_ROLE_ARN"
echo "Secret Value:"
echo "  $TERRAFORM_ROLE_ARN"
echo ""
echo "Secret Name: AWS_DEPLOY_ROLE_ARN"
echo "Secret Value:"
echo "  $DEPLOY_ROLE_ARN"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ OIDC setup complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next: Add secrets to GitHub and trigger a workflow"
