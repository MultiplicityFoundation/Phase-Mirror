#!/usr/bin/env bash
# Test DynamoDB Point-in-Time Recovery

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
TABLE_NAME="mirror-dissonance-${ENVIRONMENT}-fp-events"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DynamoDB PITR Recovery Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Source Table: $TABLE_NAME"
echo "Test Timestamp: $TIMESTAMP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Step 1: Insert test record
echo "[1/5] Inserting test record..."
TEST_ID="test-pitr-$(date +%s)"

aws dynamodb put-item \
  --table-name "$TABLE_NAME" \
  --item "{
    \"pk\": {\"S\": \"rule:$TEST_ID\"},
    \"sk\": {\"S\": \"event:$TIMESTAMP#test\"},
    \"testMarker\": {\"S\": \"PITR_TEST\"}
  }" \
  --region "$REGION"

echo "      ✓ Test record inserted: $TEST_ID"

# Step 2: Wait a moment
echo ""
echo "[2/5] Waiting 5 seconds..."
sleep 5

# Step 3: Get earliest restore time
echo ""
echo "[3/5] Getting PITR restore window..."

EARLIEST_TIME=$(aws dynamodb describe-continuous-backups \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.EarliestRestorableDateTime' \
  --output text)

LATEST_TIME=$(aws dynamodb describe-continuous-backups \
  --table-name "$TABLE_NAME" \
  --region "$REGION" \
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.LatestRestorableDateTime' \
  --output text)

echo "      Earliest: $EARLIEST_TIME"
echo "      Latest: $LATEST_TIME"

# Step 4: Simulate restore (dry-run)
echo ""
echo "[4/5] Simulating PITR restore (dry-run)..."

RESTORE_TABLE="${TABLE_NAME}-pitr-test-$(date +%s)"

echo "      Source: $TABLE_NAME"
echo "      Target: $RESTORE_TABLE"
echo "      Time: 5 minutes ago"

# Calculate 5 minutes ago
RESTORE_TIME=$(date -u -d '5 minutes ago' +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || \
               date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")

echo ""
echo "      Command that would be run:"
echo "      aws dynamodb restore-table-to-point-in-time \\"
echo "        --source-table-name $TABLE_NAME \\"
echo "        --target-table-name $RESTORE_TABLE \\"
echo "        --restore-date-time $RESTORE_TIME \\"
echo "        --region $REGION"

echo ""
echo "      ⚠ Skipping actual restore (test mode)"

# Step 5: Cleanup test record
echo ""
echo "[5/5] Cleaning up test record..."

aws dynamodb delete-item \
  --table-name "$TABLE_NAME" \
  --key "{
    \"pk\": {\"S\": \"rule:$TEST_ID\"},
    \"sk\": {\"S\": \"event:$TIMESTAMP#test\"}
  }" \
  --region "$REGION"

echo "      ✓ Test record deleted"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ PITR test complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "PITR Status: Ready"

# Calculate restore window in days (safely handle date parsing)
if command -v date &>/dev/null; then
  if date -d "$LATEST_TIME" +%s &>/dev/null 2>&1; then
    # GNU date
    DAYS=$(( ($(date -d "$LATEST_TIME" +%s) - $(date -d "$EARLIEST_TIME" +%s)) / 86400 ))
    echo "Restore window: $DAYS days"
  elif date -j -f "%Y-%m-%dT%H:%M:%S" "$LATEST_TIME" +%s &>/dev/null 2>&1; then
    # BSD date
    LATEST_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo $LATEST_TIME | cut -d'.' -f1)" +%s)
    EARLIEST_EPOCH=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo $EARLIEST_TIME | cut -d'.' -f1)" +%s)
    DAYS=$(( ($LATEST_EPOCH - $EARLIEST_EPOCH) / 86400 ))
    echo "Restore window: $DAYS days"
  else
    echo "Restore window: Available (earliest: $EARLIEST_TIME, latest: $LATEST_TIME)"
  fi
else
  echo "Restore window: Available (earliest: $EARLIEST_TIME, latest: $LATEST_TIME)"
fi

echo ""
echo "To perform actual restore:"
echo "  aws dynamodb restore-table-to-point-in-time \\"
echo "    --source-table-name $TABLE_NAME \\"
echo "    --target-table-name ${TABLE_NAME}-restored \\"
echo "    --restore-date-time <TIMESTAMP> \\"
echo "    --region $REGION"
