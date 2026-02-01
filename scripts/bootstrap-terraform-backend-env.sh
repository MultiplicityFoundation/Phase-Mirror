#!/bin/bash
# bootstrap-terraform-backend-env.sh
# Creates S3 bucket and DynamoDB table for Terraform state management
# Enhanced version with environment support and lifecycle policies
# Based on Pre-Flight Week 0, Day -1: AWS Infrastructure Bootstrap

set -euo pipefail

# Set variables (can be overridden by environment variables)
export AWS_REGION="${AWS_REGION:-us-east-1}"
export PROJECT_NAME="${PROJECT_NAME:-mirror-dissonance}"
export ENVIRONMENT="${ENVIRONMENT:-dev}"  # dev, staging, or production

# Generate unique bucket name with timestamp for dev/staging
if [ "$ENVIRONMENT" = "production" ]; then
  export STATE_BUCKET="${PROJECT_NAME}-terraform-state-${ENVIRONMENT}"
else
  export STATE_BUCKET="${PROJECT_NAME}-terraform-state-${ENVIRONMENT}-$(date +%s)"
fi

export LOCK_TABLE="${PROJECT_NAME}-terraform-lock-${ENVIRONMENT}"

echo "=== AWS Infrastructure Bootstrap: Terraform Backend ==="
echo ""
echo "Configuration:"
echo "  Project:     ${PROJECT_NAME}"
echo "  Environment: ${ENVIRONMENT}"
echo "  Region:      ${AWS_REGION}"
echo "  Bucket:      ${STATE_BUCKET}"
echo "  Lock Table:  ${LOCK_TABLE}"
echo ""

# Verify AWS credentials
echo "Verifying AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
  echo "❌ Error: AWS credentials not configured or invalid"
  echo "   Run: aws configure"
  exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
USER_ARN=$(aws sts get-caller-identity --query Arn --output text)
echo "✓ Authenticated as: ${USER_ARN}"
echo "✓ Account ID: ${ACCOUNT_ID}"
echo ""

# Create S3 bucket for state
echo "📦 Creating S3 bucket: ${STATE_BUCKET}"
aws s3 mb "s3://${STATE_BUCKET}" --region "${AWS_REGION}"

# Enable versioning (critical for rollback)
echo "🔄 Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "${STATE_BUCKET}" \
  --versioning-configuration Status=Enabled

# Enable encryption
echo "🔒 Enabling encryption..."
aws s3api put-bucket-encryption \
  --bucket "${STATE_BUCKET}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Block public access (security best practice)
echo "🛡️  Blocking public access..."
aws s3api put-public-access-block \
  --bucket "${STATE_BUCKET}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Add tags
echo "🏷️  Adding tags..."
aws s3api put-bucket-tagging \
  --bucket "${STATE_BUCKET}" \
  --tagging "TagSet=[
    {Key=Project,Value=${PROJECT_NAME}},
    {Key=Environment,Value=${ENVIRONMENT}},
    {Key=Component,Value=TerraformState},
    {Key=ManagedBy,Value=bootstrap-script}
  ]"

# Enable lifecycle policy (optional: delete old versions after 90 days)
echo "♻️  Configuring lifecycle policy..."
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${STATE_BUCKET}" \
  --lifecycle-configuration '{
    "Rules": [{
      "Id": "DeleteOldVersions",
      "Status": "Enabled",
      "NoncurrentVersionExpiration": {
        "NoncurrentDays": 90
      }
    }]
  }'

# Verify bucket created
echo "✓ S3 bucket created successfully"
aws s3 ls | grep "${STATE_BUCKET}"
echo ""

# Create DynamoDB table for state locking
echo "🔐 Creating DynamoDB lock table: ${LOCK_TABLE}"
aws dynamodb create-table \
  --table-name "${LOCK_TABLE}" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${AWS_REGION}" \
  --tags Key=Project,Value="${PROJECT_NAME}" Key=Environment,Value="${ENVIRONMENT}" Key=Component,Value=TerraformLock

# Wait for table to be active
echo "⏳ Waiting for table to be active..."
aws dynamodb wait table-exists \
  --table-name "${LOCK_TABLE}" \
  --region "${AWS_REGION}"

# Enable Point-in-Time Recovery (PITR)
echo "🔄 Enabling Point-in-Time Recovery..."
aws dynamodb update-continuous-backups \
  --table-name "${LOCK_TABLE}" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region "${AWS_REGION}"

# Verify table created
echo "✓ DynamoDB table created successfully"
aws dynamodb describe-table \
  --table-name "${LOCK_TABLE}" \
  --query 'Table.[TableName,TableStatus,BillingModeSummary.BillingMode]' \
  --output table
echo ""

# Generate backend configuration
BACKEND_CONFIG="infra/terraform/backend-${ENVIRONMENT}.hcl"
echo "📝 Generating backend configuration: ${BACKEND_CONFIG}"
cat > "${BACKEND_CONFIG}" << EOF
# Auto-generated backend configuration for ${ENVIRONMENT} environment
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Do not edit manually - regenerate with bootstrap script

bucket         = "${STATE_BUCKET}"
key            = "terraform.tfstate"
region         = "${AWS_REGION}"
dynamodb_table = "${LOCK_TABLE}"
encrypt        = true

# Optional: Configure workspaces
# workspace_key_prefix = "workspaces"
EOF

echo "✓ Backend configuration written to: ${BACKEND_CONFIG}"
echo ""

# Success summary
echo "✅ Terraform backend resources created successfully!"
echo ""
echo "📋 Summary:"
echo "   S3 Bucket:      ${STATE_BUCKET}"
echo "   DynamoDB Table: ${LOCK_TABLE}"
echo "   Region:         ${AWS_REGION}"
echo "   Backend Config: ${BACKEND_CONFIG}"
echo ""
echo "🚀 Next steps:"
echo "   1. Initialize Terraform with backend:"
echo "      cd infra/terraform"
echo "      terraform init -backend-config=${BACKEND_CONFIG##infra/terraform/}"
echo ""
echo "   2. Or update infra/terraform/backend.tf with these values:"
echo "      terraform {"
echo "        backend \"s3\" {"
echo "          bucket         = \"${STATE_BUCKET}\""
echo "          key            = \"terraform.tfstate\""
echo "          region         = \"${AWS_REGION}\""
echo "          dynamodb_table = \"${LOCK_TABLE}\""
echo "          encrypt        = true"
echo "        }"
echo "      }"
echo ""
echo "   3. Verify backend is working:"
echo "      terraform init"
echo "      terraform plan"
