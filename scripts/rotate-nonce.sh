#!/usr/bin/env bash
# scripts/rotate-nonce.sh
# Automated nonce rotation with grace period.
# Implements the pattern from docs/ops/nonce-rotation.md:
#   Create v(N+1) → load both for 1 hour → manually delete vN
#
# Usage: ./scripts/rotate-nonce.sh <environment> <current-version>
#
# Exit codes:
#   0 - new nonce created successfully
#   1 - unrecoverable error

set -euo pipefail

# ── args ────────────────────────────────────────────────────────────
ENVIRONMENT="${1:?Usage: rotate-nonce.sh <environment> <current-version>}"
CURRENT_VERSION="${2:?Usage: rotate-nonce.sh <environment> <current-version>}"
NEW_VERSION=$((CURRENT_VERSION + 1))
REGION="${AWS_REGION:-us-east-1}"

CURRENT_PARAM="guardian/${ENVIRONMENT}/redaction/nonce/v${CURRENT_VERSION}"
NEW_PARAM="guardian/${ENVIRONMENT}/redaction/nonce/v${NEW_VERSION}"

# ── logging ─────────────────────────────────────────────────────────
log()  { echo "[rotate-nonce] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
err()  { log "ERROR: $*" >&2; }
die()  { err "$*"; exit 1; }

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Mirror Dissonance Nonce Rotation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment:     ${ENVIRONMENT}"
echo "Current Version: v${CURRENT_VERSION}"
echo "New Version:     v${NEW_VERSION}"
echo "Current Param:   ${CURRENT_PARAM}"
echo "New Param:       ${NEW_PARAM}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── preflight ───────────────────────────────────────────────────────
command -v aws     >/dev/null 2>&1 || die "aws CLI not found in PATH"
command -v openssl >/dev/null 2>&1 || die "openssl not found in PATH"

# ── verify current nonce ────────────────────────────────────────────
log "Verifying current nonce exists..."
if ! aws ssm get-parameter --name "${CURRENT_PARAM}" --region "${REGION}" >/dev/null 2>&1; then
  die "Current nonce ${CURRENT_PARAM} not found in SSM"
fi
log "✓ Current nonce verified: ${CURRENT_PARAM}"

# ── generate new nonce ──────────────────────────────────────────────
log "Generating new nonce..."
NEW_NONCE=$(openssl rand -hex 32)
log "Generated: ${NEW_NONCE:0:16}... (truncated for security)"

# ── create new parameter ────────────────────────────────────────────
log "Creating new nonce v${NEW_VERSION} in SSM..."
if ! aws ssm put-parameter \
  --name "${NEW_PARAM}" \
  --value "${NEW_NONCE}" \
  --type SecureString \
  --region "${REGION}" \
  --tags Key=Project,Value=MirrorDissonance Key=Version,Value="${NEW_VERSION}" \
  --overwrite; then
  die "Failed to create new nonce parameter ${NEW_PARAM}"
fi
log "✓ Created: ${NEW_PARAM}"

# ── grace period instructions ───────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "GRACE PERIOD — DO NOT DELETE v${CURRENT_VERSION} YET"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Both v${CURRENT_VERSION} and v${NEW_VERSION} are now valid."
echo "After 1 hour, run:"
echo ""
echo "  aws ssm delete-parameter --name '${CURRENT_PARAM}' --region ${REGION}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "✅ Nonce rotation initiated successfully"
