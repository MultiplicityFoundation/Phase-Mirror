#!/usr/bin/env bash
# Test Terraform backend with LocalStack

set -euo pipefail

LOCALSTACK_ENDPOINT="http://localhost:4566"
ORIGINAL_DIR="$(pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Backend LocalStack Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check LocalStack is running
echo "[1/4] Checking LocalStack..."
if curl -s "${LOCALSTACK_ENDPOINT}/_localstack/health" | jq -e '.services.s3 == "running"' > /dev/null; then
  echo "      ✓ LocalStack S3 running"
else
  echo "      ✗ LocalStack not running. Start with:"
  echo "        docker-compose -f localstack-compose.yml up -d"
  exit 1
fi

# Create test bucket
echo ""
echo "[2/4] Creating test S3 bucket..."
aws s3 mb s3://test-terraform-state \
  --endpoint-url "$LOCALSTACK_ENDPOINT" \
  --region us-east-1 2>/dev/null || echo "      (bucket may already exist)"

echo "      ✓ Test bucket ready"

# Create test DynamoDB table
echo ""
echo "[3/4] Creating test DynamoDB table..."
aws dynamodb create-table \
  --table-name test-terraform-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url "$LOCALSTACK_ENDPOINT" \
  --region us-east-1 2>/dev/null || echo "      (table may already exist)"

echo "      ✓ Test lock table ready"

# Create test Terraform config
echo ""
echo "[4/4] Testing Terraform with LocalStack backend..."

mkdir -p /tmp/tf-backend-test
cd /tmp/tf-backend-test

cat > main.tf << 'TFEOF'
terraform {
  backend "s3" {
    bucket         = "test-terraform-state"
    key            = "test.tfstate"
    region         = "us-east-1"
    endpoint       = "http://localhost:4566"
    
    dynamodb_table = "test-terraform-lock"
    
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    force_path_style            = true
  }
}

resource "null_resource" "test" {
  triggers = {
    timestamp = timestamp()
  }
}
TFEOF

# Set LocalStack endpoint for Terraform AWS provider
export AWS_ENDPOINT_URL_S3="$LOCALSTACK_ENDPOINT"
export AWS_ENDPOINT_URL_DYNAMODB="$LOCALSTACK_ENDPOINT"

if terraform init; then
  echo "      ✓ Terraform init with LocalStack backend successful"
else
  echo "      ✗ Terraform init failed"
  exit 1
fi

if terraform apply -auto-approve; then
  echo "      ✓ Terraform apply successful"
else
  echo "      ✗ Terraform apply failed"
  exit 1
fi

# Verify state in S3
if aws s3 ls s3://test-terraform-state/test.tfstate --endpoint-url "$LOCALSTACK_ENDPOINT" &>/dev/null; then
  echo "      ✓ State file written to S3"
else
  echo "      ✗ State file not in S3"
  exit 1
fi

# Cleanup
cd "$ORIGINAL_DIR"
rm -rf /tmp/tf-backend-test

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ LocalStack backend test passed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
