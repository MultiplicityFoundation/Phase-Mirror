#!/bin/bash
set -euo pipefail

REGION="us-east-1"
ALARM_PREFIX="mirror-dissonance-production"

echo "🧪 Testing CloudWatch alarms..."

# Test SSM alarm by triggering UserErrors (attempt invalid parameter)
echo "1. Testing SSM nonce failures alarm..."
for i in {1..6}; do
  aws ssm get-parameter \
    --name /guardian/production/nonexistent-param \
    --region "${REGION}" 2>/dev/null || true
  sleep 1
done

echo "   ⏱️  Wait 5 minutes, then check for alarm notification email"
echo ""

# Test DynamoDB throttling alarm (simulate via batch writes to trigger throttle)
echo "2. Testing DynamoDB throttle alarm..."
echo "   ⚠️  Skip this in production - only test in staging"
echo ""

# Manually set alarm to ALARM state for testing
echo "3. Manually triggering test alarm..."
aws cloudwatch set-alarm-state \
  --alarm-name "${ALARM_PREFIX}-ssm-nonce-failures" \
  --state-value ALARM \
  --state-reason "Manual test trigger" \
  --region "${REGION}"

echo "   📧 Check email for test alert"
echo ""

# Reset alarm
sleep 10
aws cloudwatch set-alarm-state \
  --alarm-name "${ALARM_PREFIX}-ssm-nonce-failures" \
  --state-value OK \
  --state-reason "Test complete" \
  --region "${REGION}"

echo "✅ Alarm testing complete"
