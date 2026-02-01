#!/bin/bash
# Phase Mirror Environment Validation Script

# Don't exit on error - we want to see all failures
set +e

# Ensure PATH includes common locations
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

echo "=== Phase Mirror Environment Validation ==="
echo

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_command() {
  if command -v $1 &> /dev/null; then
    echo -e "${GREEN}✓${NC} $1 is installed"
    $1 --version 2>&1 | head -n 1 | sed 's/^/  /'
    return 0
  else
    echo -e "${RED}✗${NC} $1 is NOT installed"
    return 1
  fi
}

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1 exists"
    return 0
  else
    echo -e "${RED}✗${NC} $1 is missing"
    return 1
  fi
}

check_directory() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1 exists"
    return 0
  else
    echo -e "${RED}✗${NC} $1 is missing"
    return 1
  fi
}

# Check prerequisites
echo "## Prerequisites"
check_command node
check_command pnpm
check_command git
check_command aws
check_command terraform
echo

# Check repository structure
echo "## Repository Structure"
check_directory "packages/mirror-dissonance"
check_directory "packages/cli"
check_directory "infra/terraform"
check_directory "docs/adr"
check_file "package.json"
check_file "pnpm-workspace.yaml"
check_file "tsconfig.json"
echo

# Check build artifacts
echo "## Build Status"
check_directory "packages/mirror-dissonance/dist"
check_directory "packages/cli/dist"
check_directory "node_modules"
check_file "pnpm-lock.yaml"
echo

# Check AWS access
echo "## AWS Connectivity"
if aws sts get-caller-identity &> /dev/null; then
  echo -e "${GREEN}✓${NC} AWS credentials configured"
  aws sts get-caller-identity | jq -r '"  Account: \(.Account) | User: \(.Arn)"' 2>/dev/null || aws sts get-caller-identity --query '[Account,Arn]' --output text | awk '{print "  Account: "$1" | User: "$2}'
else
  echo -e "${RED}✗${NC} AWS credentials NOT configured or invalid"
fi
echo

# Check Git status
echo "## Git Status"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo -e "${GREEN}✓${NC} Current branch: $BRANCH"

UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -eq 0 ]; then
  echo -e "${GREEN}✓${NC} Working tree clean"
else
  echo -e "${YELLOW}⚠${NC} $UNCOMMITTED uncommitted changes"
fi
echo

# Test summary
echo "## Summary"
echo -e "${GREEN}Environment validation complete${NC}"
echo
echo "Next steps:"
echo "  1. Run 'pnpm test' to verify test suite"
echo "  2. Review docs/QUICKSTART.md"
echo "  3. Proceed to Day -1: AWS Infrastructure Bootstrap"
