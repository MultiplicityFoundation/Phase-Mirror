#!/usr/bin/env bash
# Automated nonce rotation with grace period
set -euo pipefail

ENVIRONMENT="${1:-staging}"
CURRENT_VERSION="${2:-1}"
NEW_VERSION=$((CURRENT_VERSION + 1))

# Validate environment
if [[ "${ENVIRONMENT}" != "staging" && "${ENVIRONMENT}" != "production" ]]; then
  echo "❌ ERROR: Invalid environment '${ENVIRONMENT}'"
  echo "   Valid environments: staging, production"
  exit 1
fi

CURRENT_PARAM="/guardian/${ENVIRONMENT}/redaction_nonce_v${CURRENT_VERSION}"
NEW_PARAM="/guardian/${ENVIRONMENT}/redaction_nonce_v${NEW_VERSION}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mirror Dissonance Nonce Rotation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment:     ${ENVIRONMENT}"
echo "Current Version: v${CURRENT_VERSION}"
echo "New Version:     v${NEW_VERSION}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
  echo "❌ ERROR: AWS CLI is not installed"
  exit 1
fi

# Verify current nonce exists
echo ""
echo "[0/4] Verifying current nonce exists..."
if ! aws ssm get-parameter --name "${CURRENT_PARAM}" --region us-east-1 &> /dev/null; then
  echo "❌ ERROR: Current nonce ${CURRENT_PARAM} not found"
  echo "   Please verify the version number and environment"
  exit 1
fi
echo "      ✓ Current nonce verified: ${CURRENT_PARAM}"

# Generate new nonce (64-char hex = 32 bytes)
echo ""
echo "[1/4] Generating new nonce..."
NEW_NONCE=$(openssl rand -hex 32)
echo "      Generated: ${NEW_NONCE:0:16}... (truncated)"

# Create new nonce parameter
echo ""
echo "[2/4] Creating new nonce v${NEW_VERSION} in SSM..."
if ! aws ssm put-parameter \
  --name "${NEW_PARAM}" \
  --value "${NEW_NONCE}" \
  --type SecureString \
  --region us-east-1 \
  --tags Key=Project,Value=MirrorDissonance Key=Version,Value=${NEW_VERSION} \
  --overwrite; then
  echo "❌ ERROR: Failed to create new nonce parameter"
  echo "   Common causes:"
  echo "   - Insufficient IAM permissions (ssm:PutParameter)"
  echo "   - KMS key access issues"
  echo "   - Network connectivity problems"
  exit 1
fi

echo "      ✓ Created: ${NEW_PARAM}"

# Grace period instructions
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GRACE PERIOD (1-2 hours)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "[3/4] Both v${CURRENT_VERSION} and v${NEW_VERSION} are now valid."
echo ""
echo "Update your services to load both nonces:"
echo ""
echo "  await loadNonce(ssmClient, '${CURRENT_PARAM}');"
echo "  await loadNonce(ssmClient, '${NEW_PARAM}');"
echo ""
echo "Monitor logs for validation errors. If none after 1-2 hours:"
echo ""
echo "[4/4] Remove old nonce:"
echo ""
echo "  aws ssm delete-parameter --name '${CURRENT_PARAM}' --region us-east-1"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Nonce rotation initiated successfully!"
