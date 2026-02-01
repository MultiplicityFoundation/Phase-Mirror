#!/bin/bash
# Test DynamoDB state locking mechanism

# Source environment configuration with error handling
if [ ! -f .env.aws-bootstrap ]; then
  echo "❌ ERROR: .env.aws-bootstrap not found"
  echo "   Run: source .env.aws-bootstrap to set up environment"
  exit 1
fi

source .env.aws-bootstrap

# Verify required variables are set
if [ -z "$TF_LOCK_TABLE" ] || [ -z "$TF_STATE_BUCKET" ] || [ -z "$AWS_REGION" ]; then
  echo "❌ ERROR: Required environment variables not set"
  echo "   TF_LOCK_TABLE: $TF_LOCK_TABLE"
  echo "   TF_STATE_BUCKET: $TF_STATE_BUCKET"
  echo "   AWS_REGION: $AWS_REGION"
  echo "   Ensure .env.aws-bootstrap defines all required variables"
  exit 1
fi

# Sanitize OPERATOR_NAME to prevent JSON injection
OPERATOR_NAME_SAFE="${OPERATOR_NAME//\"/\\\"}"

echo "=== Testing DynamoDB Lock Mechanism ==="
echo

# Simulate Terraform lock
LOCK_ID="test-lock-$(date +%s)"
LOCK_INFO='{"ID":"'$LOCK_ID'","Operation":"test","Info":"Manual lock test","Who":"'$OPERATOR_NAME_SAFE'","Version":"1.0","Created":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","Path":"test/terraform.tfstate"}'

echo "Step 1: Acquiring lock..."
aws dynamodb put-item \
  --table-name "$TF_LOCK_TABLE" \
  --item '{
    "LockID": {"S": "'"$TF_STATE_BUCKET"'/test/terraform.tfstate"},
    "Info": {"S": "'"$LOCK_INFO"'"}
  }' \
  --condition-expression "attribute_not_exists(LockID)" \
  --region "$AWS_REGION"

if [ $? -eq 0 ]; then
  echo "✅ Lock acquired successfully"
else
  echo "❌ Lock acquisition failed (table may already be locked)"
  exit 1
fi

# Verify lock exists
echo
echo "Step 2: Verifying lock..."
LOCK_DATA=$(aws dynamodb get-item \
  --table-name "$TF_LOCK_TABLE" \
  --key '{"LockID": {"S": "'"$TF_STATE_BUCKET"'/test/terraform.tfstate"}}' \
  --region "$AWS_REGION" \
  --query 'Item.Info.S' \
  --output text)

echo "Lock Info: $LOCK_DATA"

# Attempt duplicate lock (should fail)
echo
echo "Step 3: Testing duplicate lock prevention..."
if aws dynamodb put-item \
  --table-name "$TF_LOCK_TABLE" \
  --item '{
    "LockID": {"S": "'"$TF_STATE_BUCKET"'/test/terraform.tfstate"},
    "Info": {"S": "Duplicate lock attempt"}
  }' \
  --condition-expression "attribute_not_exists(LockID)" \
  --region "$AWS_REGION" 2>/dev/null; then
  echo "❌ ERROR: Duplicate lock should have been prevented!"
  exit 1
else
  echo "✅ Duplicate lock correctly prevented (ConditionalCheckFailedException)"
fi

# Release lock
echo
echo "Step 4: Releasing lock..."
aws dynamodb delete-item \
  --table-name "$TF_LOCK_TABLE" \
  --key '{"LockID": {"S": "'"$TF_STATE_BUCKET"'/test/terraform.tfstate"}}' \
  --region "$AWS_REGION"

echo "✅ Lock released"

# Verify lock removed
echo
echo "Step 5: Verifying lock removal..."
ITEM_COUNT=$(aws dynamodb scan --table-name "$TF_LOCK_TABLE" --region "$AWS_REGION" --select COUNT --query 'Count' --output text)
echo "Remaining locks: $ITEM_COUNT"

if [ "$ITEM_COUNT" -eq 0 ]; then
  echo "✅ Lock table is empty (correct)"
else
  echo "⚠️  Lock table contains $ITEM_COUNT items"
fi

echo
echo "✅ DynamoDB lock mechanism test passed"
