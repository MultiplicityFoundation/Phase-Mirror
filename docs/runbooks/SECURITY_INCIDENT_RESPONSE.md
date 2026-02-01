# Security Incident Response Runbook

## Incident Categories

### 1. Unauthorized Access Detected

**Trigger:** CloudWatch alarm `unauthorized-api-calls`

**Immediate Actions:**
```bash
# 1. Get recent unauthorized attempts
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AccessDenied \
  --max-results 50 \
  --region us-east-1 \
  --output table

# 2. Identify source IPs
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=AccessDenied \
  --max-results 50 \
  --region us-east-1 \
  --query 'Events[*].CloudTrailEvent' \
  --output text | jq '.sourceIPAddress'

# 3. Check for successful access from same source
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=SourceIPAddress,AttributeValue=<IP> \
  --max-results 100 \
  --region us-east-1
```

**Containment:**
- Rotate compromised credentials immediately
- Review and revoke suspicious sessions
- Update security groups if needed

---

### 2. Root Account Usage

**Trigger:** CloudWatch alarm `root-account-usage`

**Immediate Actions:**
```bash
# 1. Get root account activity
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=root \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1 \
  --output table

# 2. Verify MFA was used
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=Username,AttributeValue=root \
  --query 'Events[*].CloudTrailEvent' \
  --output text | jq '.userIdentity.sessionContext.attributes.mfaAuthenticated'
```

**Containment:**
- Contact account owner immediately
- Verify legitimacy of root usage
- Enable MFA if not already active
- Rotate root credentials if compromised

---

### 3. IAM Policy Changes

**Trigger:** CloudWatch alarm `iam-policy-changes`

**Immediate Actions:**
```bash
# 1. Get recent IAM changes
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutUserPolicy \
  --max-results 20 \
  --region us-east-1 \
  --output table

# 2. Review specific policy change
aws iam get-user-policy \
  --user-name <username> \
  --policy-name <policy-name>

# 3. Check who made the change
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=PutUserPolicy \
  --query 'Events[*].CloudTrailEvent' \
  --output text | jq '.userIdentity'
```

**Containment:**
- Revert unauthorized policy changes
- Review all permissions granted
- Lock down IAM permissions if needed

---

### 4. KMS Key Deletion/Disable

**Trigger:** CloudWatch alarm `kms-key-changes`

**Immediate Actions:**
```bash
# 1. Get KMS key events
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=ScheduleKeyDeletion \
  --max-results 10 \
  --region us-east-1 \
  --output table

# 2. Cancel key deletion if unauthorized
aws kms cancel-key-deletion \
  --key-id <key-id> \
  --region us-east-1

# 3. Re-enable key if disabled
aws kms enable-key \
  --key-id <key-id> \
  --region us-east-1
```

**Containment:**
- Immediately cancel unauthorized deletions
- Re-enable disabled keys
- Audit all resources using the key

---

### 5. Data Breach Suspected

**Immediate Actions:**
```bash
# 1. Review DynamoDB access logs
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceType,AttributeValue=AWS::DynamoDB::Table \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --max-results 100 \
  --region us-east-1

# 2. Check for bulk reads/exports
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=mirror-dissonance-staging-fp-events \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 3600 \
  --statistics Sum \
  --region us-east-1

# 3. Enable DynamoDB Streams if not active (for forensics)
aws dynamodb update-table \
  --table-name mirror-dissonance-staging-fp-events \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
  --region us-east-1
```

**Containment:**
- Rotate all nonces immediately
- Revoke suspicious sessions
- Enable enhanced monitoring
- Consider point-in-time recovery

---

## Recovery Procedures

### Restore from Backup

#### DynamoDB Point-in-Time Recovery:
```bash
# Restore to 5 minutes ago
aws dynamodb restore-table-to-point-in-time \
  --source-table-name mirror-dissonance-staging-fp-events \
  --target-table-name mirror-dissonance-staging-fp-events-recovered \
  --restore-date-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --region us-east-1
```

#### AWS Backup Recovery:
```bash
# List recovery points
aws backup list-recovery-points-by-backup-vault \
  --backup-vault-name mirror-dissonance-staging-vault \
  --region us-east-1

# Restore specific recovery point
aws backup start-restore-job \
  --recovery-point-arn <recovery-point-arn> \
  --metadata TableName=mirror-dissonance-staging-fp-events-recovered \
  --iam-role-arn <backup-role-arn> \
  --region us-east-1
```

---

## Post-Incident

1. Document timeline of events
2. Identify root cause
3. Update security controls
4. Conduct lessons learned session
5. Update runbooks based on findings

---

## Contacts

- **Security Team:** security@phasemirror.com
- **On-Call:** +1-XXX-XXX-XXXX
- **AWS Support:** Use AWS Console
