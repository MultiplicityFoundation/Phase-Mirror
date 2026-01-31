#!/bin/bash
# bootstrap-terraform-backend.sh
# Creates S3 bucket and DynamoDB table for Terraform state management
# Day 15: Terraform Backend Setup

set -euo pipefail

BUCKET_NAME="mirror-dissonance-terraform-state-prod"
TABLE_NAME="terraform-state-lock"
REGION="us-east-1"

echo "🚀 Creating Terraform backend resources..."

# Create S3 bucket
echo "Creating S3 bucket: ${BUCKET_NAME}"
aws s3api create-bucket \
  --bucket "${BUCKET_NAME}" \
  --region "${REGION}"

# Enable versioning
echo "Enabling versioning..."
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled

# Enable encryption
echo "Enabling encryption..."
aws s3api put-bucket-encryption \
  --bucket "${BUCKET_NAME}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Block public access
echo "Blocking public access..."
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Add tags
aws s3api put-bucket-tagging \
  --bucket "${BUCKET_NAME}" \
  --tagging 'TagSet=[
    {Key=Project,Value=MirrorDissonance},
    {Key=Component,Value=TerraformState}
  ]'

# Create DynamoDB table
echo "Creating DynamoDB lock table: ${TABLE_NAME}"
aws dynamodb create-table \
  --table-name "${TABLE_NAME}" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --tags Key=Project,Value=MirrorDissonance Key=Component,Value=TerraformLock \
  --region "${REGION}"

# Wait for table to be active
echo "Waiting for table to be active..."
aws dynamodb wait table-exists --table-name "${TABLE_NAME}" --region "${REGION}"

echo "✅ Terraform backend resources created successfully!"
echo ""
echo "Next steps:"
echo "1. Update infra/terraform/backend.tf with these values:"
echo "   bucket         = \"${BUCKET_NAME}\""
echo "   dynamodb_table = \"${TABLE_NAME}\""
echo "   region         = \"${REGION}\""
echo "2. Run: cd infra/terraform && terraform init"
