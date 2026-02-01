# Days 16-18: Staging Deployment and Monitoring Guide

This guide walks through deploying infrastructure to staging and setting up monitoring dashboards.

## Prerequisites

Before starting:
- [ ] Backend setup completed (S3 bucket and DynamoDB table created)
- [ ] SSM nonce parameter bootstrapped for staging
- [ ] AWS credentials configured
- [ ] Terraform >= 1.6 installed

## Day 16-17: Deploy to Staging Environment

### Step 1: Review Terraform Plan

```bash
cd infra/terraform

# Validate configuration
terraform validate

# Format files
terraform fmt -recursive

# Create execution plan
terraform plan \
  -var-file=staging.tfvars \
  -out=staging.tfplan

# Review the plan carefully
# Should show resources to create:
# - aws_dynamodb_table.fp_events
# - aws_dynamodb_table.consent
# - aws_dynamodb_table.block_counter
# - aws_sns_topic.ops_alerts
# - aws_cloudwatch_metric_alarm.* (multiple alarms)
# - aws_s3_bucket.baselines
# - aws_cloudwatch_dashboard.mirror_dissonance
# etc.
```

### Step 2: Apply Staging Infrastructure

```bash
# Apply the plan
terraform apply staging.tfplan

# This will create:
# - 3 DynamoDB tables (fp_events, consent, block_counter)
# - 1 SNS topic (ops_alerts)
# - 5-7 CloudWatch alarms
# - 1 S3 bucket (baseline storage)
# - 2 CloudWatch dashboards (module dashboard + infrastructure dashboard)
# - IAM roles for runtime access and GitHub Actions
# - Tags on all resources

# Expected output:
# Apply complete! Resources: 15+ added, 0 changed, 0 destroyed.
```

### Step 3: Verify Resources Created

```bash
# Check DynamoDB tables
aws dynamodb list-tables --region us-east-1 | grep mirror-dissonance-staging

# Expected output:
# mirror-dissonance-staging-fp-events
# mirror-dissonance-staging-consent
# mirror-dissonance-staging-block-counter

# Describe a table to verify configuration
aws dynamodb describe-table \
  --table-name mirror-dissonance-staging-fp-events \
  --region us-east-1 \
  --query 'Table.[TableName,TableStatus,BillingModeSummary.BillingMode,TimeToLiveDescription.TimeToLiveStatus]' \
  --output table

# Check SSM parameters
aws ssm get-parameter \
  --name /guardian/staging/redaction_nonce_v1 \
  --region us-east-1 \
  --query 'Parameter.[Name,Type,Version]' \
  --output table

# Check SNS topic
aws sns list-topics --region us-east-1 | grep mirror-dissonance-staging

# Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix mirror-dissonance-staging \
  --region us-east-1 \
  --query 'MetricAlarms[].AlarmName' \
  --output table
```

### Step 4: Enable Point-in-Time Recovery (PITR)

PITR should be enabled by Terraform (via `enable_point_in_time_recovery = true` in staging.tfvars), but verify:

```bash
# Check PITR status
for table in fp-events consent block-counter; do
  echo "Checking PITR for mirror-dissonance-staging-${table}..."
  aws dynamodb describe-continuous-backups \
    --table-name "mirror-dissonance-staging-${table}" \
    --region us-east-1 \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus'
done

# Expected output for each: "ENABLED"
```

If not enabled, enable manually:

```bash
aws dynamodb update-continuous-backups \
  --table-name mirror-dissonance-staging-fp-events \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region us-east-1

# Repeat for other tables
```

### Step 5: Configure GitHub Secrets for CI/CD

Go to: https://github.com/PhaseMirror/Phase-Mirror/settings/secrets/actions

Add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `AWS_ROLE_ARN_STAGING` | `arn:aws:iam::ACCOUNT_ID:role/mirror-dissonance-github-actions-deploy-staging` | From Terraform output |
| `AWS_ROLE_ARN_PRODUCTION` | `arn:aws:iam::ACCOUNT_ID:role/mirror-dissonance-github-actions-deploy-production` | For future prod deploy |
| `TERRAFORM_STATE_BUCKET` | `mirror-dissonance-terraform-state-prod` | State bucket name |
| `OPS_SNS_TOPIC_ARN_STAGING` | `arn:aws:sns:us-east-1:ACCOUNT_ID:mirror-dissonance-staging-ops-alerts` | From Terraform output |

Get ARNs from Terraform:

```bash
cd infra/terraform

# Get GitHub Actions deploy role ARN
terraform output github_actions_deploy_role_arn

# Get GitHub Actions runtime role ARN (for application runtime)
terraform output github_actions_role_arn

# Get ops alerts SNS topic ARN
terraform output ops_alerts_topic_arn
```

### Step 6: Test Staging Deployment with GitHub Actions

The workflow `.github/workflows/deploy-staging.yml` has been created. It will:

1. Build and test the code
2. Authenticate with AWS using OIDC
3. Verify DynamoDB and SSM access
4. Run integration tests against staging
5. Send deployment notification to SNS (if configured)

**Trigger workflow:**

```bash
# The workflow triggers automatically on push to main
# Or trigger manually:
# Go to: https://github.com/PhaseMirror/Phase-Mirror/actions/workflows/deploy-staging.yml
# Click "Run workflow"
```

Watch: https://github.com/PhaseMirror/Phase-Mirror/actions

## Day 18: Enable Monitoring & Observability

### Step 1: View CloudWatch Dashboard

After applying Terraform, two dashboards are created:

1. **PhaseMirror-FPCalibration-staging**: Module-managed dashboard (from monitoring module)
2. **MirrorDissonance-Infrastructure-staging**: Infrastructure dashboard (new)

Access the infrastructure dashboard:

```bash
cd infra/terraform

# Get dashboard URL
terraform output cloudwatch_dashboard_url

# Or manually navigate to:
# https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=MirrorDissonance-Infrastructure-staging
```

**Dashboard includes:**
- **FP Store - DynamoDB Capacity**: Read/write capacity consumption
- **DynamoDB User Errors**: Throttling and user errors across tables
- **Nonce Access Errors**: SSM parameter access failures
- **DynamoDB System Errors**: AWS-side errors
- **FP Events - Request Latency**: Response times for operations
- **Active Alarms**: Current alarm status
- **Circuit Breaker Activations**: Hourly activation count
- **Nonce Validation Failures**: Failed nonce validations

### Step 2: Subscribe to SNS Alerts

```bash
# Subscribe your email to ops alerts
aws sns subscribe \
  --topic-arn $(terraform output -raw ops_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint your-ops-email@example.com \
  --region us-east-1

# Check your email and confirm subscription
```

**Note**: You can also configure the email in `staging.tfvars` by adding:

```hcl
ops_email_address = "your-ops-email@example.com"
```

Then run `terraform apply -var-file=staging.tfvars` to create the subscription automatically.

### Step 3: Test Alerting

```bash
# Trigger a test alarm by publishing directly to SNS
aws sns publish \
  --topic-arn $(terraform output -raw ops_alerts_topic_arn) \
  --subject "[TEST] Phase Mirror Alert Test" \
  --message "This is a test alert. If you receive this, alerting is configured correctly." \
  --region us-east-1

# You should receive an email within 1-2 minutes
```

## Monitoring Alarms

The following alarms are configured:

### Critical Alarms (from monitoring.tf)

1. **ssm_nonce_failures**: SSM GetParameter failures (5+ in 10 min)
2. **fp_store_throttles**: DynamoDB throttling (10+ errors in 10 min)
3. **fp_store_system_errors**: DynamoDB system errors (1+ in 5 min)
4. **circuit_breaker_frequent**: Circuit breaker activated 3+ times/hour
5. **nonce_validation_failures**: Nonce validation failures (5+ in 5 min)

### Warning Alarms (from monitoring.tf)

6. **fp_store_high_reads**: High read capacity usage (10K+ RCUs/hour)

All alarms send notifications to the ops_alerts SNS topic.

## Troubleshooting

### Dashboard shows no data

- Wait 5-10 minutes after deployment for metrics to populate
- Ensure resources are being accessed (run integration tests)
- Check CloudWatch Logs for Lambda execution logs

### Alarm not triggering

- Verify alarm threshold and evaluation period
- Check if metric is being published
- Review alarm history: `aws cloudwatch describe-alarm-history --alarm-name <alarm-name>`

### Email subscription not working

- Check spam folder
- Verify subscription was confirmed
- Check SNS topic subscriptions: `aws sns list-subscriptions-by-topic --topic-arn <topic-arn>`

## Next Steps

After staging deployment is successful:

1. Run integration tests against staging environment
2. Monitor for 24-48 hours to ensure stability
3. Review CloudWatch dashboard metrics
4. Adjust alarm thresholds if needed
5. Proceed to production deployment (Days 19-21)

## Rollback

If issues occur:

```bash
# Destroy staging infrastructure
cd infra/terraform
terraform destroy -var-file=staging.tfvars

# Confirm destruction when prompted
```

**Note**: Destroying will delete all data in DynamoDB tables. Ensure backups exist if needed.

## Verification Checklist

- [ ] All DynamoDB tables created and accessible
- [ ] SSM parameter accessible
- [ ] SNS topic created
- [ ] CloudWatch alarms configured
- [ ] Dashboard accessible and showing metrics
- [ ] GitHub Actions workflow runs successfully
- [ ] Email notifications working
- [ ] Integration tests pass against staging
- [ ] No critical alarms firing
