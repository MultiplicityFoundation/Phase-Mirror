#!/bin/bash
# test-nonce-rotation.sh
# Tests nonce rotation with zero downtime
# Day 19-20: E2E Validation

set -euo pipefail

ENV="${1:-staging}"
REGION="${2:-us-east-1}"

echo "🔄 Testing Nonce Rotation with Zero Downtime"
echo "============================================="
echo ""
echo "Environment: ${ENV}"
echo "Region: ${REGION}"
echo ""

# Check for uuid generation tool
if command -v uuidgen &> /dev/null; then
  UUID_CMD="uuidgen | tr '[:upper:]' '[:lower:]'"
elif command -v python3 &> /dev/null; then
  UUID_CMD="python3 -c 'import uuid; print(str(uuid.uuid4()))'"
elif command -v python &> /dev/null; then
  UUID_CMD="python -c 'import uuid; print(str(uuid.uuid4()))'"
else
  echo "❌ Error: Cannot generate UUID. Please install uuidgen or Python."
  exit 1
fi

# Step 1: Check current nonce
echo "Step 1: Checking current nonce (v1)..."
echo "========================================"
CURRENT_NONCE=$(aws ssm get-parameter \
  --name "/guardian/${ENV}/redaction_nonce_v1" \
  --region "${REGION}" \
  --query 'Parameter.Version' \
  --output text 2>/dev/null || echo "not-found")

if [ "${CURRENT_NONCE}" = "not-found" ]; then
  echo "⚠️  No v1 nonce found, creating one first..."
  NEW_V1=$(eval "${UUID_CMD}")
  aws ssm put-parameter \
    --name "/guardian/${ENV}/redaction_nonce_v1" \
    --description "HMAC nonce for RedactedText validation - version 1" \
    --type "SecureString" \
    --value "${NEW_V1}" \
    --tags "Key=Version,Value=1" \
    --region "${REGION}"
  echo "✅ v1 nonce created"
else
  echo "✅ Current nonce exists (version ${CURRENT_NONCE})"
fi

echo ""

# Step 2: Create new nonce (v2)
echo "Step 2: Creating new nonce (v2)..."
echo "========================================"
NEW_NONCE=$(eval "${UUID_CMD}")

aws ssm put-parameter \
  --name "/guardian/${ENV}/redaction_nonce_v2" \
  --description "HMAC nonce for RedactedText validation - version 2" \
  --type "SecureString" \
  --value "${NEW_NONCE}" \
  --tags "Key=Version,Value=2" \
  --region "${REGION}" \
  --overwrite 2>/dev/null || {
    echo "⚠️  v2 nonce may already exist, updating..."
    aws ssm put-parameter \
      --name "/guardian/${ENV}/redaction_nonce_v2" \
      --description "HMAC nonce for RedactedText validation - version 2" \
      --type "SecureString" \
      --value "${NEW_NONCE}" \
      --region "${REGION}" \
      --overwrite
  }

echo "✅ v2 nonce created: ${NEW_NONCE}"
echo ""

# Step 3: Verify both nonces exist
echo "Step 3: Verifying both nonces exist..."
echo "========================================"
echo "Nonce v1:"
aws ssm get-parameter \
  --name "/guardian/${ENV}/redaction_nonce_v1" \
  --region "${REGION}" \
  --query 'Parameter.[Name,Type,Version]' \
  --output table

echo ""
echo "Nonce v2:"
aws ssm get-parameter \
  --name "/guardian/${ENV}/redaction_nonce_v2" \
  --region "${REGION}" \
  --query 'Parameter.[Name,Type,Version]' \
  --output table

echo ""
echo "✅ Both nonces verified"
echo ""

# Step 4: Simulate grace period
echo "Step 4: Grace Period Simulation"
echo "========================================"
echo "⏳ In production, this is the deployment phase:"
echo "   1. Deploy code that supports BOTH v1 and v2 nonces"
echo "   2. Wait for cache expiry (typically 1 hour)"
echo "   3. All instances load both nonces"
echo "   4. RedactedText can validate with either nonce"
echo ""
echo "⏭️  Skipping actual wait in test environment"
echo ""

# Step 5: Document rotation completion
echo "Step 5: Rotation Completion (Manual Step)"
echo "========================================"
echo "After grace period, complete rotation:"
echo ""
echo "  # Delete old nonce (v1)"
echo "  aws ssm delete-parameter \\"
echo "    --name \"/guardian/${ENV}/redaction_nonce_v1\" \\"
echo "    --region ${REGION}"
echo ""
echo "  # Update application to use only v2"
echo "  # Deploy code that references v2 as primary"
echo ""
echo "⚠️  DO NOT delete v1 in this test - keeping for rollback capability"
echo ""

# Summary
echo "=========================================="
echo "✅ Nonce Rotation Test Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  ✅ Current nonce verified (v1)"
echo "  ✅ New nonce created (v2)"
echo "  ✅ Both nonces accessible"
echo "  ⏳ Grace period explained"
echo "  📝 Completion steps documented"
echo ""
echo "Production Rotation Procedure:"
echo "  1. Create v2 nonce (✅ completed)"
echo "  2. Deploy dual-nonce code (⏳ pending)"
echo "  3. Wait 1 hour for cache expiry"
echo "  4. Delete v1 nonce"
echo "  5. Deploy v2-only code"
echo ""
echo "See docs/ops/nonce-rotation.md for details"
echo ""
