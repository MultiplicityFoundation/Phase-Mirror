# Backup & Recovery Procedures

## DynamoDB Point-in-Time Recovery (PITR)

### Coverage
All production tables have PITR enabled with 35-day retention:
- `mirror-dissonance-production-fp-events`
- `mirror-dissonance-production-consent`
- `mirror-dissonance-production-block-counter`

### Recovery Window
- **Retention:** 35 days (configurable via `var.backup_retention_days`)
- **Granularity:** Per-second (any point within window)
- **RPO (Recovery Point Objective):** <1 second
- **RTO (Recovery Time Objective):** <30 minutes (AWS restore time)

## Restore Procedures

### Scenario 1: Accidental Data Deletion (Partial)

**Use Case:** FP events accidentally deleted for specific rule

**Action:** PITR restore to new table, then selective data migration

```bash
# 1. Restore to point before deletion
TARGET_TIME="2026-02-15T10:30:00Z"  # Adjust as needed

aws dynamodb restore-table-to-point-in-time \
  --source-table-name mirror-dissonance-production-fp-events \
  --target-table-name mirror-dissonance-production-fp-events-restored \
  --restore-date-time "${TARGET_TIME}" \
  --region us-east-1

# 2. Wait for restore to complete
aws dynamodb wait table-exists \
  --table-name mirror-dissonance-production-fp-events-restored \
  --region us-east-1

# 3. Scan restored table for missing data
aws dynamodb scan \
  --table-name mirror-dissonance-production-fp-events-restored \
  --filter-expression "begins_with(pk, :rule)" \
  --expression-attribute-values '{":rule":{"S":"rule#MD-001"}}' \
  --region us-east-1 > recovered_events.json

# 4. Batch write to production table (use SDK script)
node scripts/restore-events.js recovered_events.json

# 5. Verify data restored, then delete temp table
aws dynamodb delete-table \
  --table-name mirror-dissonance-production-fp-events-restored \
  --region us-east-1
```

### Scenario 2: Table Corruption (Full Restore)

**Use Case:** Full table corruption or catastrophic failure

**Action:** PITR restore to new table, swap table names

```bash
# 1. Restore entire table
TARGET_TIME="2026-02-15T09:00:00Z"

aws dynamodb restore-table-to-point-in-time \
  --source-table-name mirror-dissonance-production-fp-events \
  --target-table-name mirror-dissonance-production-fp-events-restored \
  --restore-date-time "${TARGET_TIME}" \
  --region us-east-1

# 2. Wait for restore
aws dynamodb wait table-exists \
  --table-name mirror-dissonance-production-fp-events-restored \
  --region us-east-1

# 3. Update application to use restored table (or Terraform swap)
# Option A: Update SSM parameter with new table name
aws ssm put-parameter \
  --name /guardian/production/fp_table_name \
  --value mirror-dissonance-production-fp-events-restored \
  --overwrite

# Option B: Terraform import and swap
terraform import aws_dynamodb_table.fp_events mirror-dissonance-production-fp-events-restored
terraform apply  # Renames to production table
```

### Scenario 3: Consent Revocation Recovery

**Use Case:** Need to prove historical consent status for audit

**Action:** Query PITR snapshot

```bash
# Restore consent table to specific date
TARGET_TIME="2025-12-01T00:00:00Z"  # Audit period

aws dynamodb restore-table-to-point-in-time \
  --source-table-name mirror-dissonance-production-consent \
  --target-table-name consent-audit-2025-12 \
  --restore-date-time "${TARGET_TIME}" \
  --region us-east-1

# Export for audit
aws dynamodb scan \
  --table-name consent-audit-2025-12 \
  --region us-east-1 \
  --output json > consent-audit-2025-12.json

# Provide to auditors, then cleanup
aws dynamodb delete-table --table-name consent-audit-2025-12
```

## Testing Recovery (Quarterly)

**Runbook:** `scripts/test-recovery.sh`

```bash
#!/bin/bash
# Quarterly recovery drill

# 1. Create test data in staging
# 2. Restore to 1 hour ago
# 3. Verify data integrity
# 4. Measure RTO
# 5. Document results in docs/ops/recovery-tests/
```

## Monitoring

### PITR Health Checks

**CloudWatch Alarm:** PITR disabled unexpectedly

```hcl
# In infra/terraform/monitoring.tf
resource "aws_cloudwatch_metric_alarm" "pitr_disabled" {
  alarm_name          = "mirror-dissonance-pitr-disabled-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ContinuousBackupsStatus"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Minimum"
  threshold           = 1  # 1 = enabled, 0 = disabled
  alarm_description   = "PITR disabled on production table"
  
  dimensions = {
    TableName = aws_dynamodb_table.fp_events.name
  }
  
  alarm_actions = [var.ops_sns_topic_arn]
}
```

### Backup Age Alert

Alert if earliest restorable date > 1 day old (indicates backup issue)

```python
# Lambda function to check backup age
import boto3
from datetime import datetime, timezone

def lambda_handler(event, context):
    dynamodb = boto3.client('dynamodb')
    
    response = dynamodb.describe_continuous_backups(
        TableName='mirror-dissonance-production-fp-events'
    )
    
    earliest = response['ContinuousBackupsDescription']['PointInTimeRecoveryDescription']['EarliestRestorableDateTime']
    age_hours = (datetime.now(timezone.utc) - earliest).total_seconds() / 3600
    
    if age_hours > 24:
        # Send SNS alert
        sns = boto3.client('sns')
        sns.publish(
            TopicArn='arn:aws:sns:us-east-1:ACCOUNT:mirror-dissonance-ops',
            Subject='PITR Backup Age Alert',
            Message=f'Earliest restorable backup is {age_hours:.1f} hours old'
        )
```

## Cost Monitoring

**PITR Costs:** ~$0.20 per GB-month  
**Expected monthly cost (initial):** <$5 (assuming <25 GB total)

**Billing Alert:**

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name mirror-dissonance-pitr-cost \
  --alarm-description "PITR costs exceed budget" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 20 \
  --comparison-operator GreaterThanThreshold
```

## Recovery Testing Schedule

### Monthly: Dry Run
- Generate recovery plan for hypothetical scenarios
- Review runbooks and update as needed
- Verify access to AWS console and CLI tools

### Quarterly: Full Simulation
1. **Week 1:** Create test data in staging environment
2. **Week 2:** Execute PITR restore to new table
3. **Week 3:** Validate data integrity and completeness
4. **Week 4:** Document RTO/RPO measurements and lessons learned

### Annually: Disaster Recovery Drill
- Full production failover simulation (with stakeholder notification)
- Test cross-region recovery capabilities
- Validate emergency contact procedures
- Update disaster recovery documentation

## Backup Validation Checklist

Before declaring backups operational:

- [ ] PITR enabled on all production tables
- [ ] Earliest restore date within acceptable range
- [ ] CloudWatch alarms configured and tested
- [ ] Recovery runbooks reviewed and validated
- [ ] Team trained on recovery procedures
- [ ] Emergency contacts documented
- [ ] Quarterly recovery tests scheduled

## Additional Resources

- [AWS DynamoDB PITR Documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.html)
- [DynamoDB Backup Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/BackupRestore.html)
- Internal wiki: Recovery procedures and lessons learned
- On-call runbook: Emergency recovery contacts

## Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-31 | Infrastructure Team | Initial backup & recovery procedures |
