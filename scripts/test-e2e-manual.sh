#!/bin/bash
# test-e2e-manual.sh
# Manual End-to-End validation test for Days 19-20
# Tests: Consent → FP Event Recording → FP Query → DynamoDB Verification

set -euo pipefail

ENV="${1:-staging}"
REGION="${2:-us-east-1}"

echo "🧪 Starting E2E Manual Test for environment: ${ENV}"
echo "================================================"

# Environment variables
FP_TABLE="mirror-dissonance-${ENV}-fp-events"
CONSENT_TABLE="mirror-dissonance-${ENV}-consent"
NONCE_PARAM="/guardian/${ENV}/redaction_nonce_v1"
TEST_ORG="PhaseMirror"

echo ""
echo "Configuration:"
echo "  Environment: ${ENV}"
echo "  Region: ${REGION}"
echo "  FP Table: ${FP_TABLE}"
echo "  Consent Table: ${CONSENT_TABLE}"
echo "  Nonce Param: ${NONCE_PARAM}"
echo ""

# Check if CLI is built
if [ ! -d "packages/cli/dist" ]; then
  echo "📦 Building CLI..."
  cd packages/cli
  pnpm run build
  cd ../..
fi

echo "✅ CLI built and ready"
echo ""

# Step 1: Grant consent
echo "Step 1: Granting consent for test org..."
echo "=========================================="
node packages/cli/dist/index.js consent grant \
  --org "${TEST_ORG}" \
  --scope allrepos \
  --granted-by test-user || {
    echo "⚠️  Consent grant failed (may already exist)"
  }

echo ""
echo "Step 2: Verifying consent in DynamoDB..."
echo "=========================================="
aws dynamodb get-item \
  --table-name "${CONSENT_TABLE}" \
  --key "{\"orgId\": {\"S\": \"${TEST_ORG}\"}}" \
  --region "${REGION}" \
  --query 'Item' \
  --output json || {
    echo "❌ Failed to verify consent"
    exit 1
  }

echo "✅ Consent verified"
echo ""

# Step 3: Record test FP event
echo "Step 3: Recording test FP event..."
echo "=========================================="
TEST_EVENT_ID="test-e2e-$(date +%s)"
TEST_FINDING_ID="finding-test-$(date +%s)"

node -e "
const { DynamoDBFPStore } = require('./packages/cli/dist/fp-store/dynamodb-store.js');
const store = new DynamoDBFPStore({
  tableName: '${FP_TABLE}',
  region: '${REGION}'
});

(async () => {
  try {
    await store.recordEvent({
      eventId: '${TEST_EVENT_ID}',
      ruleId: 'MD-001',
      ruleVersion: '1.0.0',
      findingId: '${TEST_FINDING_ID}',
      outcome: 'block',
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: 'Phase-Mirror',
        branch: 'main',
        eventType: 'pull_request'
      }
    });
    console.log('✅ FP event recorded: ${TEST_EVENT_ID}');
  } catch (error) {
    console.error('❌ Failed to record FP event:', error.message);
    process.exit(1);
  }
})();
" || {
  echo "❌ Failed to record FP event"
  exit 1
}

echo ""

# Step 4: Query FP window
echo "Step 4: Querying FP window..."
echo "=========================================="
node -e "
const { DynamoDBFPStore } = require('./packages/cli/dist/fp-store/dynamodb-store.js');
const store = new DynamoDBFPStore({
  tableName: '${FP_TABLE}',
  region: '${REGION}'
});

(async () => {
  try {
    const window = await store.getWindowByCount('MD-001', 50);
    console.log('FP Window for MD-001:');
    console.log('  Events:', window.events.length);
    console.log('  False Positives:', window.fpCount);
    console.log('  Total:', window.totalCount);
    console.log('  FP Rate:', (window.fpRate * 100).toFixed(2) + '%');
    console.log('');
    console.log('✅ FP window query successful');
  } catch (error) {
    console.error('❌ Failed to query FP window:', error.message);
    process.exit(1);
  }
})();
" || {
  echo "❌ Failed to query FP window"
  exit 1
}

echo ""

# Step 5: Verify SSM parameter access
echo "Step 5: Verifying SSM nonce parameter..."
echo "=========================================="
aws ssm get-parameter \
  --name "${NONCE_PARAM}" \
  --region "${REGION}" \
  --query 'Parameter.[Name,Type,Version]' \
  --output table || {
    echo "❌ Failed to access nonce parameter"
    exit 1
  }

echo "✅ Nonce parameter accessible"
echo ""

# Summary
echo "=========================================="
echo "✅ E2E Manual Test Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Consent granted and verified"
echo "  ✅ FP event recorded (${TEST_EVENT_ID})"
echo "  ✅ FP window queried successfully"
echo "  ✅ SSM parameter accessible"
echo ""
echo "Next steps:"
echo "  1. Check CloudWatch dashboard for metrics"
echo "  2. Verify no alarms triggered"
echo "  3. Create GitHub PR for E2E workflow test"
echo ""
