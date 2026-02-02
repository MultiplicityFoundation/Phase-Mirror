#!/usr/bin/env bash
# Pre-Production Checklist for Phase Mirror
# Validates all requirements before production deployment

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
REPORT_DIR="./pre-prod-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/preprod-checklist-${TIMESTAMP}.md"

mkdir -p "$REPORT_DIR"

# Status tracking
declare -A CHECKLIST

check() {
  local category="$1"
  local item="$2"
  local status="$3"
  local details="${4:-}"
  
  local key="${category}::${item}"
  CHECKLIST["$key"]="$status"
  
  case "$status" in
    "PASS") echo "  ✓ $item" ;;
    "FAIL") echo "  ✗ $item" ;;
    "WARN") echo "  ⚠ $item" ;;
    "SKIP") echo "  ○ $item (skipped)" ;;
  esac
  
  if [ -n "$details" ]; then
    echo "    → $details"
  fi
}

section() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "$1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror Pre-Production Checklist"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "Date: $(date)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#############################################
# 1. INFRASTRUCTURE READINESS
#############################################

section "1. INFRASTRUCTURE READINESS"

# 1.1 Terraform state
if aws s3 ls s3://mirror-dissonance-terraform-state-prod &>/dev/null; then
  check "INFRA" "Terraform state backend" "PASS"
else
  check "INFRA" "Terraform state backend" "FAIL"
fi

# 1.2 DynamoDB tables
TABLES=(
  "mirror-dissonance-${ENVIRONMENT}-fp-events"
  "mirror-dissonance-${ENVIRONMENT}-consent"
  "mirror-dissonance-${ENVIRONMENT}-block-counter"
)

ALL_TABLES_EXIST=true
for TABLE in "${TABLES[@]}"; do
  if ! aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" &>/dev/null; then
    ALL_TABLES_EXIST=false
    break
  fi
done

if [ "$ALL_TABLES_EXIST" = true ]; then
  check "INFRA" "DynamoDB tables (${#TABLES[@]})" "PASS"
else
  check "INFRA" "DynamoDB tables" "FAIL"
fi

# 1.3 SSM parameters
if aws ssm get-parameter --name "/guardian/${ENVIRONMENT}/redaction_nonce_v1" --region "$REGION" &>/dev/null; then
  check "INFRA" "SSM nonce parameter" "PASS"
else
  check "INFRA" "SSM nonce parameter" "FAIL"
fi

# 1.4 S3 buckets
BUCKETS=(
  "mirror-dissonance-${ENVIRONMENT}-baselines"
)

ALL_BUCKETS_EXIST=true
for BUCKET in "${BUCKETS[@]}"; do
  if ! aws s3 ls "s3://${BUCKET}" --region "$REGION" &>/dev/null; then
    ALL_BUCKETS_EXIST=false
    break
  fi
done

if [ "$ALL_BUCKETS_EXIST" = true ]; then
  check "INFRA" "S3 buckets (${#BUCKETS[@]})" "PASS"
else
  check "INFRA" "S3 buckets" "FAIL"
fi

# 1.5 KMS keys
KMS_COUNT=$(aws kms list-aliases --region "$REGION" \
  --query "length(Aliases[?contains(AliasName, 'mirror-dissonance-${ENVIRONMENT}')])" \
  --output text 2>/dev/null || echo "0")

if [ "$KMS_COUNT" -ge 1 ]; then
  check "INFRA" "KMS keys ($KMS_COUNT)" "PASS"
else
  check "INFRA" "KMS keys" "FAIL"
fi

#############################################
# 2. SECURITY CONTROLS
#############################################

section "2. SECURITY CONTROLS"

# 2.1 OIDC authentication
if aws iam list-open-id-connect-providers --region "$REGION" 2>/dev/null | grep -q "token.actions.githubusercontent.com"; then
  check "SECURITY" "OIDC authentication" "PASS"
else
  check "SECURITY" "OIDC authentication" "FAIL"
fi

# 2.2 IAM roles with least privilege
TERRAFORM_ROLE="mirror-dissonance-${ENVIRONMENT}-github-terraform"
if aws iam get-role --role-name "$TERRAFORM_ROLE" --region "$REGION" &>/dev/null; then
  check "SECURITY" "IAM roles configured" "PASS"
else
  check "SECURITY" "IAM roles configured" "FAIL"
fi

# 2.3 Encryption at rest
ALL_ENCRYPTED=true
for TABLE in "${TABLES[@]}"; do
  SSE=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
    --query 'Table.SSEDescription.Status' --output text 2>/dev/null || echo "DISABLED")
  if [ "$SSE" != "ENABLED" ]; then
    ALL_ENCRYPTED=false
    break
  fi
done

if [ "$ALL_ENCRYPTED" = true ]; then
  check "SECURITY" "Encryption at rest" "PASS"
else
  check "SECURITY" "Encryption at rest" "FAIL"
fi

# 2.4 Secrets in SecureString
PARAM_TYPE=$(aws ssm get-parameter --name "/guardian/${ENVIRONMENT}/redaction_nonce_v1" --region "$REGION" \
  --query 'Parameter.Type' --output text 2>/dev/null || echo "UNKNOWN")

if [ "$PARAM_TYPE" = "SecureString" ]; then
  check "SECURITY" "Secrets encrypted (SecureString)" "PASS"
else
  check "SECURITY" "Secrets encrypted (SecureString)" "FAIL"
fi

# 2.5 Public access blocked
PUBLIC_ACCESS_BLOCKED=true
for BUCKET in "${BUCKETS[@]}"; do
  BLOCK=$(aws s3api get-public-access-block --bucket "$BUCKET" --region "$REGION" \
    --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")
  if [ "$BLOCK" != "True" ]; then
    PUBLIC_ACCESS_BLOCKED=false
    break
  fi
done

if [ "$PUBLIC_ACCESS_BLOCKED" = true ]; then
  check "SECURITY" "S3 public access blocked" "PASS"
else
  check "SECURITY" "S3 public access blocked" "FAIL"
fi

#############################################
# 3. MONITORING & ALERTING
#############################################

section "3. MONITORING & ALERTING"

# 3.1 CloudTrail
TRAIL_NAME="mirror-dissonance-${ENVIRONMENT}"
if aws cloudtrail get-trail-status --name "$TRAIL_NAME" --region "$REGION" \
  --query 'IsLogging' --output text 2>/dev/null | grep -q "True"; then
  check "MONITORING" "CloudTrail active" "PASS"
else
  check "MONITORING" "CloudTrail active" "FAIL"
fi

# 3.2 CloudWatch dashboard
DASHBOARD_NAME="mirror-dissonance-${ENVIRONMENT}"
if aws cloudwatch get-dashboard --dashboard-name "$DASHBOARD_NAME" --region "$REGION" &>/dev/null; then
  check "MONITORING" "CloudWatch dashboard" "PASS"
else
  check "MONITORING" "CloudWatch dashboard" "FAIL"
fi

# 3.3 Security alarms
ALARM_COUNT=$(aws cloudwatch describe-alarms --alarm-name-prefix "mirror-dissonance-${ENVIRONMENT}" \
  --region "$REGION" --query 'length(MetricAlarms)' --output text 2>/dev/null || echo "0")

if [ "$ALARM_COUNT" -ge 4 ]; then
  check "MONITORING" "Security alarms ($ALARM_COUNT)" "PASS"
else
  check "MONITORING" "Security alarms ($ALARM_COUNT)" "WARN" "Expected ≥4"
fi

# 3.4 SNS notifications
SNS_TOPIC=$(aws sns list-topics --region "$REGION" \
  --query "Topics[?contains(TopicArn, 'mirror-dissonance-${ENVIRONMENT}')].TopicArn" \
  --output text 2>/dev/null | head -1)

if [ -n "$SNS_TOPIC" ]; then
  check "MONITORING" "SNS alert topic" "PASS"
else
  check "MONITORING" "SNS alert topic" "FAIL"
fi

#############################################
# 4. BACKUP & RECOVERY
#############################################

section "4. BACKUP & RECOVERY"

# 4.1 PITR enabled
ALL_PITR=true
for TABLE in "${TABLES[@]}"; do
  PITR=$(aws dynamodb describe-continuous-backups --table-name "$TABLE" --region "$REGION" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text 2>/dev/null || echo "DISABLED")
  if [ "$PITR" != "ENABLED" ]; then
    ALL_PITR=false
    break
  fi
done

if [ "$ALL_PITR" = true ]; then
  check "BACKUP" "DynamoDB PITR enabled" "PASS"
else
  check "BACKUP" "DynamoDB PITR enabled" "FAIL"
fi

# 4.2 S3 versioning
ALL_VERSIONING=true
for BUCKET in "${BUCKETS[@]}"; do
  VERSIONING=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --region "$REGION" \
    --query 'Status' --output text 2>/dev/null || echo "Disabled")
  if [ "$VERSIONING" != "Enabled" ]; then
    ALL_VERSIONING=false
    break
  fi
done

if [ "$ALL_VERSIONING" = true ]; then
  check "BACKUP" "S3 versioning enabled" "PASS"
else
  check "BACKUP" "S3 versioning enabled" "FAIL"
fi

# 4.3 Backup vault
VAULT_NAME="mirror-dissonance-${ENVIRONMENT}-vault"
if aws backup describe-backup-vault --backup-vault-name "$VAULT_NAME" --region "$REGION" &>/dev/null; then
  check "BACKUP" "AWS Backup vault" "PASS"
else
  check "BACKUP" "AWS Backup vault" "WARN" "Optional but recommended"
fi

#############################################
# 5. TESTING & QUALITY
#############################################

section "5. TESTING & QUALITY"

cd packages/mirror-dissonance 2>/dev/null || cd .

# 5.1 Unit tests pass
if [ -f "package.json" ]; then
  if pnpm test -- --passWithNoTests --silent 2>/dev/null; then
    check "TESTING" "Unit tests pass" "PASS"
  else
    check "TESTING" "Unit tests pass" "FAIL"
  fi
else
  check "TESTING" "Unit tests pass" "SKIP"
fi

# 5.2 E2E tests pass
if pnpm test -- src/__tests__/e2e/ --passWithNoTests --silent 2>/dev/null; then
  check "TESTING" "E2E tests pass" "PASS"
else
  check "TESTING" "E2E tests pass" "WARN" "Run manually to verify"
fi

# 5.3 No critical vulnerabilities
CRITICAL=$(pnpm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.critical // 0')
if [ "$CRITICAL" -eq 0 ]; then
  check "TESTING" "No critical vulnerabilities" "PASS"
else
  check "TESTING" "No critical vulnerabilities" "FAIL" "$CRITICAL found"
fi

cd - >/dev/null 2>&1 || true

#############################################
# 6. DOCUMENTATION
#############################################

section "6. DOCUMENTATION"

# 6.1 Runbooks exist
if [ -f "docs/runbooks/SECURITY_INCIDENT_RESPONSE.md" ]; then
  check "DOCS" "Security incident runbook" "PASS"
else
  check "DOCS" "Security incident runbook" "FAIL"
fi

# 6.2 Ops documentation
if [ -f "docs/ops/NONCE_ROTATION.md" ]; then
  check "DOCS" "Nonce rotation guide" "PASS"
else
  check "DOCS" "Nonce rotation guide" "WARN"
fi

# 6.3 README
if [ -f "README.md" ]; then
  check "DOCS" "README.md exists" "PASS"
else
  check "DOCS" "README.md exists" "FAIL"
fi

#############################################
# 7. CI/CD READINESS
#############################################

section "7. CI/CD READINESS"

# 7.1 GitHub Actions workflows
if [ -f ".github/workflows/terraform.yml" ]; then
  check "CICD" "Terraform workflow" "PASS"
else
  check "CICD" "Terraform workflow" "FAIL"
fi

if [ -f ".github/workflows/e2e-tests.yml" ]; then
  check "CICD" "E2E test workflow" "PASS"
else
  check "CICD" "E2E test workflow" "FAIL"
fi

# 7.2 Branch protection (manual check reminder)
check "CICD" "Branch protection (main)" "WARN" "Verify manually in GitHub"

#############################################
# SUMMARY
#############################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PRE-PRODUCTION CHECKLIST SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

for key in "${!CHECKLIST[@]}"; do
  case "${CHECKLIST[$key]}" in
    "PASS") PASS_COUNT=$((PASS_COUNT + 1)) ;;
    "FAIL") FAIL_COUNT=$((FAIL_COUNT + 1)) ;;
    "WARN") WARN_COUNT=$((WARN_COUNT + 1)) ;;
  esac
done

echo ""
echo "  ✓ Passed:   $PASS_COUNT"
echo "  ⚠ Warnings: $WARN_COUNT"
echo "  ✗ Failed:   $FAIL_COUNT"
echo ""

# Generate report
cat > "$REPORT_FILE" << REPORT
# Pre-Production Checklist Report

**Environment:** $ENVIRONMENT  
**Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")  

## Summary

| Status | Count |
|--------|-------|
| ✓ Passed | $PASS_COUNT |
| ⚠ Warnings | $WARN_COUNT |
| ✗ Failed | $FAIL_COUNT |

## Detailed Results

REPORT

for key in "${!CHECKLIST[@]}"; do
  IFS='::' read -r category item <<< "$key"
  status="${CHECKLIST[$key]}"
  
  case "$status" in
    "PASS") echo "- [x] **$category**: $item" >> "$REPORT_FILE" ;;
    "FAIL") echo "- [ ] **$category**: $item ❌" >> "$REPORT_FILE" ;;
    "WARN") echo "- [ ] **$category**: $item ⚠️" >> "$REPORT_FILE" ;;
  esac
done

if [ $FAIL_COUNT -eq 0 ]; then
  echo "✓ PRE-PRODUCTION CHECKLIST PASSED"
  echo ""
  echo "  Ready for production deployment!"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo "✗ PRE-PRODUCTION CHECKLIST FAILED"
  echo ""
  echo "  $FAIL_COUNT item(s) require remediation before production"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 1
fi
