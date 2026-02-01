#!/usr/bin/env bash
# Create Terraform backend resources (S3 + DynamoDB)
# Must be run ONCE before Terraform can use remote state

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
BUCKET_NAME="mirror-dissonance-terraform-state-prod"
LOCK_TABLE="mirror-dissonance-terraform-lock-prod"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Backend Resources Creation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Region:       $REGION"
echo "S3 Bucket:    $BUCKET_NAME"
echo "DynamoDB:     $LOCK_TABLE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Create S3 bucket for state storage
echo "[1/5] Creating S3 bucket..."

if aws s3 ls "s3://${BUCKET_NAME}" --region "$REGION" 2>/dev/null; then
  echo "      ✓ Bucket already exists: ${BUCKET_NAME}"
else
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --create-bucket-configuration LocationConstraint="$REGION" 2>/dev/null || \
  aws s3api create-bucket \
    --bucket "$BUCKET_NAME" \
    --region us-east-1
  
  echo "      ✓ Created S3 bucket: ${BUCKET_NAME}"
fi

# 2. Enable versioning
echo ""
echo "[2/5] Enabling versioning..."

aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled \
  --region "$REGION"

echo "      ✓ Versioning enabled"

# 3. Enable encryption
echo ""
echo "[3/5] Enabling server-side encryption..."

aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }' \
  --region "$REGION"

echo "      ✓ Encryption enabled (AES256)"

# 4. Block public access
echo ""
echo "[4/5] Blocking public access..."

aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
  --region "$REGION"

echo "      ✓ Public access blocked"

# 5. Create DynamoDB table for state locking
echo ""
echo "[5/5] Creating DynamoDB lock table..."

if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" 2>/dev/null >/dev/null; then
  echo "      ✓ Table already exists: ${LOCK_TABLE}"
else
  aws dynamodb create-table \
    --table-name "$LOCK_TABLE" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" \
    --tags Key=Project,Value=MirrorDissonance Key=Purpose,Value=TerraformStateLock \
    > /dev/null
  
  echo "      ✓ Created DynamoDB table: ${LOCK_TABLE}"
  
  # Wait for table to be active
  echo "      ⏳ Waiting for table to be active..."
  aws dynamodb wait table-exists --table-name "$LOCK_TABLE" --region "$REGION"
  echo "      ✓ Table is active"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backend resources ready ✓"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. cd infra/terraform"
echo "  2. terraform init"
echo "  3. terraform workspace new staging"
echo "  4. terraform plan -var-file=staging.tfvars"
echo ""
