#!/bin/bash
# Check AWS service limits for Phase Mirror deployment
# This script verifies that AWS service quotas are sufficient for deployment

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "=== AWS Service Limits Check ==="
echo ""
echo "Region: ${AWS_REGION:-us-east-1}"
echo "Date: $(date)"
echo ""

# Function to print status with color
print_status() {
  local current=$1
  local limit=$2
  local service=$3
  
  # Calculate percentage
  local percent=$((current * 100 / limit))
  
  if [ $percent -lt 70 ]; then
    echo -e "${GREEN}✓${NC} ${service}: ${current} / ${limit} (${percent}%)"
  elif [ $percent -lt 90 ]; then
    echo -e "${YELLOW}⚠${NC} ${service}: ${current} / ${limit} (${percent}%) - Approaching limit"
  else
    echo -e "${RED}✗${NC} ${service}: ${current} / ${limit} (${percent}%) - CRITICAL: Near limit!"
  fi
}

# Check AWS credentials
echo "## AWS Credentials"
if aws sts get-caller-identity &> /dev/null; then
  ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
  echo -e "${GREEN}✓${NC} Authenticated"
  echo "  Account: ${ACCOUNT_ID}"
else
  echo -e "${RED}✗${NC} Not authenticated"
  echo "  Run: aws configure"
  exit 1
fi
echo ""

# Check DynamoDB limits
echo "## DynamoDB Tables"
DYNAMODB_TABLES=$(aws dynamodb list-tables --query 'length(TableNames)' --output text 2>/dev/null || echo "0")
print_status "$DYNAMODB_TABLES" "2500" "Tables in region"

# Check if approaching limit
if [ "$DYNAMODB_TABLES" -gt 2400 ]; then
  echo -e "${YELLOW}  ⚠${NC} Warning: Approaching DynamoDB table limit"
  echo "     Consider requesting a limit increase"
fi
echo ""

# Check SSM parameters
echo "## SSM Parameter Store"
SSM_PARAMS=$(aws ssm describe-parameters --query 'length(Parameters)' --output text 2>/dev/null || echo "0")
print_status "$SSM_PARAMS" "10000" "Standard parameters"

# Check for Phase Mirror specific parameters
echo "  Phase Mirror parameters:"
GUARDIAN_PARAMS=$(aws ssm describe-parameters --parameter-filters "Key=Name,Option=BeginsWith,Values=/guardian/" --query 'length(Parameters)' --output text 2>/dev/null || echo "0")
echo "    /guardian/*: ${GUARDIAN_PARAMS}"
echo ""

# Check S3 buckets
echo "## S3 Buckets"
S3_BUCKETS=$(aws s3 ls 2>/dev/null | wc -l || echo "0")
print_status "$S3_BUCKETS" "1000" "Buckets in account"

# Check for Phase Mirror buckets
echo "  Phase Mirror buckets:"
aws s3 ls 2>/dev/null | grep -i "mirror-dissonance" | awk '{print "    " $3}' || echo "    (none found)"
echo ""

# Check IAM roles
echo "## IAM Roles"
IAM_ROLES=$(aws iam list-roles --query 'length(Roles)' --output text 2>/dev/null || echo "0")
print_status "$IAM_ROLES" "5000" "Roles in account"

# Check for Phase Mirror roles
echo "  Phase Mirror roles:"
aws iam list-roles --query 'Roles[?contains(RoleName, `guardian`) || contains(RoleName, `mirror`)].RoleName' --output text 2>/dev/null | tr '\t' '\n' | sed 's/^/    /' || echo "    (none found)"
echo ""

# Check VPC limits
echo "## VPC Resources"
VPCS=$(aws ec2 describe-vpcs --query 'length(Vpcs)' --output text 2>/dev/null || echo "0")
print_status "$VPCS" "5" "VPCs in region"

# Note: Phase Mirror uses serverless architecture (no VPC required for now)
echo "  Note: Phase Mirror uses serverless architecture (DynamoDB, Lambda, S3)"
echo "        VPC not required for current deployment"
echo ""

# Check Lambda functions (if used in future)
echo "## Lambda Functions"
LAMBDA_FUNCTIONS=$(aws lambda list-functions --query 'length(Functions)' --output text 2>/dev/null || echo "0")
print_status "$LAMBDA_FUNCTIONS" "1000" "Functions in region"
echo ""

# Check CloudWatch Log Groups
echo "## CloudWatch Logs"
LOG_GROUPS=$(aws logs describe-log-groups --query 'length(logGroups)' --output text 2>/dev/null || echo "0")
print_status "$LOG_GROUPS" "1000000" "Log groups in region"
echo ""

# Summary
echo "=== Summary ==="
echo ""

# Calculate overall status
WARNINGS=0
CRITICAL=0

if [ "$DYNAMODB_TABLES" -gt 2400 ]; then
  CRITICAL=$((CRITICAL + 1))
fi

if [ "$S3_BUCKETS" -gt 900 ]; then
  WARNINGS=$((WARNINGS + 1))
fi

if [ "$IAM_ROLES" -gt 4500 ]; then
  WARNINGS=$((WARNINGS + 1))
fi

if [ "$CRITICAL" -gt 0 ]; then
  echo -e "${RED}✗${NC} CRITICAL: ${CRITICAL} service(s) near limit"
  echo "   Action required: Request limit increases before deployment"
  exit 2
elif [ "$WARNINGS" -gt 0 ]; then
  echo -e "${YELLOW}⚠${NC} WARNING: ${WARNINGS} service(s) approaching limit"
  echo "   Consider monitoring and planning for limit increases"
  exit 1
else
  echo -e "${GREEN}✓${NC} All service limits OK for deployment"
  echo ""
  echo "Next steps:"
  echo "  1. Review docs/ops/TERRAFORM_BACKEND.md"
  echo "  2. Run: cd infra/terraform && terraform init"
  echo "  3. Deploy infrastructure: terraform plan"
fi

echo ""
echo "Note: Run this script periodically to monitor service usage"
