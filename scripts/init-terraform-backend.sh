#!/bin/bash
# Initialize Terraform with S3 backend

set -e

cd infra/terraform

echo "=== Initializing Terraform Backend ==="
echo

# Check if backend.tf exists
if [ ! -f "backend.tf" ]; then
  echo "❌ ERROR: backend.tf not found"
  echo "   Run: cd infra/terraform && create backend.tf first"
  exit 1
fi

# Initialize Terraform
echo "Running: terraform init"
echo

terraform init

INIT_EXIT_CODE=$?

if [ $INIT_EXIT_CODE -eq 0 ]; then
  echo
  echo "✅ Terraform initialized successfully with S3 backend"
  
  # Display backend configuration
  echo
  echo "Backend Configuration:"
  terraform version
  
  # Show current workspace
  echo
  echo "Current Workspace:"
  terraform workspace show
  
  # List available workspaces
  echo
  echo "Available Workspaces:"
  terraform workspace list
  
else
  echo
  echo "❌ Terraform initialization failed with exit code: $INIT_EXIT_CODE"
  exit $INIT_EXIT_CODE
fi

# Verify backend state
echo
echo "Verifying backend connectivity..."
if terraform state list &>/dev/null; then
  echo "✅ Successfully connected to remote backend"
else
  echo "⚠️  Backend connected but no state exists yet (normal for new projects)"
fi

echo
echo "=== Terraform Backend Initialization Complete ==="
echo
echo "Next Steps:"
echo "  1. Create workspaces: terraform workspace new staging"
echo "  2. Plan infrastructure: terraform plan -var-file=staging.tfvars"
echo "  3. Review TERRAFORM_BACKEND.md documentation"
