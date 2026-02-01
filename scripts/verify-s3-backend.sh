#!/bin/bash
# Verify S3 backend configuration

# Source environment configuration with error handling
if [ ! -f .env.aws-bootstrap ]; then
  echo "❌ ERROR: .env.aws-bootstrap not found"
  echo "   Run: source .env.aws-bootstrap to set up environment"
  exit 1
fi

source .env.aws-bootstrap

# Verify required variables are set
if [ -z "$TF_STATE_BUCKET" ]; then
  echo "❌ ERROR: TF_STATE_BUCKET not set"
  echo "   Ensure .env.aws-bootstrap defines all required variables"
  exit 1
fi

echo "=== S3 Backend Verification Report ==="
echo

# Check bucket exists
if aws s3 ls "s3://$TF_STATE_BUCKET" &>/dev/null; then
  echo "✅ Bucket exists: $TF_STATE_BUCKET"
else
  echo "❌ Bucket not found: $TF_STATE_BUCKET"
  exit 1
fi

# Get bucket configuration
echo
echo "## Configuration Details"

# Versioning
echo -n "Versioning: "
aws s3api get-bucket-versioning --bucket "$TF_STATE_BUCKET" --query Status --output text || echo "Not configured"

# Encryption
echo -n "Encryption: "
aws s3api get-bucket-encryption --bucket "$TF_STATE_BUCKET" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text 2>/dev/null || echo "Not configured"

# Public access block
echo "Public Access Block:"
aws s3api get-public-access-block --bucket "$TF_STATE_BUCKET" --query 'PublicAccessBlockConfiguration' --output json 2>/dev/null | jq -r 'to_entries[] | "  \(.key): \(.value)"'

# Tags
echo
echo "## Resource Tags"
aws s3api get-bucket-tagging --bucket "$TF_STATE_BUCKET" --query 'TagSet[]' --output table 2>/dev/null || echo "No tags configured"

# Lifecycle policy
echo
echo "## Lifecycle Policy"
aws s3api get-bucket-lifecycle-configuration --bucket "$TF_STATE_BUCKET" --query 'Rules[].{Id:Id,Status:Status,NoncurrentDays:NoncurrentVersionExpiration.NoncurrentDays}' --output table 2>/dev/null || echo "No lifecycle policy"

echo
echo "✅ S3 backend verification complete"
