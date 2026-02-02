#!/usr/bin/env bash
# Terraform Infrastructure Security Scan

set -euo pipefail

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Terraform Security Scan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd infra/terraform

ISSUES=0

echo "[1/5] Checking for hardcoded secrets..."

# Check for hardcoded secrets
SECRETS_FOUND=$(grep -rn --include="*.tf" -E "(password|secret|key)\s*=\s*\"[^\"]+\"" . 2>/dev/null | \
  grep -v "key_id" | grep -v "kms_key" | grep -v "alias" | grep -v "variable" || true)

if [ -n "$SECRETS_FOUND" ]; then
  echo "  ⚠ Potential hardcoded secrets found:"
  echo "$SECRETS_FOUND" | head -5
  ISSUES=$((ISSUES + 1))
else
  echo "  ✓ No hardcoded secrets detected"
fi

echo ""
echo "[2/5] Checking encryption configurations..."

# Check DynamoDB encryption
if grep -q "server_side_encryption" modules/dynamodb/*.tf 2>/dev/null; then
  echo "  ✓ DynamoDB encryption configured"
else
  echo "  ✗ DynamoDB encryption may not be configured"
  ISSUES=$((ISSUES + 1))
fi

# Check S3 encryption
if grep -q "server_side_encryption_configuration" *.tf modules/*/*.tf 2>/dev/null; then
  echo "  ✓ S3 encryption configured"
else
  echo "  ✗ S3 encryption may not be configured"
  ISSUES=$((ISSUES + 1))
fi

echo ""
echo "[3/5] Checking public access configurations..."

# Check S3 public access block
if grep -q "block_public_acls" *.tf modules/*/*.tf 2>/dev/null; then
  echo "  ✓ S3 public access block configured"
else
  echo "  ✗ S3 public access block may not be configured"
  ISSUES=$((ISSUES + 1))
fi

echo ""
echo "[4/5] Checking logging configurations..."

# Check CloudTrail
if grep -q "aws_cloudtrail" modules/audit/*.tf 2>/dev/null; then
  echo "  ✓ CloudTrail configured"
else
  echo "  ⚠ CloudTrail may not be configured"
  ISSUES=$((ISSUES + 1))
fi

# Check log file validation
if grep -q "enable_log_file_validation.*true" modules/audit/*.tf 2>/dev/null; then
  echo "  ✓ Log file validation enabled"
else
  echo "  ⚠ Log file validation may not be enabled"
fi

echo ""
echo "[5/5] Checking IAM configurations..."

# Check for overly permissive policies
STAR_RESOURCES=$(grep -rn --include="*.tf" '"Resource".*"\*"' . 2>/dev/null | \
  grep -v "kms:ViaService" | grep -v "condition" || true)

if [ -n "$STAR_RESOURCES" ]; then
  STAR_COUNT=$(echo "$STAR_RESOURCES" | wc -l)
  echo "  ⚠ Found $STAR_COUNT potential '*' resource policies - review for least privilege"
else
  echo "  ✓ No obvious overly permissive policies"
fi

cd - >/dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ISSUES -eq 0 ]; then
  echo "✓ Terraform security scan passed"
  exit 0
else
  echo "⚠ Found $ISSUES potential issues - review recommended"
  exit 0  # Warning only, not failure
fi
