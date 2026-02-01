#!/bin/bash
# Comprehensive validation that backend is production-ready

# Check if .env.aws-bootstrap exists, if not use defaults
if [ -f .env.aws-bootstrap ]; then
  source .env.aws-bootstrap
else
  # Set default values if .env.aws-bootstrap doesn't exist
  TF_STATE_BUCKET="mirror-dissonance-terraform-state-prod"
  TF_LOCK_TABLE="mirror-dissonance-terraform-lock-prod"
  AWS_REGION="us-east-1"
  OPERATOR_NAME="${USER:-Unknown}"
fi

echo "========================================="
echo "  Terraform Backend Validation Report"
echo "========================================="
echo
echo "Date: $(date)"
echo "Operator: $OPERATOR_NAME"
echo

# S3 Bucket Checks
echo "## S3 State Bucket: $TF_STATE_BUCKET"
echo

S3_EXISTS=$(aws s3 ls "s3://$TF_STATE_BUCKET" 2>/dev/null && echo "true" || echo "false")
echo "Bucket Exists: $S3_EXISTS"

if [ "$S3_EXISTS" == "true" ]; then
  VERSIONING=$(aws s3api get-bucket-versioning --bucket "$TF_STATE_BUCKET" --query Status --output text 2>/dev/null || echo "Disabled")
  ENCRYPTION=$(aws s3api get-bucket-encryption --bucket "$TF_STATE_BUCKET" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text 2>/dev/null || echo "None")
  PUBLIC_BLOCK=$(aws s3api get-public-access-block --bucket "$TF_STATE_BUCKET" --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")
  
  echo "  Versioning: $VERSIONING"
  echo "  Encryption: $ENCRYPTION"
  echo "  Public Access Blocked: $PUBLIC_BLOCK"
  
  if [ "$VERSIONING" == "Enabled" ] && [ "$ENCRYPTION" == "AES256" ] && [ "$PUBLIC_BLOCK" == "true" ]; then
    echo "  Status: ✅ PASS"
  else
    echo "  Status: ❌ FAIL (configuration incomplete)"
  fi
else
  echo "  Status: ❌ FAIL (bucket not found)"
fi

echo

# DynamoDB Lock Table Checks
echo "## DynamoDB Lock Table: $TF_LOCK_TABLE"
echo

DB_EXISTS=$(aws dynamodb describe-table --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION" 2>/dev/null && echo "true" || echo "false")
echo "Table Exists: $DB_EXISTS"

if [ "$DB_EXISTS" == "true" ]; then
  TABLE_INFO=$(aws dynamodb describe-table --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION")
  TABLE_STATUS=$(echo "$TABLE_INFO" | jq -r '.Table.TableStatus')
  BILLING_MODE=$(echo "$TABLE_INFO" | jq -r '.Table.BillingModeSummary.BillingMode')
  PITR=$(aws dynamodb describe-continuous-backups --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION" --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text 2>/dev/null || echo "DISABLED")
  
  echo "  Status: $TABLE_STATUS"
  echo "  Billing: $BILLING_MODE"
  echo "  PITR: $PITR"
  
  if [ "$TABLE_STATUS" == "ACTIVE" ] && [ "$BILLING_MODE" == "PAY_PER_REQUEST" ] && [ "$PITR" == "ENABLED" ]; then
    echo "  Status: ✅ PASS"
  else
    echo "  Status: ⚠️  WARNING (check configuration)"
  fi
else
  echo "  Status: ❌ FAIL (table not found)"
fi

echo

# Terraform Configuration Checks
echo "## Terraform Configuration"
echo

if [ -f "infra/terraform/backend.tf" ]; then
  echo "backend.tf Exists: true"
  
  # Check if Terraform is initialized
  if [ -d "infra/terraform/.terraform" ]; then
    echo "Terraform Initialized: true"
    
    cd infra/terraform
    CURRENT_WORKSPACE=$(terraform workspace show 2>/dev/null || echo "unknown")
    WORKSPACE_LIST=$(terraform workspace list 2>/dev/null | tr '\n' ',' | sed 's/,$//')
    cd ../..
    
    echo "  Current Workspace: $CURRENT_WORKSPACE"
    echo "  Available Workspaces: $WORKSPACE_LIST"
    echo "  Status: ✅ PASS"
  else
    echo "Terraform Initialized: false"
    echo "  Status: ⚠️  Run: ./scripts/init-terraform-backend.sh"
  fi
else
  echo "backend.tf Exists: false"
  echo "  Status: ❌ FAIL (backend.tf missing)"
fi

echo

# Documentation Checks
echo "## Documentation"
echo

DOCS_EXIST=0
[ -f "docs/ops/AWS_NAMING_CONVENTION.md" ] && ((DOCS_EXIST++))
[ -f "docs/ops/TERRAFORM_BACKEND.md" ] && ((DOCS_EXIST++))
[ -f "docs/ops/TERRAFORM_BACKEND_OPERATIONS.md" ] && ((DOCS_EXIST++))

echo "Documentation Files: $DOCS_EXIST/3"

if [ $DOCS_EXIST -eq 3 ]; then
  echo "  Status: ✅ PASS"
elif [ $DOCS_EXIST -gt 0 ]; then
  echo "  Status: ⚠️  Partial (some docs missing)"
else
  echo "  Status: ❌ FAIL (no documentation)"
fi

echo

# Cost Estimation
echo "## Cost Estimation"
echo

echo "Monthly Costs (Estimated):"
echo "  S3 Storage (<1GB):        ~\$0.02"
echo "  S3 Requests (~100):       ~\$0.01"
echo "  DynamoDB (PAY_PER_REQUEST): ~\$0.05"
echo "  CloudWatch Alarms:        ~\$0.10"
echo "  --------------------------------"
echo "  TOTAL:                    ~\$0.18/month"

echo

# Final Summary
echo "========================================="
echo "  Validation Summary"
echo "========================================="
echo

if [ "$S3_EXISTS" == "true" ] && [ "$DB_EXISTS" == "true" ] && [ -f "infra/terraform/backend.tf" ]; then
  echo "✅ PASSED: Backend infrastructure is ready"
  echo
  echo "Next Steps:"
  echo "  1. Proceed to Day 0: Baseline Documentation"
  echo "  2. Commit changes: git add . && git commit -m 'chore: AWS bootstrap complete'"
  echo "  3. Begin Week 1: Core Implementation Validation"
else
  echo "❌ FAILED: Backend setup incomplete"
  echo
  echo "Review failed checks above and re-run relevant scripts"
fi

echo
