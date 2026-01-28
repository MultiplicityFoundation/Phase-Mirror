#!/bin/bash
# Terraform plan script
# Generates execution plan showing what changes will be made

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "$SCRIPT_DIR/../infra/terraform" && pwd)"

# Default to staging environment
ENVIRONMENT="${1:-staging}"

if [[ ! "$ENVIRONMENT" =~ ^(staging|production|dev)$ ]]; then
    echo "❌ Error: Invalid environment '$ENVIRONMENT'"
    echo "Usage: $0 [staging|production|dev]"
    exit 1
fi

echo "📋 Generating Terraform plan for $ENVIRONMENT..."
echo "Directory: $TERRAFORM_DIR"
echo ""

cd "$TERRAFORM_DIR"

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Error: Terraform is not installed"
    exit 1
fi

# Initialize if needed
if [ ! -d ".terraform" ]; then
    echo "📦 Initializing Terraform..."
    terraform init
fi

# Generate plan
PLAN_FILE="tfplan-$ENVIRONMENT-$(date +%Y%m%d-%H%M%S)"
VAR_FILE="$ENVIRONMENT.tfvars"

if [ ! -f "$VAR_FILE" ]; then
    echo "❌ Error: Variable file $VAR_FILE not found"
    exit 1
fi

echo "📝 Running terraform plan with $VAR_FILE..."
terraform plan -var-file="$VAR_FILE" -out="$PLAN_FILE"

echo ""
echo "✅ Plan saved to: $PLAN_FILE"
echo ""
echo "To apply this plan, run:"
echo "  terraform apply $PLAN_FILE"
echo ""
echo "To see the plan in detail:"
echo "  terraform show $PLAN_FILE"
