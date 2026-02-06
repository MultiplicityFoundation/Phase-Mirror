#!/usr/bin/env bash
# scripts/create-labels.sh
# Create required GitHub labels for Phase Mirror issue tracking.
# Idempotent — safe to run multiple times. Existing labels are updated
# to match the canonical description and color.
#
# Usage: ./scripts/create-labels.sh [owner/repo]
# Default: MultiplicityFoundation/Phase-Mirror

set -euo pipefail

REPO="${1:-MultiplicityFoundation/Phase-Mirror}"

log() { echo "[create-labels] $*"; }
err() { echo "[create-labels] ERROR: $*" >&2; }

# Verify gh CLI is available and authenticated
if ! command -v gh >/dev/null 2>&1; then
  err "GitHub CLI (gh) not found. Install: https://cli.github.com"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  err "Not authenticated. Run: gh auth login"
  exit 1
fi

# ── label definitions ───────────────────────────────────────────────
# Format: name|color|description
LABELS=(
  "schema-drift|d93f0b|Schema mismatch between OSS and Pro repos"
  "drift-detection|d93f0b|Drift detection workflow alert"
  "priority-high|b60205|Requires immediate attention"
  "fp-calibration|0e8a16|Related to false positive calibration"
  "circuit-breaker|fbca04|Circuit breaker triggered or related"
  "governance|5319e7|Steward review required"
  "runtime-enforcement|1d76db|Nonce, HMAC, or validation issues"
)

# ── create or update each label ─────────────────────────────────────
CREATED=0
UPDATED=0
FAILED=0

for ENTRY in "${LABELS[@]}"; do
  IFS='|' read -r NAME COLOR DESCRIPTION <<< "${ENTRY}"

  # Check if label already exists
  if gh label list --repo "${REPO}" --json name --jq '.[].name' 2>/dev/null | grep -qx "${NAME}"; then
    # Update existing label to ensure color/description match
    if gh label edit "${NAME}" \
      --repo "${REPO}" \
      --color "${COLOR}" \
      --description "${DESCRIPTION}" >/dev/null 2>&1; then
      log "✓ Updated: ${NAME}"
      ((UPDATED++))
    else
      err "✗ Failed to update: ${NAME}"
      ((FAILED++))
    fi
  else
    # Create new label
    if gh label create "${NAME}" \
      --repo "${REPO}" \
      --color "${COLOR}" \
      --description "${DESCRIPTION}" >/dev/null 2>&1; then
      log "✓ Created: ${NAME}"
      ((CREATED++))
    else
      err "✗ Failed to create: ${NAME}"
      ((FAILED++))
    fi
  fi
done

# ── summary ─────────────────────────────────────────────────────────
echo ""
log "Done: ${CREATED} created, ${UPDATED} updated, ${FAILED} failed"

if [ "${FAILED}" -gt 0 ]; then
  exit 1
fi
