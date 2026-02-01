#!/bin/bash
# Create Terraform workspaces for different environments

set -e

cd infra/terraform

echo "=== Creating Terraform Workspaces ==="
echo

# Function to create workspace
create_workspace() {
  local WORKSPACE=$1
  echo "Creating workspace: $WORKSPACE"
  
  if terraform workspace select $WORKSPACE 2>/dev/null; then
    echo "⚠️  Workspace '$WORKSPACE' already exists"
  else
    terraform workspace new $WORKSPACE
    echo "✅ Workspace '$WORKSPACE' created"
  fi
  echo
}

# Create staging workspace
create_workspace "staging"

# Create production workspace
create_workspace "prod"

# Switch back to default
terraform workspace select default

# List all workspaces
echo "Available Workspaces:"
terraform workspace list

echo
echo "✅ Workspace setup complete"
echo
echo "Usage:"
echo "  Switch to staging:    terraform workspace select staging"
echo "  Switch to production: terraform workspace select prod"
echo "  Show current:         terraform workspace show"
