#!/bin/bash
# Create DynamoDB table for Terraform state locking

set -e

# Source environment configuration with error handling
if [ ! -f .env.aws-bootstrap ]; then
  echo "❌ ERROR: .env.aws-bootstrap not found"
  echo "   Run: source .env.aws-bootstrap to set up environment"
  exit 1
fi

source .env.aws-bootstrap

# Verify required variables are set
if [ -z "$TF_LOCK_TABLE" ] || [ -z "$AWS_REGION" ]; then
  echo "❌ ERROR: Required environment variables not set"
  echo "   TF_LOCK_TABLE: $TF_LOCK_TABLE"
  echo "   AWS_REGION: $AWS_REGION"
  echo "   Ensure .env.aws-bootstrap defines all required variables"
  exit 1
fi

echo "=== Creating Terraform State Lock Table ==="
echo "Table Name: $TF_LOCK_TABLE"
echo "Region: $AWS_REGION"
echo

# Step 1: Create table
echo "Step 1/5: Creating DynamoDB table..."

TABLE_DEFINITION='{
  "TableName": "'"$TF_LOCK_TABLE"'",
  "AttributeDefinitions": [
    {
      "AttributeName": "LockID",
      "AttributeType": "S"
    }
  ],
  "KeySchema": [
    {
      "AttributeName": "LockID",
      "KeyType": "HASH"
    }
  ],
  "BillingMode": "PAY_PER_REQUEST",
  "Tags": [
    {"Key": "Project", "Value": "'"$TAG_PROJECT"'"},
    {"Key": "ManagedBy", "Value": "'"$TAG_MANAGED_BY"'"},
    {"Key": "Environment", "Value": "'"$ENVIRONMENT"'"},
    {"Key": "Owner", "Value": "'"$TAG_OWNER"'"},
    {"Key": "CostCenter", "Value": "'"$TAG_COST_CENTER"'"},
    {"Key": "CreatedBy", "Value": "'"$OPERATOR_NAME"'"},
    {"Key": "CreatedDate", "Value": "'"$(date +%Y-%m-%d)"'"}
  ]
}'

if aws dynamodb create-table --cli-input-json "$TABLE_DEFINITION" --region "$AWS_REGION" &>/dev/null; then
  echo "✅ Table created: $TF_LOCK_TABLE"
else
  if aws dynamodb describe-table --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION" &>/dev/null; then
    echo "⚠️  Table already exists: $TF_LOCK_TABLE"
    echo "   Continuing with configuration..."
  else
    echo "❌ Failed to create table"
    exit 1
  fi
fi

# Step 2: Wait for table to be active
echo
echo "Step 2/5: Waiting for table to become active..."
aws dynamodb wait table-exists --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION"
echo "✅ Table is active"

# Step 3: Enable Point-in-Time Recovery (PITR)
echo
echo "Step 3/5: Enabling Point-in-Time Recovery..."
aws dynamodb update-continuous-backups \
  --table-name "$TF_LOCK_TABLE" \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region "$AWS_REGION"

echo "✅ PITR enabled (35-day recovery window)"

# Step 4: Enable deletion protection (prevents accidental deletion)
echo
echo "Step 4/5: Enabling deletion protection..."
aws dynamodb update-table \
  --table-name "$TF_LOCK_TABLE" \
  --deletion-protection-enabled \
  --region "$AWS_REGION" \
  &>/dev/null || echo "⚠️  Deletion protection not available (older AWS SDK version)"

# Step 5: Create CloudWatch alarm for throttling (optional but recommended)
echo
echo "Step 5/5: Creating CloudWatch alarm for throttled requests..."

ALARM_NAME="${TF_LOCK_TABLE}-ThrottledRequests"
SNS_TOPIC="arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:terraform-backend-alerts"

# Create SNS topic if it doesn't exist
if ! aws sns get-topic-attributes --topic-arn "$SNS_TOPIC" --region "$AWS_REGION" &>/dev/null; then
  aws sns create-topic --name terraform-backend-alerts --region "$AWS_REGION" &>/dev/null
  echo "✅ SNS topic created: terraform-backend-alerts"
fi

aws cloudwatch put-metric-alarm \
  --alarm-name "$ALARM_NAME" \
  --alarm-description "Alert when Terraform lock table experiences throttled requests" \
  --metric-name ThrottledRequests \
  --namespace AWS/DynamoDB \
  --statistic Sum \
  --period 300 \
  --threshold 1 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --dimensions Name=TableName,Value="$TF_LOCK_TABLE" \
  --alarm-actions "$SNS_TOPIC" \
  --region "$AWS_REGION" \
  &>/dev/null || echo "⚠️  CloudWatch alarm creation skipped"

echo "✅ Monitoring configured"

# Verification
echo
echo "=== Verification ==="
TABLE_INFO=$(aws dynamodb describe-table --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION")

echo "Table Status: $(echo "$TABLE_INFO" | jq -r '.Table.TableStatus')"
echo "Billing Mode: $(echo "$TABLE_INFO" | jq -r '.Table.BillingModeSummary.BillingMode')"
echo "Item Count: $(echo "$TABLE_INFO" | jq -r '.Table.ItemCount')"
echo "Key Schema: $(echo "$TABLE_INFO" | jq -r '.Table.KeySchema[0] | "[\(.AttributeName)] \(.KeyType)"')"

# Check PITR status
PITR_STATUS=$(aws dynamodb describe-continuous-backups --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION" --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text)
echo "PITR Status: $PITR_STATUS"

echo
echo "✅ DynamoDB Terraform lock table ready: $TF_LOCK_TABLE"
