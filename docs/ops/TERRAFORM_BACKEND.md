# Terraform Backend Configuration

## State Storage

**S3 Bucket:** `mirror-dissonance-terraform-state-prod`  
**Region:** `us-east-1`  
**Encryption:** AES256 (server-side)  
**Versioning:** Enabled  
**State Key:** `phase-mirror/terraform.tfstate`  
**Workspace Prefix:** `env`

### State File Organization

When using workspaces, state files are organized as:
```
s3://mirror-dissonance-terraform-state-prod/
  └── phase-mirror/
      ├── terraform.tfstate              # Default workspace
      ├── env:/staging/terraform.tfstate  # Staging workspace
      └── env:/production/terraform.tfstate # Production workspace
```

## State Locking

**DynamoDB Table:** `terraform-state-lock`  
**Billing Mode:** PAY_PER_REQUEST  
**PITR:** Enabled  
**Lock ID Format:** `{bucket}/{key}`

The lock table prevents concurrent Terraform operations on the same state file. When Terraform runs, it acquires a lock in DynamoDB before modifying state.

## Usage

### Initialize Terraform

First time setup or after backend configuration changes:

```bash
cd infra/terraform
terraform init
```

Expected output:
```
Initializing the backend...
Successfully configured the backend "s3"!
```

### Switch Workspaces

Workspaces allow multiple environments to use the same Terraform configuration:

```bash
# Create staging workspace
terraform workspace new staging

# Create production workspace
terraform workspace new production

# List workspaces
terraform workspace list

# Switch to workspace
terraform workspace select staging

# Show current workspace
terraform workspace show
```

### Workspace Best Practices

- **default**: Use for development/testing
- **staging**: Pre-production environment
- **production**: Production environment

Always verify current workspace before running `terraform apply`:
```bash
terraform workspace show
```

## State Management

### View Current State

```bash
# List all resources in state
terraform state list

# Show specific resource
terraform state show aws_dynamodb_table.fp_events

# Show all resource details
terraform show
```

### Backup State Manually

Before risky operations, create a manual backup:

```bash
# Pull current state to local file
terraform state pull > backup-$(date +%Y%m%d-%H%M%S).tfstate

# Store backup safely
aws s3 cp backup-*.tfstate s3://your-backup-bucket/terraform-backups/
```

### Restore State (use with caution!)

⚠️ **Warning:** State restoration can cause infrastructure inconsistencies. Only use when necessary.

```bash
# Restore from backup file
terraform state push backup-20260131.tfstate

# Verify restoration
terraform plan
```

## Disaster Recovery

### Restore from S3 Versioning

S3 versioning automatically maintains history of all state file changes:

```bash
# List state file versions
aws s3api list-object-versions \
  --bucket mirror-dissonance-terraform-state-prod \
  --prefix phase-mirror/env:/staging/terraform.tfstate

# Download specific version
aws s3api get-object \
  --bucket mirror-dissonance-terraform-state-prod \
  --key phase-mirror/env:/staging/terraform.tfstate \
  --version-id VERSION_ID \
  terraform.tfstate.backup

# Review and restore if needed
terraform state push terraform.tfstate.backup
```

### Unlock State Manually

If Terraform crashes during apply, state may remain locked. **Only unlock if you're certain no Terraform process is running!**

```bash
# Find lock entry
aws dynamodb scan \
  --table-name terraform-state-lock \
  --region us-east-1

# Delete lock (DANGEROUS - verify no Terraform is running!)
aws dynamodb delete-item \
  --table-name terraform-state-lock \
  --region us-east-1 \
  --key '{"LockID": {"S": "mirror-dissonance-terraform-state-prod/phase-mirror/env:/staging/terraform.tfstate"}}'
```

### Point-in-Time Recovery (PITR)

DynamoDB PITR provides 35-day recovery window for the lock table:

```bash
# Restore DynamoDB table to specific time
aws dynamodb restore-table-to-point-in-time \
  --source-table-name terraform-state-lock \
  --target-table-name terraform-state-lock-restored \
  --restore-date-time 2026-01-31T12:00:00Z \
  --region us-east-1
```

## Security

### State File Protection

- ✅ **Encryption at rest**: All state files encrypted with AES256
- ✅ **Public access blocked**: S3 bucket denies all public access
- ✅ **Versioning enabled**: Allows rollback to previous states
- ✅ **PITR enabled**: DynamoDB lock table has 35-day recovery window
- ✅ **State locking**: Prevents concurrent modifications

### Access Control

State files contain sensitive information (resource IDs, configurations). Limit access:

```bash
# IAM policy for Terraform state access
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::mirror-dissonance-terraform-state-prod",
        "arn:aws:s3:::mirror-dissonance-terraform-state-prod/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/terraform-state-lock"
    }
  ]
}
```

### Sensitive Data Handling

**Never commit these files to git:**
- `terraform.tfstate`
- `terraform.tfstate.backup`
- `*.tfvars` (except `.example` files)
- `.terraform/` directory

These are already in `.gitignore`.

## Cost Estimation

### S3 Costs

- **Storage**: ~$0.023/GB/month (Standard tier)
- **Requests**: Negligible for Terraform state operations
- **Estimated**: <$1/month (typical state files <1GB)

### DynamoDB Costs

- **Billing mode**: PAY_PER_REQUEST
- **Write requests**: $1.25 per million writes
- **Typical usage**: ~10-50 requests per `terraform apply`
- **Estimated**: <$0.10/month

### Total Backend Cost

**Estimated monthly cost: ~$1-2/month**

Costs scale with:
- Frequency of Terraform operations
- Size of state files
- Number of workspaces

## Monitoring

### State File Health

```bash
# Check state file size
aws s3 ls s3://mirror-dissonance-terraform-state-prod/phase-mirror/ --recursive --human-readable

# Check lock table status
aws dynamodb describe-table \
  --table-name terraform-state-lock \
  --region us-east-1 \
  --query 'Table.[TableStatus,ItemCount,TableSizeBytes]'
```

### Audit Trail

S3 and DynamoDB CloudTrail logs capture all state access:

```bash
# Query CloudTrail for state access
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=mirror-dissonance-terraform-state-prod \
  --max-results 50
```

## Troubleshooting

### Issue: State lock timeout

**Symptoms:**
```
Error: Error acquiring the state lock
Lock Info:
  ID:        xxxxx
  Path:      ...
  Operation: ...
```

**Solution:**
1. Verify no other Terraform process is running
2. Check CloudTrail logs for who has the lock
3. If confirmed safe, manually unlock (see Disaster Recovery section)

### Issue: State file corruption

**Symptoms:**
```
Error: state snapshot was created by Terraform vX.Y.Z, which is newer than current vA.B.C
```

**Solution:**
1. Upgrade Terraform to compatible version
2. Or restore from S3 version history

### Issue: Backend initialization fails

**Symptoms:**
```
Error: Failed to get existing workspaces: NoSuchBucket
```

**Solution:**
1. Verify S3 bucket exists: `aws s3 ls s3://mirror-dissonance-terraform-state-prod/`
2. Check AWS credentials: `aws sts get-caller-identity`
3. Verify IAM permissions for S3 and DynamoDB

## Best Practices

### 1. Always Use Workspaces for Environments

```bash
# Bad: Using different backends
terraform apply -var-file=staging.tfvars

# Good: Using workspaces
terraform workspace select staging
terraform apply
```

### 2. Regular State Backups

```bash
# Weekly backup script
#!/bin/bash
for workspace in staging production; do
  terraform workspace select $workspace
  terraform state pull > "backups/state-$workspace-$(date +%Y%m%d).tfstate"
done
```

### 3. State Pull Before Major Changes

```bash
# Before major refactoring
terraform state pull > pre-refactor-backup.tfstate
```

### 4. Validate Before Apply

```bash
# Always validate first
terraform validate
terraform plan -out=tfplan
# Review plan carefully
terraform apply tfplan
```

### 5. Lock State During Manual Changes

```bash
# When manually editing state
terraform workspace select production
terraform state pull > current.tfstate
# Edit current.tfstate (rarely needed!)
terraform state push current.tfstate
```

## Migration Guide

### Migrating from Local State

If you have existing local state:

```bash
# 1. Backup local state
cp terraform.tfstate terraform.tfstate.local-backup

# 2. Configure backend in backend.tf (already done)

# 3. Initialize with migration
terraform init -migrate-state

# 4. Verify state migrated
terraform state list
```

### Migrating Between Backends

```bash
# 1. Update backend.tf with new configuration

# 2. Backup current state
terraform state pull > pre-migration-backup.tfstate

# 3. Re-initialize with migration
terraform init -migrate-state -force-copy

# 4. Verify migration
terraform plan
```

## Additional Resources

- [Terraform S3 Backend Documentation](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [Terraform Workspaces Guide](https://www.terraform.io/docs/language/state/workspaces.html)
- [AWS S3 Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
- [DynamoDB Point-in-Time Recovery](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.html)

---

**Last Updated:** 2026-02-01  
**Maintained By:** Phase Mirror Team
