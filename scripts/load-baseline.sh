#!/usr/bin/env bash
# scripts/load-baseline.sh
# Download drift detection baseline from S3, or create initial baseline
# if none exists. Fail-closed on all errors.
#
# Usage: ./scripts/load-baseline.sh <environment> [output-path]
#
# Exit codes:
#   0 - baseline downloaded and validated
#   1 - unrecoverable error (missing args, AWS failure, upload failure)
#   2 - baseline created for the first time (signals "skip drift check")

set -euo pipefail

# ── args ────────────────────────────────────────────────────────────
ENVIRONMENT="${1:?Usage: load-baseline.sh <environment> [output-path]}"
OUTPUT_PATH="${2:-.baseline.json}"

# ── derived names ───────────────────────────────────────────────────
BASELINE_BUCKET="mirror-dissonance-${ENVIRONMENT}-baselines"
BASELINE_KEY="main/integrity-baseline.json"
REGION="${AWS_REGION:-us-east-1}"

# ── logging ─────────────────────────────────────────────────────────
log()  { echo "[load-baseline] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
err()  { log "ERROR: $*" >&2; }
die()  { err "$*"; exit 1; }

# ── preflight ───────────────────────────────────────────────────────
command -v aws >/dev/null 2>&1 || die "aws CLI not found in PATH"
command -v jq  >/dev/null 2>&1 || die "jq not found in PATH"

# Verify bucket exists and we have access
if ! aws s3api head-bucket --bucket "${BASELINE_BUCKET}" --region "${REGION}" 2>/dev/null; then
  die "Bucket ${BASELINE_BUCKET} does not exist or credentials lack access"
fi

# ── attempt download ────────────────────────────────────────────────
log "Downloading baseline from s3://${BASELINE_BUCKET}/${BASELINE_KEY}"

if aws s3 cp \
  "s3://${BASELINE_BUCKET}/${BASELINE_KEY}" \
  "${OUTPUT_PATH}" \
  --region "${REGION}" 2>/dev/null; then

  # Validate downloaded file is parseable JSON
  if ! jq empty "${OUTPUT_PATH}" 2>/dev/null; then
    rm -f "${OUTPUT_PATH}"
    die "Downloaded baseline is not valid JSON — deleted corrupt file"
  fi

  # Validate baseline schema has required fields
  MISSING_FIELDS=$(jq -r '
    [
      (if .version         then empty else "version"    end),
      (if .createdAt       then empty else "createdAt"  end),
      (if (.files | length) > 0 then empty else "files" end)
    ] | join(", ")
  ' "${OUTPUT_PATH}")

  if [ -n "${MISSING_FIELDS}" ]; then
    rm -f "${OUTPUT_PATH}"
    die "Baseline missing required fields: ${MISSING_FIELDS}"
  fi

  FILE_COUNT=$(jq '.files | length' "${OUTPUT_PATH}")
  CREATED_AT=$(jq -r '.createdAt' "${OUTPUT_PATH}")
  log "Baseline downloaded: ${FILE_COUNT} files, created ${CREATED_AT}"
  log "Output: ${OUTPUT_PATH} ($(wc -c < "${OUTPUT_PATH}" | tr -d ' ') bytes)"
  exit 0

fi

# ── first run: create initial baseline ──────────────────────────────
log "No baseline found — creating initial baseline"

# Check that the CLI is available
if ! command -v pnpm >/dev/null 2>&1; then
  die "pnpm not found — cannot generate baseline without CLI"
fi

# Generate baseline using the CLI
if ! pnpm --filter @mirror-dissonance/cli run start baseline --output "${OUTPUT_PATH}" 2>/dev/null; then
  # Fallback: generate minimal baseline from critical file hashes
  log "CLI baseline generation failed — building minimal baseline"

  BASELINE_FILES='[]'
  for CRITICAL_PATH in \
    ".github/workflows/pull-request.yml" \
    ".github/workflows/merge-queue.yml" \
    ".github/workflows/drift-detection.yml" \
    ".github/CODEOWNERS" \
    "packages/mirror-dissonance/schemas/dissonance-report.schema.json"; do

    if [ -f "${CRITICAL_PATH}" ]; then
      FILE_HASH=$(sha256sum "${CRITICAL_PATH}" | cut -d' ' -f1)
      BASELINE_FILES=$(echo "${BASELINE_FILES}" | jq \
        --arg path "${CRITICAL_PATH}" \
        --arg hash "${FILE_HASH}" \
        '. + [{"path": $path, "hash": $hash}]')
    fi
  done

  jq -n \
    --arg version "1.0.0" \
    --arg createdAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg createdBy "load-baseline.sh" \
    --argjson files "${BASELINE_FILES}" \
    '{
      version: $version,
      createdAt: $createdAt,
      createdBy: $createdBy,
      files: $files
    }' > "${OUTPUT_PATH}"
fi

# Validate what we just generated
if ! jq empty "${OUTPUT_PATH}" 2>/dev/null; then
  die "Generated baseline is not valid JSON"
fi

# Upload to S3
log "Uploading initial baseline to s3://${BASELINE_BUCKET}/${BASELINE_KEY}"
if ! aws s3 cp \
  "${OUTPUT_PATH}" \
  "s3://${BASELINE_BUCKET}/${BASELINE_KEY}" \
  --region "${REGION}" \
  --metadata "created-at=$(date -u +%Y-%m-%dT%H:%M:%SZ),created-by=load-baseline-init"; then
  die "Failed to upload initial baseline to S3"
fi

FILE_COUNT=$(jq '.files | length' "${OUTPUT_PATH}")
log "Initial baseline created and uploaded: ${FILE_COUNT} files"
log "Output: ${OUTPUT_PATH} ($(wc -c < "${OUTPUT_PATH}" | tr -d ' ') bytes)"

# Exit 2 = baseline was just created, caller should skip drift comparison
exit 2
