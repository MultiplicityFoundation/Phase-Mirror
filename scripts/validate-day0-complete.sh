#!/bin/bash
# Validate Day 0 completion before starting Week 1

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Day 0 Completion Validation${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo

PASS_COUNT=0
FAIL_COUNT=0

check() {
  local description=$1
  local command=$2
  
  if eval "$command" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $description"
    ((PASS_COUNT++))
    return 0
  else
    echo -e "${RED}✗${NC} $description"
    ((FAIL_COUNT++))
    return 1
  fi
}

check_file() {
  local description=$1
  local file=$2
  
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $description"
    ((PASS_COUNT++))
    return 0
  else
    echo -e "${RED}✗${NC} $description (file: $file)"
    ((FAIL_COUNT++))
    return 1
  fi
}

# Tracking Systems
echo "## Tracking Systems"
check_file "MVP Completion Tracker created" "MVP_COMPLETION_TRACKER.md"
check_file "Environment baseline documented" "ENVIRONMENT.md"
check_file "Progress tracking script created" "scripts/update-progress.sh"
check "Progress script is executable" "test -x scripts/update-progress.sh"
echo

# Week 0 Infrastructure (optional but recommended)
echo "## Week 0 Infrastructure"
check_file "Terraform backend configured" "infra/terraform/backend.tf"
check "Terraform initialized" "test -d infra/terraform/.terraform"
check_file "Backend documentation exists" "docs/ops/TERRAFORM_BACKEND_OPERATIONS.md"
echo

# Git Workflow
echo "## Git Workflow"
check "On MVP feature branch" "git rev-parse --abbrev-ref HEAD | grep -qE '(mvp|copilot|feature)'"
check "Day 0 changes committed" "git log --oneline | head -5 | grep -qE '(Day 0|baseline|tracking|documentation|Day -1|AWS)'"
check "No uncommitted tracker changes" "! git diff MVP_COMPLETION_TRACKER.md | grep -q '^[\+\-]'"
echo

# Development Environment
echo "## Development Environment"
check "Node.js available" "command -v node"
check "pnpm available" "command -v pnpm"
check "AWS CLI available" "command -v aws"
check "Terraform available" "command -v terraform"
check "Dependencies installed" "test -d node_modules"
check "Build successful" "test -d packages/mirror-dissonance/dist || test -d dist"
echo

# Documentation
echo "## Documentation"
check_file "Week 1 prep guide created" "docs/WEEK_1_PREP.md"
check_file "Known issues documented" "docs/known-issues.md"
check_file "README exists" "README.md"
echo

# AWS Resources (if Week 0 completed)
echo "## AWS Resources (Week 0)"
if [ -f "infra/terraform/backend.tf" ]; then
  STATE_BUCKET=$(grep 'bucket =' infra/terraform/backend.tf | awk -F'"' '{print $2}' | head -1)
  LOCK_TABLE=$(grep 'dynamodb_table =' infra/terraform/backend.tf | awk -F'"' '{print $2}' | head -1)
  
  if [ -n "$STATE_BUCKET" ]; then
    check "S3 state bucket exists" "aws s3 ls s3://$STATE_BUCKET 2>/dev/null"
  fi
  
  if [ -n "$LOCK_TABLE" ]; then
    check "DynamoDB lock table exists" "aws dynamodb describe-table --table-name $LOCK_TABLE --region us-east-1 2>/dev/null"
  fi
else
  echo -e "${YELLOW}⊘${NC} Terraform backend not configured (Week 0 incomplete)"
fi
echo

# Summary
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  Validation Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}✅ Day 0 Complete - Ready for Week 1!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo
  echo "Next steps:"
  echo "  1. Review docs/WEEK_1_PREP.md"
  echo "  2. Start Week 1 Day 1: Implementation Audit"
  echo "  3. Run: ./scripts/update-progress.sh 1"
  exit 0
else
  echo -e "${RED}═══════════════════════════════════════${NC}"
  echo -e "${RED}❌ Day 0 Incomplete${NC}"
  echo -e "${RED}═══════════════════════════════════════${NC}"
  echo
  echo "Please resolve failed checks above before proceeding to Week 1"
  exit 1
fi
