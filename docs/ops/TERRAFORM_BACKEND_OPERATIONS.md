# Terraform Backend Operations Guide

**Last Updated:** 2026-02-01
**Maintained By:** Platform Team

---

## Backend Architecture

### Components

| Component | Resource | Purpose |
|-----------|----------|---------|
| **State Storage** | S3: `mirror-dissonance-terraform-state-prod` | Stores Terraform state files |
| **State Locking** | DynamoDB: `mirror-dissonance-terraform-lock-prod` | Prevents concurrent modifications |
| **Versioning** | S3 Versioning | Enables state rollback (90-day retention) |
| **Backup** | DynamoDB PITR | 35-day point-in-time recovery |
| **Encryption** | S3 AES256 | State files encrypted at rest |
| **Monitoring** | CloudWatch Alarms | Alerts on throttling events |

### State File Structure

```
s3://mirror-dissonance-terraform-state-prod/
└── phase-mirror/
    ├── terraform.tfstate                    # Default workspace
    └── env:/
        ├── staging/
        │   └── terraform.tfstate            # Staging environment
        └── prod/
            └── terraform.tfstate            # Production environment
```

---

## Common Operations

### Initialize Terraform

```bash
cd infra/terraform
terraform init

# Expected output:
# Successfully configured the backend "s3"!
```

### Switch Workspaces

```bash
# List workspaces
terraform workspace list

# Create new workspace
terraform workspace new staging

# Switch to workspace
terraform workspace select staging

# Show current workspace
terraform workspace show
```

### View State

```bash
# List all resources in state
terraform state list

# Show specific resource details
terraform state show aws_dynamodb_table.fp_events

# Pull state file locally (read-only)
terraform state pull > local-state.json
```

### Backup State

```bash
# Manual backup before major changes
terraform state pull > backup-$(date +%Y%m%d-%H%M%S).tfstate

# Store backup securely
aws s3 cp backup-$(date +%Y%m%d-%H%M%S).tfstate \
  s3://mirror-dissonance-terraform-state-prod/backups/manual/
```

---

## Disaster Recovery

### Scenario 1: Restore Previous State Version

**Situation:** Recent `terraform apply` caused issues, need to rollback.

```bash
# 1. List state file versions
aws s3api list-object-versions \
  --bucket mirror-dissonance-terraform-state-prod \
  --prefix phase-mirror/env:/staging/terraform.tfstate \
  --query 'Versions[*].[VersionId,LastModified]' \
  --output table

# 2. Download specific version
aws s3api get-object \
  --bucket mirror-dissonance-terraform-state-prod \
  --key phase-mirror/env:/staging/terraform.tfstate \
  --version-id VERSION_ID_HERE \
  terraform.tfstate.backup

# 3. Verify backup content
terraform show terraform.tfstate.backup

# 4. Backup current state first
terraform state pull > current-state-backup.json && test -s current-state-backup.json

# 5. Push backup to remote (CAUTION)
terraform state push terraform.tfstate.backup

# 6. Verify restoration
terraform state list
```

### Scenario 2: Unlock Stuck State

**Situation:** Terraform crashed mid-apply, state is locked.

```bash
# 1. Verify no Terraform is running (check team)
# 2. Find lock entry
aws dynamodb scan \
  --table-name mirror-dissonance-terraform-lock-prod \
  --region us-east-1

# 3. Delete lock (only after confirming no active Terraform)
LOCK_ID="mirror-dissonance-terraform-state-prod/phase-mirror/env:/staging/terraform.tfstate"
aws dynamodb delete-item \
  --table-name mirror-dissonance-terraform-lock-prod \
  --key '{"LockID": {"S": "'"$LOCK_ID"'"}}' \
  --region us-east-1

# 4. Verify unlock
terraform force-unlock LOCK_ID
```

### Scenario 3: Recover from DynamoDB Deletion

**Situation:** Lock table accidentally deleted.

```bash
# 1. Check if PITR is enabled
aws dynamodb describe-continuous-backups \
  --table-name mirror-dissonance-terraform-lock-prod \
  --region us-east-1

# 2. Restore table to point in time
aws dynamodb restore-table-to-point-in-time \
  --source-table-name mirror-dissonance-terraform-lock-prod \
  --target-table-name mirror-dissonance-terraform-lock-prod-restored \
  --restore-date-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --region us-east-1

# 3. Wait for restoration
aws dynamodb wait table-exists \
  --table-name mirror-dissonance-terraform-lock-prod-restored \
  --region us-east-1

# 4. Update backend.tf to use restored table
# 5. Run terraform init -reconfigure
```

---

## Troubleshooting

### Error: "Failed to get existing workspaces"

**Cause:** S3 bucket permissions issue or bucket doesn't exist.

**Solution:**
```bash
# Verify bucket exists
aws s3 ls s3://mirror-dissonance-terraform-state-prod/

# Check IAM permissions
aws iam get-user-policy --user-name $USER --policy-name terraform-backend
```

### Error: "Error acquiring the state lock"

**Cause:** Another Terraform process is running or crashed with lock held.

**Solution:**
```bash
# Check for active locks
aws dynamodb scan --table-name mirror-dissonance-terraform-lock-prod

# If no active Terraform, force unlock
terraform force-unlock LOCK_ID
```

### Error: "Backend configuration changed"

**Cause:** backend.tf was modified after initialization.

**Solution:**
```bash
# Reinitialize with new backend config
terraform init -reconfigure

# Or migrate state
terraform init -migrate-state
```

---

## Security Best Practices

### Access Control

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TerraformBackendAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::mirror-dissonance-terraform-state-prod/phase-mirror/*"
    },
    {
      "Sid": "TerraformLockAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/mirror-dissonance-terraform-lock-prod"
    }
  ]
}
```

### State File Encryption

- **At Rest:** AES256 encryption enabled on S3 bucket
- **In Transit:** TLS 1.2+ for all S3/DynamoDB API calls
- **Sensitive Values:** Use `sensitive = true` in Terraform variables

### Audit Trail

- **S3 Access Logs:** Enabled → `mirror-dissonance-logs-prod`
- **CloudTrail:** AWS API calls logged (organization-level)
- **DynamoDB Streams:** Optional, enable for change tracking

---

## Cost Optimization

### Current Costs (Estimated)

| Component | Usage | Monthly Cost |
|-----------|-------|--------------|
| S3 Storage | <1GB | $0.02 |
| S3 Requests | ~100/month | <$0.01 |
| DynamoDB | PAY_PER_REQUEST | ~$0.05 |
| CloudWatch Alarms | 1 alarm | $0.10 |
| **Total** | | **~$0.18/month** |

### Cost Alerts

Set up billing alert:
```bash
aws cloudwatch put-metric-alarm \
  --alarm-name terraform-backend-cost-alert \
  --alarm-description "Alert when backend costs exceed $5/month" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

---

## Monitoring & Alerts

### Key Metrics

1. **State Lock Duration** (DynamoDB)
   - Alert if lock held >10 minutes
   
2. **S3 Request Rate** (S3)
   - Alert if >1000 requests/hour (unusual activity)
   
3. **DynamoDB Throttled Requests** (DynamoDB)
   - Alert immediately on any throttling

### Dashboard

Create CloudWatch dashboard:
```bash
aws cloudwatch put-dashboard \
  --dashboard-name terraform-backend \
  --dashboard-body file://terraform-backend-dashboard.json
```

---

## Team Workflows

### Before Running Terraform

1. ✅ Verify workspace: `terraform workspace show`
2. ✅ Check for locks: `aws dynamodb scan --table-name mirror-dissonance-terraform-lock-prod --select COUNT`
3. ✅ Communicate with team (Slack: #infrastructure channel)
4. ✅ Backup state if making major changes

### After Running Terraform

1. ✅ Verify changes applied: `terraform state list`
2. ✅ Update team on changes
3. ✅ Document in change log
4. ✅ Monitor CloudWatch for errors

---

## References

- [Terraform S3 Backend](https://developer.hashicorp.com/terraform/language/settings/backends/s3)
- [DynamoDB State Locking](https://developer.hashicorp.com/terraform/language/settings/backends/s3#dynamodb-state-locking)
- [Terraform Workspaces](https://developer.hashicorp.com/terraform/language/state/workspaces)

---

**Last Reviewed:** 2026-02-01
