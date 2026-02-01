#!/usr/bin/env bash
# Verify staging deployment

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Staging Infrastructure Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0

# Load outputs
if [ ! -f staging-outputs.json ]; then
  echo "✗ staging-outputs.json not found. Run deploy-staging.sh first."
  exit 1
fi

FP_TABLE=$(jq -r '.fp_events_table_name.value' staging-outputs.json)
CONSENT_TABLE=$(jq -r '.consent_table_name.value' staging-outputs.json)
BLOCK_TABLE=$(jq -r '.block_counter_table_name.value' staging-outputs.json)
NONCE_PARAM=$(jq -r '.nonce_parameter_name.value' staging-outputs.json)
BASELINES_BUCKET=$(jq -r '.baselines_bucket_name.value' staging-outputs.json)

# Test 1: DynamoDB tables exist
echo "[1/7] Checking DynamoDB tables..."

for TABLE in "$FP_TABLE" "$CONSENT_TABLE" "$BLOCK_TABLE"; do
  if aws dynamodb describe-table --table-name "$TABLE" --region us-east-1 &>/dev/null; then
    echo "      ✓ Table exists: $TABLE"
  else
    echo "      ✗ Table missing: $TABLE"
    FAILURES=$((FAILURES + 1))
  fi
done

# Test 2: PITR enabled
echo ""
echo "[2/7] Checking Point-in-Time Recovery..."

for TABLE in "$FP_TABLE" "$CONSENT_TABLE" "$BLOCK_TABLE"; do
  PITR=$(aws dynamodb describe-continuous-backups --table-name "$TABLE" --region us-east-1 --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text)
  
  if [ "$PITR" = "ENABLED" ]; then
    echo "      ✓ PITR enabled: $TABLE"
  else
    echo "      ✗ PITR not enabled: $TABLE"
    FAILURES=$((FAILURES + 1))
  fi
done

# Test 3: SSM parameter exists
echo ""
echo "[3/7] Checking SSM parameter..."

if aws ssm get-parameter --name "$NONCE_PARAM" --region us-east-1 &>/dev/null; then
  echo "      ✓ Parameter exists: $NONCE_PARAM"
  
  # Verify it's SecureString
  TYPE=$(aws ssm get-parameter --name "$NONCE_PARAM" --region us-east-1 --query 'Parameter.Type' --output text)
  if [ "$TYPE" = "SecureString" ]; then
    echo "      ✓ Type: SecureString"
  else
    echo "      ✗ Wrong type: $TYPE (expected SecureString)"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "      ✗ Parameter missing: $NONCE_PARAM"
  FAILURES=$((FAILURES + 1))
fi

# Test 4: S3 bucket exists
echo ""
echo "[4/7] Checking S3 baseline bucket..."

if aws s3 ls "s3://$BASELINES_BUCKET" --region us-east-1 &>/dev/null; then
  echo "      ✓ Bucket exists: $BASELINES_BUCKET"
  
  # Check versioning
  VERSIONING=$(aws s3api get-bucket-versioning --bucket "$BASELINES_BUCKET" --region us-east-1 --query 'Status' --output text)
  if [ "$VERSIONING" = "Enabled" ]; then
    echo "      ✓ Versioning enabled"
  else
    echo "      ✗ Versioning not enabled"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "      ✗ Bucket missing: $BASELINES_BUCKET"
  FAILURES=$((FAILURES + 1))
fi

# Test 5: KMS key accessible
echo ""
echo "[5/7] Checking KMS key..."

KMS_KEY_ID=$(jq -r '.kms_key_id.value' staging-outputs.json)

if aws kms describe-key --key-id "$KMS_KEY_ID" --region us-east-1 &>/dev/null; then
  echo "      ✓ KMS key accessible: $KMS_KEY_ID"
  
  # Check key rotation
  ROTATION=$(aws kms get-key-rotation-status --key-id "$KMS_KEY_ID" --region us-east-1 --query 'KeyRotationEnabled' --output text)
  if [ "$ROTATION" = "True" ]; then
    echo "      ✓ Key rotation enabled"
  else
    echo "      ⚠ Key rotation not enabled"
  fi
else
  echo "      ✗ KMS key not accessible"
  FAILURES=$((FAILURES + 1))
fi

# Test 6: CloudWatch dashboard
echo ""
echo "[6/7] Checking CloudWatch dashboard..."

DASHBOARD_NAME=$(jq -r '.dashboard_name.value' staging-outputs.json)

if aws cloudwatch get-dashboard --dashboard-name "$DASHBOARD_NAME" --region us-east-1 &>/dev/null; then
  echo "      ✓ Dashboard exists: $DASHBOARD_NAME"
else
  echo "      ✗ Dashboard missing: $DASHBOARD_NAME"
  FAILURES=$((FAILURES + 1))
fi

# Test 7: SNS topic
echo ""
echo "[7/7] Checking SNS topic..."

SNS_TOPIC=$(jq -r '.sns_topic_arn.value' staging-outputs.json)

if aws sns get-topic-attributes --topic-arn "$SNS_TOPIC" --region us-east-1 &>/dev/null; then
  echo "      ✓ SNS topic exists"
else
  echo "      ✗ SNS topic missing"
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
