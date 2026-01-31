#!/bin/bash
set -euo pipefail

ENVIRONMENT="${1:-production}"
REGION="${2:-us-east-1}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Deploying Mirror Dissonance infrastructure to ${ENVIRONMENT}"
echo "Repository root: ${REPO_ROOT}"

cd "${REPO_ROOT}/infra/terraform"

# Validate
echo "📋 Validating Terraform configuration..."
terraform validate

# Plan
echo "📊 Creating deployment plan..."
terraform plan \
  -var="environment=${ENVIRONMENT}" \
  -var="region=${REGION}" \
  -out="${ENVIRONMENT}.tfplan"

# Manual approval gate
echo ""
echo "⚠️  Review the plan above carefully."
read -p "Continue with apply? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Deployment cancelled"
  exit 1
fi

# Apply
echo "🔧 Applying infrastructure changes..."
terraform apply "${ENVIRONMENT}.tfplan"

# Verify
echo "✅ Deployment complete. Verifying resources..."
terraform output

echo ""
echo "📝 Next steps:"
echo "  1. Verify tables in AWS Console"
echo "  2. Enable PITR (Day 24)"
echo "  3. Configure CloudWatch alarms (Day 25)"
