# Staging Infrastructure Deployment - Days 16-17

This comprehensive guide walks through deploying Phase Mirror staging infrastructure with DynamoDB, SSM, KMS, and CloudWatch.

## 0. Pre-flight Setup

```bash
cd Phase-Mirror
git checkout -b infra/staging-deployment
cd infra/terraform
```

Verify backend is configured:

```bash
../../scripts/verify-backend.sh
terraform init
```

## 1. Infrastructure Modules Structure

### 1.1. Create module directory structure

The infrastructure uses a modular approach with separate modules for each service:

```
modules/
├── dynamodb/      # DynamoDB tables (fp_events, consent, block_counter)
├── ssm/           # SSM parameters for redaction nonces
├── kms/           # KMS encryption keys
├── cloudwatch/    # CloudWatch alarms and dashboards
└── iam/           # IAM roles and policies
```

All modules are pre-configured in this repository with production-ready settings.

## 2. DynamoDB Module

The DynamoDB module creates three tables:

1. **fp-events**: Tracks false positive events with GSI for finding lookups
2. **consent**: Stores organization consent records
3. **block-counter**: Circuit breaker tracking with TTL

Features:
- Pay-per-request billing mode
- Point-in-time recovery enabled
- KMS encryption
- TTL on appropriate tables
- Global secondary indexes

## 3. KMS Module

Creates a KMS key for encrypting:
- DynamoDB tables
- SSM parameters
- CloudWatch Logs
- SNS topics

Features:
- Automatic key rotation enabled
- 30-day deletion window
- Service-specific IAM policies

## 4. SSM Module

Manages redaction nonce parameters:
- `/guardian/{environment}/redaction_nonce_v1` - Initial nonce
- Secure string type with KMS encryption
- Lifecycle ignore_changes to prevent rotation on apply

## 5. CloudWatch Module

Creates comprehensive monitoring:

### Alarms
- DynamoDB read/write throttling
- SSM parameter access failures
- Circuit breaker triggers

### SNS Topic
- ops-alerts topic for notifications
- Optional email subscription

### Dashboard
- DynamoDB capacity usage
- Throttling metrics
- SSM failures
- Circuit breaker events

## 6. Deployment Steps

### Step 1: Review Configuration

```bash
cd infra/terraform

# Validate configuration
terraform validate

# Format files
terraform fmt -recursive
```

### Step 2: Plan Deployment

```bash
# Create execution plan for staging
terraform plan \
  -var-file=staging.tfvars \
  -out=staging.tfplan

# Review the plan - should show:
# - aws_kms_key.main
# - aws_dynamodb_table.* (3 tables)
# - aws_ssm_parameter.redaction_nonce_v1
# - aws_cloudwatch_metric_alarm.* (multiple)
# - aws_sns_topic.ops_alerts
# - aws_cloudwatch_dashboard.main
# - aws_s3_bucket.baselines
```

### Step 3: Apply Infrastructure

```bash
# Apply the plan
terraform apply staging.tfplan

# Expected output:
# Apply complete! Resources: 15-20 added, 0 changed, 0 destroyed.
```

### Step 4: Verify Resources

```bash
# Check DynamoDB tables
aws dynamodb list-tables --region us-east-1 | grep mirror-dissonance-staging

# Expected:
# - mirror-dissonance-staging-fp-events
# - mirror-dissonance-staging-consent
# - mirror-dissonance-staging-block-counter

# Verify KMS key
terraform output kms_key_arn

# Check SSM parameter
aws ssm get-parameter \
  --name /guardian/staging/redaction_nonce_v1 \
  --region us-east-1 \
  --with-decryption

# List CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix mirror-dissonance-staging \
  --region us-east-1
```

### Step 5: Configure Monitoring

```bash
# Get SNS topic ARN
terraform output sns_topic_arn

# Subscribe email (optional)
aws sns subscribe \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --protocol email \
  --notification-endpoint your-email@example.com \
  --region us-east-1

# Confirm subscription via email
```

### Step 6: View Dashboard

```bash
# Get dashboard URL
echo "https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=$(terraform output -raw dashboard_name)"
```

## 7. Testing

### Test DynamoDB Access

```bash
# Put test item
aws dynamodb put-item \
  --table-name $(terraform output -raw fp_events_table_name) \
  --item '{"pk": {"S": "test"}, "sk": {"S": "test"}}' \
  --region us-east-1

# Get test item
aws dynamodb get-item \
  --table-name $(terraform output -raw fp_events_table_name) \
  --key '{"pk": {"S": "test"}, "sk": {"S": "test"}}' \
  --region us-east-1

# Delete test item
aws dynamodb delete-item \
  --table-name $(terraform output -raw fp_events_table_name) \
  --key '{"pk": {"S": "test"}, "sk": {"S": "test"}}' \
  --region us-east-1
```

### Test Alarm

```bash
# Trigger test notification
aws sns publish \
  --topic-arn $(terraform output -raw sns_topic_arn) \
  --subject "[TEST] Staging Alert" \
  --message "Test alert from staging deployment" \
  --region us-east-1
```

## 8. Monitoring Alarms

Configured alarms:

1. **fp-events-read-throttle**: Read throttling > 10 in 5 min
2. **fp-events-write-throttle**: Write throttling > 10 in 5 min
3. **ssm-parameter-failures**: SSM access failures > 5 in 5 min
4. **circuit-breaker-triggered**: Any circuit breaker activation

All alarms send notifications to the ops-alerts SNS topic.

## 9. Troubleshooting

### Terraform Init Fails

```bash
# Re-run backend verification
../../scripts/verify-backend.sh

# Force re-initialization
terraform init -reconfigure
```

### Module Not Found

```bash
# Verify module structure
ls -la modules/

# Re-initialize modules
terraform get -update
```

### KMS Key Permission Denied

Ensure your IAM user/role has:
- `kms:CreateKey`
- `kms:CreateAlias`
- `kms:PutKeyPolicy`

### DynamoDB Table Already Exists

```bash
# Check existing tables
aws dynamodb list-tables --region us-east-1

# If cleanup needed (CAUTION - deletes data):
terraform destroy -var-file=staging.tfvars
```

## 10. Rollback

If deployment fails:

```bash
# Destroy all resources
terraform destroy -var-file=staging.tfvars

# Clean state
rm -f terraform.tfstate*
rm -f .terraform.lock.hcl

# Re-initialize
terraform init
```

## 11. Next Steps

After successful deployment:

1. ✅ Verify all resources created
2. ✅ Subscribe to SNS alerts
3. ✅ Test DynamoDB access
4. ✅ Review CloudWatch dashboard
5. ⏭️ Deploy application code
6. ⏭️ Run integration tests
7. ⏭️ Monitor for 24-48 hours
8. ⏭️ Plan production deployment

## 12. Outputs Reference

Key Terraform outputs:

```hcl
kms_key_arn                 # KMS key ARN for encryption
fp_events_table_name        # Main events table
consent_table_name          # Consent table
block_counter_table_name    # Circuit breaker table
nonce_parameter_name        # SSM parameter path
sns_topic_arn              # Ops alerts topic
dashboard_name             # CloudWatch dashboard name
baselines_bucket_name      # S3 bucket for baselines
```

## Verification Checklist

- [ ] Backend verified and initialized
- [ ] Terraform plan shows expected resources
- [ ] All resources created successfully
- [ ] KMS key accessible
- [ ] DynamoDB tables accessible with PITR enabled
- [ ] SSM parameter contains nonce
- [ ] CloudWatch alarms configured
- [ ] SNS topic created
- [ ] Dashboard accessible
- [ ] Email subscription confirmed (if configured)
- [ ] Test items can be written/read from DynamoDB
- [ ] Test notification received
