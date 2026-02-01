#!/bin/bash
# bootstrap-nonce.sh
# Bootstraps initial SSM nonce parameter for RedactedText validation
# Day 15: Terraform Backend Setup & IAM Configuration

set -euo pipefail

ENV="${1:-staging}"  # Default to staging
REGION="us-east-1"

# Check if uuidgen is available, otherwise use python or another method
if command -v uuidgen &> /dev/null; then
  NONCE=$(uuidgen | tr '[:upper:]' '[:lower:]')
elif command -v python3 &> /dev/null; then
  NONCE=$(python3 -c "import uuid; print(str(uuid.uuid4()))")
elif command -v python &> /dev/null; then
  NONCE=$(python -c "import uuid; print(str(uuid.uuid4()))")
else
  echo "❌ Error: Cannot generate UUID. Please install uuidgen or Python."
  exit 1
fi

echo "🔐 Bootstrapping nonce for environment: ${ENV}"

aws ssm put-parameter \
  --name "/guardian/${ENV}/redaction_nonce_v1" \
  --description "HMAC nonce for RedactedText validation - version 1" \
  --type "SecureString" \
  --value "${NONCE}" \
  --tags "Key=Project,Value=MirrorDissonance" "Key=Component,Value=Redaction" "Key=Version,Value=1" \
  --region "${REGION}"

echo "✅ Nonce created successfully"
echo "   Parameter name: /guardian/${ENV}/redaction_nonce_v1"
echo "   Value: ${NONCE} (store securely!)"
echo ""
echo "⚠️  IMPORTANT: Save this nonce value in a secure location (e.g., password manager)"
echo "   You will need it for rotation operations."
