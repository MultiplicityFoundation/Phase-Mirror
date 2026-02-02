#!/usr/bin/env bash
# Comprehensive security audit

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Security Hardening Audit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0
WARNINGS=0

# Category 1: Encryption
echo "═══════════════════════════════════════════════"
echo "1. ENCRYPTION"
echo "═══════════════════════════════════════════════"
echo ""

# DynamoDB encryption
echo "[1.1] DynamoDB table encryption..."
TABLES=(
  "mirror-dissonance-${ENVIRONMENT}-fp-events"
  "mirror-dissonance-${ENVIRONMENT}-consent"
  "mirror-dissonance-${ENVIRONMENT}-block-counter"
)

for TABLE in "${TABLES[@]}"; do
  SSE=$(aws dynamodb describe-table \
    --table-name "$TABLE" \
    --region "$REGION" \
    --query 'Table.SSEDescription.Status' \
    --output text 2>/dev/null || echo "NONE")
  
  if [ "$SSE" = "ENABLED" ]; then
    KMS_TYPE=$(aws dynamodb describe-table \
      --table-name "$TABLE" \
      --region "$REGION" \
      --query 'Table.SSEDescription.SSEType' \
      --output text)
    echo "      ✓ $TABLE: $KMS_TYPE encryption"
  else
    echo "      ✗ $TABLE: No encryption"
    FAILURES=$((FAILURES + 1))
  fi
done

# S3 encryption
echo ""
echo "[1.2] S3 bucket encryption..."
BUCKETS=(
  "mirror-dissonance-${ENVIRONMENT}-baselines"
  "mirror-dissonance-${ENVIRONMENT}-cloudtrail"
)

for BUCKET in "${BUCKETS[@]}"; do
  if aws s3api get-bucket-encryption --bucket "$BUCKET" --region "$REGION" &>/dev/null; then
    ENCRYPTION=$(aws s3api get-bucket-encryption \
      --bucket "$BUCKET" \
      --region "$REGION" \
      --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
      --output text)
    echo "      ✓ $BUCKET: $ENCRYPTION"
  else
    echo "      ✗ $BUCKET: No encryption"
    FAILURES=$((FAILURES + 1))
  fi
done

# SSM parameter encryption
echo ""
echo "[1.3] SSM parameter encryption..."
PARAMS=$(aws ssm describe-parameters \
  --region "$REGION" \
  --filters "Key=Name,Values=/guardian/${ENVIRONMENT}/" \
  --query 'Parameters[*].Name' \
  --output text)

for PARAM in $PARAMS; do
  TYPE=$(aws ssm describe-parameters \
    --region "$REGION" \
    --filters "Key=Name,Values=$PARAM" \
    --query 'Parameters[0].Type' \
    --output text)
  
  if [ "$TYPE" = "SecureString" ]; then
    echo "      ✓ $PARAM: SecureString"
  else
    echo "      ✗ $PARAM: Not encrypted ($TYPE)"
    FAILURES=$((FAILURES + 1))
  fi
done

# KMS key rotation
echo ""
echo "[1.4] KMS key rotation..."
KEYS=$(aws kms list-aliases \
  --region "$REGION" \
  --query "Aliases[?contains(AliasName, 'mirror-dissonance-${ENVIRONMENT}')].TargetKeyId" \
  --output text)

for KEY in $KEYS; do
  ROTATION=$(aws kms get-key-rotation-status \
    --key-id "$KEY" \
    --region "$REGION" \
    --query 'KeyRotationEnabled' \
    --output text)
  
  ALIAS=$(aws kms list-aliases \
    --region "$REGION" \
    --key-id "$KEY" \
    --query 'Aliases[0].AliasName' \
    --output text)
  
  if [ "$ROTATION" = "True" ]; then
    echo "      ✓ $ALIAS: Rotation enabled"
  else
    echo "      ⚠ $ALIAS: Rotation not enabled"
    WARNINGS=$((WARNINGS + 1))
  fi
done

# Category 2: Access Control
echo ""
echo "═══════════════════════════════════════════════"
echo "2. ACCESS CONTROL"
echo "═══════════════════════════════════════════════"
echo ""

# S3 public access
echo "[2.1] S3 public access blocking..."
for BUCKET in "${BUCKETS[@]}"; do
  BLOCK=$(aws s3api get-public-access-block \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --query 'PublicAccessBlockConfiguration.BlockPublicAcls' \
    --output text)
  
  if [ "$BLOCK" = "True" ]; then
    echo "      ✓ $BUCKET: Public access blocked"
  else
    echo "      ✗ $BUCKET: Public access NOT blocked"
    FAILURES=$((FAILURES + 1))
  fi
done

# Category 3: Audit & Logging
echo ""
echo "═══════════════════════════════════════════════"
echo "3. AUDIT & LOGGING"
echo "═══════════════════════════════════════════════"
echo ""

# CloudTrail enabled
echo "[3.1] CloudTrail status..."
TRAIL_NAME="mirror-dissonance-${ENVIRONMENT}"

if aws cloudtrail get-trail-status --name "$TRAIL_NAME" --region "$REGION" &>/dev/null; then
  IS_LOGGING=$(aws cloudtrail get-trail-status \
    --name "$TRAIL_NAME" \
    --region "$REGION" \
    --query 'IsLogging' \
    --output text)
  
  if [ "$IS_LOGGING" = "True" ]; then
    echo "      ✓ CloudTrail logging: Active"
  else
    echo "      ✗ CloudTrail logging: Inactive"
    FAILURES=$((FAILURES + 1))
  fi
else
  echo "      ✗ CloudTrail not found: $TRAIL_NAME"
  FAILURES=$((FAILURES + 1))
fi

# CloudTrail log file validation
echo ""
echo "[3.2] CloudTrail log file validation..."
LOG_VALIDATION=$(aws cloudtrail describe-trails \
  --trail-name-list "$TRAIL_NAME" \
  --region "$REGION" \
  --query 'trailList[0].LogFileValidationEnabled' \
  --output text 2>/dev/null || echo "false")

if [ "$LOG_VALIDATION" = "True" ]; then
  echo "      ✓ Log file validation: Enabled"
else
  echo "      ✗ Log file validation: Disabled"
  FAILURES=$((FAILURES + 1))
fi

# Category 4: Backup & Recovery
echo ""
echo "═══════════════════════════════════════════════"
echo "4. BACKUP & RECOVERY"
echo "═══════════════════════════════════════════════"
echo ""

# S3 versioning
echo "[4.1] S3 bucket versioning..."
for BUCKET in "${BUCKETS[@]}"; do
  VERSIONING=$(aws s3api get-bucket-versioning \
    --bucket "$BUCKET" \
    --region "$REGION" \
    --query 'Status' \
    --output text)
  
  if [ "$VERSIONING" = "Enabled" ]; then
    echo "      ✓ $BUCKET: Versioning enabled"
  else
    echo "      ✗ $BUCKET: Versioning not enabled"
    FAILURES=$((FAILURES + 1))
  fi
done

# DynamoDB PITR
echo ""
echo "[4.2] DynamoDB Point-in-Time Recovery..."
for TABLE in "${TABLES[@]}"; do
  PITR=$(aws dynamodb describe-continuous-backups \
    --table-name "$TABLE" \
    --region "$REGION" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text)
  
  if [ "$PITR" = "ENABLED" ]; then
    echo "      ✓ $TABLE: PITR enabled"
  else
    echo "      ✗ $TABLE: PITR not enabled"
    FAILURES=$((FAILURES + 1))
  fi
done

# Backup vault exists
echo ""
echo "[4.3] AWS Backup configuration..."
VAULT_NAME="mirror-dissonance-${ENVIRONMENT}-vault"

if aws backup describe-backup-vault --backup-vault-name "$VAULT_NAME" --region "$REGION" &>/dev/null; then
  echo "      ✓ Backup vault exists: $VAULT_NAME"
else
  echo "      ⚠ Backup vault not found"
  WARNINGS=$((WARNINGS + 1))
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "AUDIT SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Failures: $FAILURES"
echo "Warnings: $WARNINGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $FAILURES -eq 0 ]; then
  if [ $WARNINGS -eq 0 ]; then
    echo "✓ Security posture: EXCELLENT"
  else
    echo "✓ Security posture: GOOD (review warnings)"
  fi
  exit 0
else
  echo "✗ Security posture: NEEDS IMPROVEMENT"
  exit 1
fi
