#!/usr/bin/env bash
# Load drift detection baseline from S3
set -euo pipefail

ENVIRONMENT="${1:-staging}"

BASELINE_BUCKET="mirror-dissonance-${ENVIRONMENT}-baselines"
BASELINE_KEY="baseline-latest.json"
LOCAL_PATH=".baseline.json"

echo "[baseline] Environment: ${ENVIRONMENT}"
echo "[baseline] Bucket: s3://${BASELINE_BUCKET}/${BASELINE_KEY}"
echo "[baseline] Local path: ${LOCAL_PATH}"

# Check if AWS CLI is available
if ! command -v aws &> /dev/null; then
  echo "[baseline] ERROR: AWS CLI is not installed or not in PATH"
  exit 1
fi

# Attempt to download the baseline
if ! aws s3 cp "s3://${BASELINE_BUCKET}/${BASELINE_KEY}" "${LOCAL_PATH}" --region us-east-1; then
  echo "[baseline] ERROR: Failed to download baseline from s3://${BASELINE_BUCKET}/${BASELINE_KEY}"
  echo "[baseline] Common causes:"
  echo "[baseline]   - Bucket does not exist"
  echo "[baseline]   - Object does not exist"
  echo "[baseline]   - Insufficient AWS permissions"
  echo "[baseline]   - Network connectivity issues"
  exit 1
fi

# Verify the file was created
if [[ ! -f "${LOCAL_PATH}" ]]; then
  echo "[baseline] ERROR: Failed to download baseline to ${LOCAL_PATH}"
  exit 1
fi

# Verify the file is not empty
if [[ ! -s "${LOCAL_PATH}" ]]; then
  echo "[baseline] ERROR: Downloaded baseline file is empty"
  exit 1
fi

# Verify the file contains valid JSON
if ! jq empty "${LOCAL_PATH}" 2>/dev/null; then
  echo "[baseline] WARNING: Downloaded file may not be valid JSON"
fi

echo "[baseline] Baseline loaded successfully."
echo "[baseline] Size: $(wc -c < "${LOCAL_PATH}") bytes"
