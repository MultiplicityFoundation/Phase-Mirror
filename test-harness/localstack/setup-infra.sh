#!/usr/bin/env bash
# Setup Phase Mirror infrastructure in LocalStack
set -euo pipefail

ENDPOINT="http://localhost:4566"
REGION="us-east-1"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror LocalStack Infrastructure Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Create DynamoDB Tables
echo ""
echo "[1/5] Creating DynamoDB tables..."

# FP Events Table
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name mirror-dissonance-test-fp-events \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=gsi1pk,AttributeType=S \
    AttributeName=gsi1sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    "[{
      \"IndexName\": \"FindingIndex\",
      \"KeySchema\": [
        {\"AttributeName\":\"gsi1pk\",\"KeyType\":\"HASH\"},
        {\"AttributeName\":\"gsi1sk\",\"KeyType\":\"RANGE\"}
      ],
      \"Projection\": {\"ProjectionType\":\"ALL\"},
      \"ProvisionedThroughput\": {
        \"ReadCapacityUnits\":5,
        \"WriteCapacityUnits\":5
      }
    }]" \
  --billing-mode PAY_PER_REQUEST \
  > /dev/null

echo "      ✓ FP Events table created"

# Consent Table
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name mirror-dissonance-test-consent \
  --attribute-definitions AttributeName=orgId,AttributeType=S \
  --key-schema AttributeName=orgId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  > /dev/null

echo "      ✓ Consent table created"

# Block Counter Table
aws dynamodb create-table \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name mirror-dissonance-test-block-counter \
  --attribute-definitions AttributeName=bucketKey,AttributeType=S \
  --key-schema AttributeName=bucketKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  > /dev/null

echo "      ✓ Block Counter table created"

# 2. Create SSM Parameters (Nonces)
echo ""
echo "[2/5] Creating SSM parameters..."

aws ssm put-parameter \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --name "/guardian/test/redaction_nonce_v1" \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --overwrite \
  > /dev/null

echo "      ✓ Nonce v1 created"

aws ssm put-parameter \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --name "/guardian/test/redaction_nonce_v2" \
  --value "$(openssl rand -hex 32)" \
  --type SecureString \
  --overwrite \
  > /dev/null

echo "      ✓ Nonce v2 created (for rotation testing)"

# 3. Create KMS Key (for encryption at rest simulation)
echo ""
echo "[3/5] Creating KMS key..."

KMS_KEY=$(aws kms create-key \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --description "Phase Mirror test encryption key" \
  --query 'KeyMetadata.KeyId' \
  --output text)

echo "      ✓ KMS key created: $KMS_KEY"

# 4. Create S3 Bucket (for drift baselines)
echo ""
echo "[4/5] Creating S3 bucket..."

aws s3 mb s3://mirror-dissonance-test-baselines \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION"

# Upload a test baseline
cat > /tmp/test-baseline.json << 'BASELINE'
{
  "schemaVersion": "1.0.0",
  "timestamp": "2026-02-01T00:00:00Z",
  "workflows": [
    {
      "path": ".github/workflows/ci.yml",
      "hash": "abc123",
      "permissions": {"contents": "read", "pull-requests": "write"}
    }
  ]
}
BASELINE

aws s3 cp /tmp/test-baseline.json \
  s3://mirror-dissonance-test-baselines/baseline-latest.json \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION"

echo "      ✓ S3 bucket created with test baseline"

# 5. Seed test data
echo ""
echo "[5/5] Seeding test data..."

# Grant consent for test org
aws dynamodb put-item \
  --endpoint-url "$ENDPOINT" \
  --region "$REGION" \
  --table-name mirror-dissonance-test-consent \
  --item '{
    "orgId": {"S": "TestOrg"},
    "state": {"S": "granted"},
    "grantedAt": {"S": "2026-02-01T00:00:00Z"},
    "grantedBy": {"S": "test-admin"},
    "policyVersion": {"S": "1.0.0"},
    "resources": {"L": [
      {"S": "fppatterns"},
      {"S": "fpmetrics"},
      {"S": "crossorgbenchmarks"}
    ]}
  }' \
  > /dev/null

echo "      ✓ Test consent record created"

# Add some FP events
for i in {1..5}; do
  aws dynamodb put-item \
    --endpoint-url "$ENDPOINT" \
    --region "$REGION" \
    --table-name mirror-dissonance-test-fp-events \
    --item "{
      \"pk\": {\"S\": \"rule:MD-001\"},
      \"sk\": {\"S\": \"event:2026-02-0${i}T12:00:00Z#evt-00${i}\"},
      \"gsi1pk\": {\"S\": \"finding:finding-00${i}\"},
      \"gsi1sk\": {\"S\": \"rule:MD-001#1.0.0\"},
      \"eventId\": {\"S\": \"evt-00${i}\"},
      \"ruleId\": {\"S\": \"MD-001\"},
      \"ruleVersion\": {\"S\": \"1.0.0\"},
      \"findingId\": {\"S\": \"finding-00${i}\"},
      \"outcome\": {\"S\": \"block\"},
      \"isFalsePositive\": {\"BOOL\": $([ $i -eq 2 ] && echo true || echo false)},
      \"timestamp\": {\"S\": \"2026-02-0${i}T12:00:00Z\"},
      \"context\": {\"M\": {
        \"repo\": {\"S\": \"test/repo\"},
        \"branch\": {\"S\": \"main\"},
        \"eventType\": {\"S\": \"pullrequest\"}
      }}
    }" \
    > /dev/null
done

echo "      ✓ 5 test FP events created (1 false positive)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "LocalStack infrastructure ready ✓"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Endpoints:"
echo "  DynamoDB: http://localhost:4566"
echo "  SSM:      http://localhost:4566"
echo "  S3:       http://localhost:4566"
echo ""
echo "Tables:"
echo "  - mirror-dissonance-test-fp-events (5 events)"
echo "  - mirror-dissonance-test-consent (1 org)"
echo "  - mirror-dissonance-test-block-counter (empty)"
echo ""
echo "Use AWS CLI with: --endpoint-url http://localhost:4566"
