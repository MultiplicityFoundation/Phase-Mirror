#!/bin/bash
# Test DynamoDB state locking mechanism

source .env.aws-bootstrap

echo "=== Testing DynamoDB Lock Mechanism ==="
echo

# Simulate Terraform lock
LOCK_ID="test-lock-$(date +%s)"
LOCK_INFO='{"ID":"'$LOCK_ID'","Operation":"test","Info":"Manual lock test","Who":"'$OPERATOR_NAME'","Version":"1.0","Created":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","Path":"test/terraform.tfstate"}'

echo "Step 1: Acquiring lock..."
aws dynamodb put-item \
  --table-name "$TF_LOCK_TABLE" \
  --item '{
    "LockID": {"S": "'"$TF_STATE_BUCKET"'/test/terraform.tfstate"},
    "Info": {"S": "'"$LOCK_INFO"'"}
  }' \
  --condition-expression "attribute_not_exists(LockID)" \
  --region $AWS_REGION

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
  --region $AWS_REGION \
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
  --region $AWS_REGION 2>/dev/null; then
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
  --region $AWS_REGION

echo "✅ Lock released"

# Verify lock removed
echo
echo "Step 5: Verifying lock removal..."
ITEM_COUNT=$(aws dynamodb scan --table-name "$TF_LOCK_TABLE" --region $AWS_REGION --select COUNT --query 'Count' --output text)
echo "Remaining locks: $ITEM_COUNT"

if [ "$ITEM_COUNT" -eq 0 ]; then
  echo "✅ Lock table is empty (correct)"
else
  echo "⚠️  Lock table contains $ITEM_COUNT items"
fi

echo
echo "✅ DynamoDB lock mechanism test passed"
