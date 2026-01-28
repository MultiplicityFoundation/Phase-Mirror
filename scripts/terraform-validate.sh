#!/bin/bash
# Terraform validation script
# Validates Terraform configuration without making changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TERRAFORM_DIR="$(cd "$SCRIPT_DIR/../infra/terraform" && pwd)"

echo "🔍 Validating Terraform configuration..."
echo "Directory: $TERRAFORM_DIR"
echo ""

cd "$TERRAFORM_DIR"

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "❌ Error: Terraform is not installed"
    echo "Please install Terraform: https://www.terraform.io/downloads"
    exit 1
fi

# Initialize Terraform (downloads providers)
echo "📦 Initializing Terraform..."
terraform init -upgrade

# Validate configuration
echo ""
echo "✅ Running terraform validate..."
terraform validate

# Format check
echo ""
echo "🎨 Checking Terraform formatting..."
if terraform fmt -check -recursive; then
    echo "✅ Terraform files are properly formatted"
else
    echo "⚠️  Some files need formatting. Run 'terraform fmt -recursive' to fix"
fi

echo ""
echo "✅ Terraform validation complete!"
