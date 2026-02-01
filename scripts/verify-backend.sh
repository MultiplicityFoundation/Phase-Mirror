#!/usr/bin/env bash
# Verify Terraform backend resources are correctly configured

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
BUCKET_NAME="mirror-dissonance-terraform-state-prod"
LOCK_TABLE="mirror-dissonance-terraform-lock-prod"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Backend Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0

# Test 1: S3 bucket exists
echo "[1/8] Checking S3 bucket exists..."
if aws s3 ls "s3://${BUCKET_NAME}" --region "$REGION" &>/dev/null; then
  echo "      ✓ Bucket exists: ${BUCKET_NAME}"
else
  echo "      ✗ Bucket not found: ${BUCKET_NAME}"
  FAILURES=$((FAILURES + 1))
fi

# Test 2: Versioning enabled
echo ""
echo "[2/8] Checking versioning..."
VERSIONING=$(aws s3api get-bucket-versioning --bucket "$BUCKET_NAME" --region "$REGION" --query 'Status' --output text 2>/dev/null || echo "None")

if [ "$VERSIONING" = "Enabled" ]; then
  echo "      ✓ Versioning enabled"
else
  echo "      ✗ Versioning not enabled (status: $VERSIONING)"
  FAILURES=$((FAILURES + 1))
fi

# Test 3: Encryption enabled
echo ""
echo "[3/8] Checking encryption..."
ENCRYPTION=$(aws s3api get-bucket-encryption --bucket "$BUCKET_NAME" --region "$REGION" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text 2>/dev/null || echo "None")

if [ "$ENCRYPTION" = "AES256" ] || [ "$ENCRYPTION" = "aws:kms" ]; then
  echo "      ✓ Encryption enabled ($ENCRYPTION)"
else
  echo "      ✗ Encryption not enabled"
  FAILURES=$((FAILURES + 1))
fi

# Test 4: Public access blocked
echo ""
echo "[4/8] Checking public access block..."
PUBLIC_BLOCK=$(aws s3api get-public-access-block --bucket "$BUCKET_NAME" --region "$REGION" --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")

if [ "$PUBLIC_BLOCK" = "True" ]; then
  echo "      ✓ Public access blocked"
else
  echo "      ✗ Public access not blocked"
  FAILURES=$((FAILURES + 1))
fi

# Test 5: DynamoDB table exists
echo ""
echo "[5/8] Checking DynamoDB lock table..."
if aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" &>/dev/null; then
  echo "      ✓ Table exists: ${LOCK_TABLE}"
else
  echo "      ✗ Table not found: ${LOCK_TABLE}"
  FAILURES=$((FAILURES + 1))
fi

# Test 6: DynamoDB table has correct key schema
echo ""
echo "[6/8] Checking DynamoDB key schema..."
KEY_SCHEMA=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" --query 'Table.KeySchema[0].AttributeName' --output text 2>/dev/null || echo "None")

if [ "$KEY_SCHEMA" = "LockID" ]; then
  echo "      ✓ Key schema correct (LockID)"
else
  echo "      ✗ Key schema incorrect (expected LockID, got $KEY_SCHEMA)"
  FAILURES=$((FAILURES + 1))
fi

# Test 7: DynamoDB billing mode
echo ""
echo "[7/8] Checking DynamoDB billing mode..."
BILLING_MODE=$(aws dynamodb describe-table --table-name "$LOCK_TABLE" --region "$REGION" --query 'Table.BillingModeSummary.BillingMode' --output text 2>/dev/null || echo "PROVISIONED")

if [ "$BILLING_MODE" = "PAY_PER_REQUEST" ]; then
  echo "      ✓ Billing mode: PAY_PER_REQUEST"
else
  echo "      ⚠ Billing mode: $BILLING_MODE (PAY_PER_REQUEST recommended, but not required)"
  # Note: This is a warning, not a failure - PROVISIONED billing mode works but may cost more
fi

# Test 8: Test write/read to S3
echo ""
echo "[8/8] Testing S3 read/write..."
TEST_FILE="test-$(date +%s).txt"
echo "test" | aws s3 cp - "s3://${BUCKET_NAME}/${TEST_FILE}" --region "$REGION" 2>/dev/null

if aws s3 ls "s3://${BUCKET_NAME}/${TEST_FILE}" --region "$REGION" &>/dev/null; then
  echo "      ✓ S3 read/write working"
  aws s3 rm "s3://${BUCKET_NAME}/${TEST_FILE}" --region "$REGION" &>/dev/null
else
  echo "      ✗ S3 read/write failed"
  FAILURES=$((FAILURES + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILURES -eq 0 ]; then
  echo "✓ All checks passed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 0
else
  echo "✗ $FAILURES check(s) failed"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  exit 1
fi
