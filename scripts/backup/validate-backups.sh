#!/usr/bin/env bash
# Validate backup configuration and test recovery

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
VAULT_NAME="mirror-dissonance-${ENVIRONMENT}-vault"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Backup & Recovery Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "Vault: $VAULT_NAME"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

FAILURES=0

# Test 1: Backup vault exists
echo "[1/6] Checking backup vault..."
if aws backup describe-backup-vault --backup-vault-name "$VAULT_NAME" --region "$REGION" &>/dev/null; then
  echo "      ✓ Vault exists: $VAULT_NAME"
else
  echo "      ✗ Vault not found: $VAULT_NAME"
  FAILURES=$((FAILURES + 1))
fi

# Test 2: Backup plan exists
echo ""
echo "[2/6] Checking backup plan..."
PLAN_ID=$(aws backup list-backup-plans --region "$REGION" --query "BackupPlansList[?BackupPlanName=='mirror-dissonance-${ENVIRONMENT}-plan'].BackupPlanId" --output text)

if [ -n "$PLAN_ID" ]; then
  echo "      ✓ Backup plan exists: $PLAN_ID"
else
  echo "      ✗ Backup plan not found"
  FAILURES=$((FAILURES + 1))
fi

# Test 3: Backup selections configured
echo ""
echo "[3/6] Checking backup selections..."
if [ -n "$PLAN_ID" ]; then
  SELECTION_COUNT=$(aws backup list-backup-selections --backup-plan-id "$PLAN_ID" --region "$REGION" --query 'length(BackupSelectionsList)' --output text)
  
  if [ "$SELECTION_COUNT" -gt 0 ]; then
    echo "      ✓ Backup selections: $SELECTION_COUNT"
  else
    echo "      ✗ No backup selections configured"
    FAILURES=$((FAILURES + 1))
  fi
fi

# Test 4: Recent recovery points
echo ""
echo "[4/6] Checking recovery points..."
RECOVERY_POINTS=$(aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name "$VAULT_NAME" \
  --region "$REGION" \
  --query 'length(RecoveryPoints)' \
  --output text 2>/dev/null || echo "0")

if [ "$RECOVERY_POINTS" -gt 0 ]; then
  echo "      ✓ Recovery points available: $RECOVERY_POINTS"
  
  # Show most recent
  aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name "$VAULT_NAME" \
    --region "$REGION" \
    --max-items 3 \
    --query 'RecoveryPoints[*].[ResourceArn,CreationDate,Status]' \
    --output table
else
  echo "      ⚠ No recovery points yet (backups may not have run)"
fi

# Test 5: PITR enabled on DynamoDB tables
echo ""
echo "[5/6] Checking PITR on DynamoDB tables..."

TABLES=(
  "mirror-dissonance-${ENVIRONMENT}-fp-events"
  "mirror-dissonance-${ENVIRONMENT}-consent"
  "mirror-dissonance-${ENVIRONMENT}-block-counter"
)

for TABLE in "${TABLES[@]}"; do
  PITR=$(aws dynamodb describe-continuous-backups \
    --table-name "$TABLE" \
    --region "$REGION" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text 2>/dev/null || echo "UNKNOWN")
  
  if [ "$PITR" = "ENABLED" ]; then
    echo "      ✓ PITR enabled: $TABLE"
  else
    echo "      ✗ PITR not enabled: $TABLE"
    FAILURES=$((FAILURES + 1))
  fi
done

# Test 6: Backup notifications configured
echo ""
echo "[6/6] Checking backup notifications..."
if aws backup get-backup-vault-notifications \
  --backup-vault-name "$VAULT_NAME" \
  --region "$REGION" &>/dev/null; then
  echo "      ✓ Backup notifications configured"
else
  echo "      ⚠ Backup notifications not configured"
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
