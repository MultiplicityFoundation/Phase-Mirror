#!/usr/bin/env bash
# Create GitHub labels for Phase Mirror issue tracking
# This script is idempotent - it will not fail if labels already exist
# Requires: bash 4.0+ (for associative arrays)
set -euo pipefail

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
  echo "[labels] ERROR: GitHub CLI (gh) is not installed or not in PATH"
  echo "[labels] Install from: https://cli.github.com/"
  exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
  echo "[labels] ERROR: Not authenticated with GitHub CLI"
  echo "[labels] Run: gh auth login"
  exit 1
fi

# Define labels with colors
# Note: Requires bash 4.0+ for associative array support
declare -A LABELS

LABELS["schema-drift"]="#d93f0b"
LABELS["priority-high"]="#b60205"
LABELS["fp-calibration"]="#0e8a16"
LABELS["circuit-breaker"]="#fbca04"
LABELS["governance"]="#5319e7"
LABELS["runtime-enforcement"]="#1d76db"

# Define explicit descriptions for clarity
declare -A DESCRIPTIONS
DESCRIPTIONS["schema-drift"]="Phase Mirror: Schema drift detection"
DESCRIPTIONS["priority-high"]="Phase Mirror: High priority issue"
DESCRIPTIONS["fp-calibration"]="Phase Mirror: False positive calibration"
DESCRIPTIONS["circuit-breaker"]="Phase Mirror: Circuit breaker related"
DESCRIPTIONS["governance"]="Phase Mirror: Governance related"
DESCRIPTIONS["runtime-enforcement"]="Phase Mirror: Runtime enforcement"

echo "[labels] Creating Phase Mirror labels..."
echo ""

# Create or update labels
for name in "${!LABELS[@]}"; do
  color="${LABELS[$name]}"
  description="${DESCRIPTIONS[$name]}"
  
  echo "[labels] Processing '${name}' (${color})..."
  
  # Check if label exists
  if gh label list --json name --jq '.[].name' | grep -Fxq "${name}"; then
    echo "[labels]   ✓ Label '${name}' already exists"
    
    # Update the label with the correct color and description
    if ! gh label edit "${name}" \
      --color "${color}" \
      --description "${description}"; then
      echo "[labels]   ⚠ Warning: Failed to update label '${name}'"
    fi
  else
    echo "[labels]   + Creating label '${name}'"
    
    # Create the label
    if gh label create "${name}" \
      --color "${color}" \
      --description "${description}"; then
      echo "[labels]   ✓ Label '${name}' created successfully"
    else
      echo "[labels]   ✗ Failed to create label '${name}'"
    fi
  fi
  
  echo ""
done

echo "[labels] Label creation complete!"
echo "[labels] Verify at: https://github.com/$(gh repo view --json nameWithOwner --jq .nameWithOwner)/labels"
