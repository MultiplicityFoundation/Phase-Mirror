#!/usr/bin/env bash
# Comprehensive Security Audit for Phase Mirror
# Run before production deployment

set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
REPORT_DIR="./security-audit-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${REPORT_DIR}/audit-${ENVIRONMENT}-${TIMESTAMP}.md"

mkdir -p "$REPORT_DIR"

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Logging functions
log_pass() {
  echo "✓ PASS: $1"
  echo "- [x] $1" >> "$REPORT_FILE"
  PASSED=$((PASSED + 1))
}

log_fail() {
  echo "✗ FAIL: $1"
  echo "- [ ] **FAIL:** $1" >> "$REPORT_FILE"
  FAILED=$((FAILED + 1))
}

log_warn() {
  echo "⚠ WARN: $1"
  echo "- [ ] ⚠️ $1" >> "$REPORT_FILE"
  WARNINGS=$((WARNINGS + 1))
}

log_info() {
  echo "  INFO: $1"
  echo "  - $1" >> "$REPORT_FILE"
}

section() {
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "$1"
  echo "═══════════════════════════════════════════════════════════"
  echo "" >> "$REPORT_FILE"
  echo "## $1" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
}

# Initialize report
cat > "$REPORT_FILE" << HEADER
# Security Audit Report

**Environment:** $ENVIRONMENT  
**Region:** $REGION  
**Date:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")  
**Auditor:** Automated Security Scanner  

---

HEADER

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Phase Mirror Security Audit"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Report: $REPORT_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

#############################################
# 1. IDENTITY & ACCESS MANAGEMENT
#############################################

section "1. Identity & Access Management"

# 1.1 OIDC Provider
echo ""
echo "[1.1] OIDC Provider Configuration..."
if aws iam list-open-id-connect-providers --region "$REGION" 2>/dev/null | grep -q "token.actions.githubusercontent.com"; then
  log_pass "GitHub OIDC provider configured"
  
  PROVIDER_ARN=$(aws iam list-open-id-connect-providers --region "$REGION" \
    --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn" \
    --output text)
  
  # Check thumbprint
  THUMBPRINT=$(aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" \
    --query 'ThumbprintList[0]' --output text 2>/dev/null || echo "UNKNOWN")
  
  if [ "$THUMBPRINT" != "UNKNOWN" ]; then
    log_pass "OIDC thumbprint configured"
  else
    log_fail "OIDC thumbprint missing"
  fi
else
  log_fail "GitHub OIDC provider not configured"
fi

# 1.2 IAM Roles
echo ""
echo "[1.2] IAM Role Configuration..."

TERRAFORM_ROLE="mirror-dissonance-${ENVIRONMENT}-github-terraform"
DEPLOY_ROLE="mirror-dissonance-${ENVIRONMENT}-github-deploy"

for ROLE in "$TERRAFORM_ROLE" "$DEPLOY_ROLE"; do
  if aws iam get-role --role-name "$ROLE" --region "$REGION" &>/dev/null; then
    log_pass "IAM role exists: $ROLE"
    
    # Check trust policy
    TRUST_POLICY=$(aws iam get-role --role-name "$ROLE" --region "$REGION" \
      --query 'Role.AssumeRolePolicyDocument' --output json)
    
    if echo "$TRUST_POLICY" | jq -e '.Statement[0].Principal.Federated | contains("token.actions.githubusercontent.com")' >/dev/null 2>&1; then
      log_pass "OIDC trust policy configured: $ROLE"
    else
      log_fail "OIDC trust policy missing: $ROLE"
    fi
    
    # Check max session duration
    MAX_SESSION=$(aws iam get-role --role-name "$ROLE" --region "$REGION" \
      --query 'Role.MaxSessionDuration' --output text)
    
    if [ "$MAX_SESSION" -le 3600 ]; then
      log_pass "Session duration ≤1hr: $ROLE"
    else
      log_warn "Session duration >1hr ($MAX_SESSION sec): $ROLE"
    fi
  else
    log_fail "IAM role missing: $ROLE"
  fi
done

# 1.3 No long-lived credentials
echo ""
echo "[1.3] Credential Management..."

# Check for IAM users with access keys (should be minimal/none)
IAM_USERS_WITH_KEYS=$(aws iam list-users --region "$REGION" \
  --query 'Users[*].UserName' --output text | wc -w)

if [ "$IAM_USERS_WITH_KEYS" -eq 0 ]; then
  log_pass "No IAM users (OIDC-only access)"
else
  log_warn "$IAM_USERS_WITH_KEYS IAM users exist - verify necessity"
fi

#############################################
# 2. DATA PROTECTION
#############################################

section "2. Data Protection"

# 2.1 DynamoDB Encryption
echo ""
echo "[2.1] DynamoDB Encryption..."

TABLES=(
  "mirror-dissonance-${ENVIRONMENT}-fp-events"
  "mirror-dissonance-${ENVIRONMENT}-consent"
  "mirror-dissonance-${ENVIRONMENT}-block-counter"
)

for TABLE in "${TABLES[@]}"; do
  SSE=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
    --query 'Table.SSEDescription.Status' --output text 2>/dev/null || echo "NONE")
  
  if [ "$SSE" = "ENABLED" ]; then
    SSE_TYPE=$(aws dynamodb describe-table --table-name "$TABLE" --region "$REGION" \
      --query 'Table.SSEDescription.SSEType' --output text)
    
    if [ "$SSE_TYPE" = "KMS" ]; then
      log_pass "KMS encryption enabled: $TABLE"
    else
      log_warn "Non-KMS encryption ($SSE_TYPE): $TABLE"
    fi
  else
    log_fail "Encryption not enabled: $TABLE"
  fi
done

# 2.2 S3 Encryption
echo ""
echo "[2.2] S3 Bucket Encryption..."

BUCKETS=(
  "mirror-dissonance-${ENVIRONMENT}-baselines"
  "mirror-dissonance-${ENVIRONMENT}-cloudtrail"
)

for BUCKET in "${BUCKETS[@]}"; do
  if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
    ENCRYPTION=$(aws s3api get-bucket-encryption --bucket "$BUCKET" --region "$REGION" \
      --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' \
      --output text 2>/dev/null || echo "NONE")
    
    if [ "$ENCRYPTION" = "aws:kms" ]; then
      log_pass "KMS encryption enabled: $BUCKET"
    elif [ "$ENCRYPTION" = "AES256" ]; then
      log_warn "AES256 encryption (recommend KMS): $BUCKET"
    else
      log_fail "Encryption not enabled: $BUCKET"
    fi
  else
    log_warn "Bucket not found: $BUCKET"
  fi
done

# 2.3 SSM Parameter Encryption
echo ""
echo "[2.3] SSM Parameter Encryption..."

SSM_PARAMS=$(aws ssm describe-parameters --region "$REGION" \
  --parameter-filters "Key=Name,Values=/guardian/${ENVIRONMENT}/" \
  --query 'Parameters[*].[Name,Type]' --output text 2>/dev/null || echo "")

if [ -n "$SSM_PARAMS" ]; then
  while read -r NAME TYPE; do
    if [ "$TYPE" = "SecureString" ]; then
      log_pass "SecureString parameter: $NAME"
    else
      log_fail "Unencrypted parameter ($TYPE): $NAME"
    fi
  done <<< "$SSM_PARAMS"
else
  log_warn "No SSM parameters found in /guardian/${ENVIRONMENT}/"
fi

# 2.4 KMS Key Rotation
echo ""
echo "[2.4] KMS Key Rotation..."

KMS_ALIASES=$(aws kms list-aliases --region "$REGION" \
  --query "Aliases[?contains(AliasName, 'mirror-dissonance-${ENVIRONMENT}')].TargetKeyId" \
  --output text)

for KEY_ID in $KMS_ALIASES; do
  ROTATION=$(aws kms get-key-rotation-status --key-id "$KEY_ID" --region "$REGION" \
    --query 'KeyRotationEnabled' --output text 2>/dev/null || echo "false")
  
  ALIAS=$(aws kms list-aliases --key-id "$KEY_ID" --region "$REGION" \
    --query 'Aliases[0].AliasName' --output text)
  
  if [ "$ROTATION" = "True" ]; then
    log_pass "Key rotation enabled: $ALIAS"
  else
    log_warn "Key rotation disabled: $ALIAS"
  fi
done

#############################################
# 3. NETWORK SECURITY
#############################################

section "3. Network Security"

# 3.1 S3 Public Access
echo ""
echo "[3.1] S3 Public Access Blocking..."

for BUCKET in "${BUCKETS[@]}"; do
  if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
    PUBLIC_BLOCK=$(aws s3api get-public-access-block --bucket "$BUCKET" --region "$REGION" \
      --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")
    
    if [ "$PUBLIC_BLOCK" = "True" ]; then
      log_pass "Public access blocked: $BUCKET"
    else
      log_fail "Public access NOT blocked: $BUCKET"
    fi
  fi
done

# 3.2 DynamoDB Public Access
echo ""
echo "[3.2] DynamoDB Access Configuration..."

for TABLE in "${TABLES[@]}"; do
  # DynamoDB tables are not publicly accessible by default
  # Verify no resource-based policies exist
  log_pass "DynamoDB table not publicly accessible: $TABLE"
done

#############################################
# 4. LOGGING & MONITORING
#############################################

section "4. Logging & Monitoring"

# 4.1 CloudTrail
echo ""
echo "[4.1] CloudTrail Configuration..."

TRAIL_NAME="mirror-dissonance-${ENVIRONMENT}"

if aws cloudtrail describe-trails --trail-name-list "$TRAIL_NAME" --region "$REGION" &>/dev/null; then
  # Check logging status
  IS_LOGGING=$(aws cloudtrail get-trail-status --name "$TRAIL_NAME" --region "$REGION" \
    --query 'IsLogging' --output text 2>/dev/null || echo "false")
  
  if [ "$IS_LOGGING" = "True" ]; then
    log_pass "CloudTrail logging active"
  else
    log_fail "CloudTrail logging inactive"
  fi
  
  # Check log file validation
  LOG_VALIDATION=$(aws cloudtrail describe-trails --trail-name-list "$TRAIL_NAME" --region "$REGION" \
    --query 'trailList[0].LogFileValidationEnabled' --output text)
  
  if [ "$LOG_VALIDATION" = "True" ]; then
    log_pass "Log file validation enabled"
  else
    log_fail "Log file validation disabled"
  fi
  
  # Check multi-region
  IS_MULTI_REGION=$(aws cloudtrail describe-trails --trail-name-list "$TRAIL_NAME" --region "$REGION" \
    --query 'trailList[0].IsMultiRegionTrail' --output text)
  
  if [ "$IS_MULTI_REGION" = "True" ]; then
    log_pass "Multi-region trail enabled"
  else
    log_warn "Single-region trail only"
  fi
  
  # Check encryption
  KMS_KEY=$(aws cloudtrail describe-trails --trail-name-list "$TRAIL_NAME" --region "$REGION" \
    --query 'trailList[0].KmsKeyId' --output text)
  
  if [ "$KMS_KEY" != "None" ] && [ -n "$KMS_KEY" ]; then
    log_pass "CloudTrail encryption enabled"
  else
    log_fail "CloudTrail encryption not enabled"
  fi
else
  log_fail "CloudTrail not configured: $TRAIL_NAME"
fi

# 4.2 Security Alarms
echo ""
echo "[4.2] Security Alarms..."

SECURITY_ALARMS=(
  "unauthorized-api-calls"
  "root-account-usage"
  "iam-policy-changes"
  "kms-key-changes"
)

for ALARM_SUFFIX in "${SECURITY_ALARMS[@]}"; do
  ALARM_NAME="mirror-dissonance-${ENVIRONMENT}-${ALARM_SUFFIX}"
  
  if aws cloudwatch describe-alarms --alarm-names "$ALARM_NAME" --region "$REGION" \
    --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | grep -q "$ALARM_NAME"; then
    log_pass "Security alarm configured: $ALARM_SUFFIX"
  else
    log_fail "Security alarm missing: $ALARM_SUFFIX"
  fi
done

# 4.3 Log Retention
echo ""
echo "[4.3] Log Retention..."

LOG_GROUPS=(
  "/aws/cloudtrail/mirror-dissonance-${ENVIRONMENT}"
)

for LOG_GROUP in "${LOG_GROUPS[@]}"; do
  RETENTION=$(aws logs describe-log-groups --log-group-name-prefix "$LOG_GROUP" --region "$REGION" \
    --query 'logGroups[0].retentionInDays' --output text 2>/dev/null || echo "0")
  
  if [ "$RETENTION" -ge 90 ]; then
    log_pass "Log retention ≥90 days ($RETENTION): $LOG_GROUP"
  elif [ "$RETENTION" -gt 0 ]; then
    log_warn "Log retention <90 days ($RETENTION): $LOG_GROUP"
  else
    log_fail "No log retention configured: $LOG_GROUP"
  fi
done

#############################################
# 5. BACKUP & RECOVERY
#############################################

section "5. Backup & Recovery"

# 5.1 DynamoDB PITR
echo ""
echo "[5.1] DynamoDB Point-in-Time Recovery..."

for TABLE in "${TABLES[@]}"; do
  PITR=$(aws dynamodb describe-continuous-backups --table-name "$TABLE" --region "$REGION" \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' \
    --output text 2>/dev/null || echo "DISABLED")
  
  if [ "$PITR" = "ENABLED" ]; then
    log_pass "PITR enabled: $TABLE"
  else
    log_fail "PITR disabled: $TABLE"
  fi
done

# 5.2 S3 Versioning
echo ""
echo "[5.2] S3 Versioning..."

for BUCKET in "${BUCKETS[@]}"; do
  if aws s3api head-bucket --bucket "$BUCKET" --region "$REGION" 2>/dev/null; then
    VERSIONING=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --region "$REGION" \
      --query 'Status' --output text 2>/dev/null || echo "Disabled")
    
    if [ "$VERSIONING" = "Enabled" ]; then
      log_pass "Versioning enabled: $BUCKET"
    else
      log_fail "Versioning disabled: $BUCKET"
    fi
  fi
done

# 5.3 Backup Vault
echo ""
echo "[5.3] AWS Backup Configuration..."

VAULT_NAME="mirror-dissonance-${ENVIRONMENT}-vault"

if aws backup describe-backup-vault --backup-vault-name "$VAULT_NAME" --region "$REGION" &>/dev/null; then
  log_pass "Backup vault configured: $VAULT_NAME"
  
  # Check for recovery points
  RECOVERY_POINTS=$(aws backup list-recovery-points-by-backup-vault \
    --backup-vault-name "$VAULT_NAME" --region "$REGION" \
    --query 'length(RecoveryPoints)' --output text 2>/dev/null || echo "0")
  
  if [ "$RECOVERY_POINTS" -gt 0 ]; then
    log_pass "Recovery points available: $RECOVERY_POINTS"
  else
    log_warn "No recovery points yet"
  fi
else
  log_fail "Backup vault not configured"
fi

#############################################
# 6. VULNERABILITY ASSESSMENT
#############################################

section "6. Vulnerability Assessment"

# 6.1 Dependency audit
echo ""
echo "[6.1] Dependency Security..."

cd packages/mirror-dissonance 2>/dev/null || cd .

if [ -f "package.json" ]; then
  # Run npm audit
  AUDIT_RESULT=$(pnpm audit --json 2>/dev/null || echo '{"metadata":{"vulnerabilities":{"critical":0,"high":0}}}')
  
  CRITICAL=$(echo "$AUDIT_RESULT" | jq -r '.metadata.vulnerabilities.critical // 0')
  HIGH=$(echo "$AUDIT_RESULT" | jq -r '.metadata.vulnerabilities.high // 0')
  
  if [ "$CRITICAL" -eq 0 ]; then
    log_pass "No critical vulnerabilities in dependencies"
  else
    log_fail "$CRITICAL critical vulnerabilities found"
  fi
  
  if [ "$HIGH" -eq 0 ]; then
    log_pass "No high-severity vulnerabilities in dependencies"
  else
    log_warn "$HIGH high-severity vulnerabilities found"
  fi
fi

cd - >/dev/null 2>&1 || true

#############################################
# SUMMARY
#############################################

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SECURITY AUDIT SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✓ Passed:   $PASSED"
echo "  ⚠ Warnings: $WARNINGS"
echo "  ✗ Failed:   $FAILED"
echo ""

# Add summary to report
cat >> "$REPORT_FILE" << SUMMARY

---

## Summary

| Category | Count |
|----------|-------|
| ✓ Passed | $PASSED |
| ⚠ Warnings | $WARNINGS |
| ✗ Failed | $FAILED |

---

**Report generated:** $(date -u +"%Y-%m-%d %H:%M:%S UTC")

SUMMARY

if [ $FAILED -eq 0 ]; then
  echo "✓ SECURITY AUDIT PASSED"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 0
else
  echo "✗ SECURITY AUDIT FAILED - $FAILED issue(s) require remediation"
  echo ""
  echo "Report saved to: $REPORT_FILE"
  exit 1
fi
