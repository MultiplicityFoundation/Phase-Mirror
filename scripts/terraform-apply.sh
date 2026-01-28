#!/bin/bash
# Terraform apply script
# Applies Terraform changes to AWS infrastructure
# Requires confirmation before proceeding

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

echo "🚀 Applying Terraform configuration for $ENVIRONMENT..."
echo "Directory: $TERRAFORM_DIR"
echo ""

# Production warning
if [ "$ENVIRONMENT" = "production" ]; then
    echo "⚠️  WARNING: You are about to apply changes to PRODUCTION!"
    echo ""
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
fi

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

VAR_FILE="$ENVIRONMENT.tfvars"

if [ ! -f "$VAR_FILE" ]; then
    echo "❌ Error: Variable file $VAR_FILE not found"
    exit 1
fi

echo "🔄 Applying Terraform configuration..."
terraform apply -var-file="$VAR_FILE"

echo ""
echo "✅ Terraform apply complete for $ENVIRONMENT!"
echo ""
echo "To see what was created:"
echo "  terraform show"
echo ""
echo "To see outputs:"
echo "  terraform output"
