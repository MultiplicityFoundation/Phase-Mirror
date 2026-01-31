#!/bin/bash
set -euo pipefail

ENVIRONMENT="${1:-production}"
REGION="${2:-us-east-1}"

TABLES=(
  "mirror-dissonance-${ENVIRONMENT}-fp-events"
  "mirror-dissonance-${ENVIRONMENT}-consent"
  "mirror-dissonance-${ENVIRONMENT}-block-counter"
)

echo "🔍 Verifying PITR status for ${ENVIRONMENT} tables..."

for TABLE in "${TABLES[@]}"; do
  echo ""
  echo "Checking: ${TABLE}"
  
  PITR_STATUS=$(aws dynamodb describe-continuous-backups \
    --table-name "${TABLE}" \
    --region "${REGION}" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text)
  
  if [ "$PITR_STATUS" == "ENABLED" ]; then
    echo "  ✅ PITR enabled"
    
    # Get earliest restore time
    EARLIEST=$(aws dynamodb describe-continuous-backups \
      --table-name "${TABLE}" \
      --region "${REGION}" \
      --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.EarliestRestorableDateTime' \
      --output text)
    
    echo "  📅 Earliest restore: ${EARLIEST}"
  else
    echo "  ❌ PITR NOT enabled"
    exit 1
  fi
done

echo ""
echo "✅ All tables have PITR enabled"
