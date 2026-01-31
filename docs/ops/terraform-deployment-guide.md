# Terraform Deployment Guide

Complete guide for deploying Phase Mirror FP Calibration Service infrastructure using Terraform.

## Overview

This guide walks through deploying the infrastructure specified in [Phase 3: Infrastructure Deployment (Days 22-30)](../Phase%203:%20Infrastructure%20Deployment%20(Days%2022-30).md) using the Terraform modules in `/infra/terraform`.

## Prerequisites Checklist

- [ ] AWS account with appropriate permissions
- [ ] Terraform >= 1.6 installed
- [ ] AWS CLI configured with credentials
- [ ] **Terraform backend setup completed** (S3 bucket and DynamoDB table created - see [Remote State Setup](#remote-state-setup-required-before-first-use))
- [ ] **SSM nonce parameter bootstrapped** for your environment
- [ ] Access to create KMS keys, DynamoDB tables, Secrets Manager secrets
- [ ] Permissions to create IAM roles and policies
- [ ] SNS notification endpoints configured (email, Slack, etc.)

## Deployment Steps

**⚠️ Prerequisites**: Before starting deployment, complete the [Remote State Setup](#remote-state-setup-required-before-first-use) if this is your first time deploying.

### Phase 1: Pre-Deployment (Day 22)

#### 1.1 Review Infrastructure Requirements

Read the complete Phase 3 documentation:
```bash
cat docs/Phase\ 3:\ Infrastructure\ Deployment\ \(Days\ 22-30\).md
```

Key decisions:
- [ ] Choose AWS region (`us-east-1` recommended)
- [ ] Select environment name (`staging` or `production`)
- [ ] Determine deletion protection settings
- [ ] Configure backup and recovery settings

#### 1.2 Set Up AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Verify credentials
aws sts get-caller-identity

# Should output:
# {
#     "UserId": "AIDAI...",
#     "Account": "123456789012",
#     "Arn": "arn:aws:iam::123456789012:user/your-name"
# }
```

#### 1.3 Prepare Terraform Configuration

```bash
cd infra/terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit for your environment
vim terraform.tfvars
```

Example `terraform.tfvars`:
```hcl
aws_region  = "us-east-1"
environment = "staging"

enable_point_in_time_recovery = true
enable_deletion_protection    = false  # false for staging

fp_ingestion_lambda_name = ""  # Leave empty initially
```

### Phase 2: Staging Deployment (Day 23)

#### 2.1 Validate Terraform Configuration

```bash
# Run validation script
./scripts/terraform-validate.sh

# Expected output:
# 🔍 Validating Terraform configuration...
# 📦 Initializing Terraform...
# ✅ Running terraform validate...
# Success! The configuration is valid.
# ✅ Terraform validation complete!
```

#### 2.2 Review Terraform Plan

```bash
# Generate plan for staging
./scripts/terraform-plan.sh staging

# Review the plan carefully
# Look for:
# - Resources to be created (should be ~20-25)
# - No resources to be destroyed (first deployment)
# - Expected resource names and configurations
```

Expected resources:
- 3 DynamoDB tables (consent-store, calibration-store, fp-events)
- 1 KMS key with alias
- 1 Secrets Manager secret with initial version
- 3 IAM roles (FP Ingestion, Calibration Query, Salt Rotator)
- 5 CloudWatch alarms
- 2 SNS topics
- 1 CloudWatch dashboard
- Legacy resources (block-counter, redaction-nonce)

#### 2.3 Apply to Staging

```bash
# Apply configuration
./scripts/terraform-apply.sh staging

# Review output and confirm
# Type 'yes' when prompted
```

Deployment time: ~3-5 minutes

#### 2.4 Verify Staging Deployment

```bash
# Check created resources
terraform output

# Verify DynamoDB tables exist
aws dynamodb list-tables --query 'TableNames[?contains(@, `phase-mirror`)]'

# Verify KMS key created
aws kms list-aliases --query 'Aliases[?contains(AliasName, `phase-mirror`)]'

# Verify secret created
aws secretsmanager list-secrets --query 'SecretList[?contains(Name, `phase-mirror`)]'

# Verify IAM roles
aws iam list-roles --query 'Roles[?contains(RoleName, `phase-mirror`)]'
```

### Phase 3: Smoke Tests (Day 23)

#### 3.1 Test DynamoDB Table Access

```bash
# Test consent store
aws dynamodb describe-table \
  --table-name phase-mirror-consent-store-staging

# Verify TTL is enabled
# Output should show: "TimeToLiveStatus": "ENABLED"

# Test calibration store
aws dynamodb describe-table \
  --table-name phase-mirror-calibration-store-staging

# Verify GSI exists
# Output should show GlobalSecondaryIndexes with "rule-index"
```

#### 3.2 Test Secrets Manager Access

```bash
# Retrieve HMAC salt (using IAM role permissions)
aws secretsmanager get-secret-value \
  --secret-id /phase-mirror/fp-calibration/hmac-salt-staging

# Should return JSON with salt, rotationMonth, rotatedAt
```

#### 3.3 Test IAM Permissions

Create a test Lambda function to verify permissions:

```bash
# Create test Lambda (using FP Ingestion role)
aws lambda create-function \
  --function-name test-fp-ingestion-staging \
  --runtime nodejs18.x \
  --role $(terraform output -raw fp_ingestion_lambda_role_arn) \
  --handler index.handler \
  --zip-file fileb://test-lambda.zip

# Test permissions
aws lambda invoke \
  --function-name test-fp-ingestion-staging \
  response.json

# Clean up test Lambda
aws lambda delete-function \
  --function-name test-fp-ingestion-staging
```

### Phase 4: Production Deployment (Day 24)

#### 4.1 Review Staging Lessons

Document any issues found in staging:
- [ ] DynamoDB throughput adequate?
- [ ] IAM permissions working correctly?
- [ ] Secrets accessible?
- [ ] Alarms configured properly?

#### 4.2 Update Production Configuration

```bash
# Use production variables
vim infra/terraform/production.tfvars
```

Key differences for production:
```hcl
environment = "production"
enable_deletion_protection = true  # Protect production data
enable_point_in_time_recovery = true
```

#### 4.3 Generate Production Plan

```bash
./scripts/terraform-plan.sh production

# Review plan with team
# Save plan output for approval
terraform show tfplan-production-* > production-plan.txt
```

#### 4.4 Apply to Production

```bash
# Deploy to production
./scripts/terraform-apply.sh production

# Will prompt for confirmation
# Type 'yes' after careful review
```

#### 4.5 Configure SNS Subscriptions

```bash
# Get SNS topic ARNs
CRITICAL_TOPIC=$(terraform output -raw critical_alerts_topic_arn)
WARNING_TOPIC=$(terraform output -raw warning_alerts_topic_arn)

# Subscribe email for critical alerts
aws sns subscribe \
  --topic-arn $CRITICAL_TOPIC \
  --protocol email \
  --notification-endpoint oncall@yourcompany.com

# Subscribe Slack for warning alerts (requires Slack webhook)
aws sns subscribe \
  --topic-arn $WARNING_TOPIC \
  --protocol https \
  --notification-endpoint https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Confirm subscriptions via email/Slack
```

### Phase 5: Post-Deployment (Day 24)

#### 5.1 Enable CloudWatch Contributor Insights

```bash
# Enable for consent store
aws dynamodb update-contributor-insights \
  --table-name phase-mirror-consent-store-production \
  --contributor-insights-action ENABLE

# Enable for calibration store
aws dynamodb update-contributor-insights \
  --table-name phase-mirror-calibration-store-production \
  --contributor-insights-action ENABLE

# Enable for FP events
aws dynamodb update-contributor-insights \
  --table-name phase-mirror-fp-events-production \
  --contributor-insights-action ENABLE
```

#### 5.2 Document Deployment

Create deployment record:
```bash
cat > docs/ops/deployment-record-$(date +%Y%m%d).md << 'EOF'
# Deployment Record

**Date**: $(date -u +%Y-%m-%d)
**Environment**: Production
**Deployed By**: [Your Name]
**Terraform Version**: $(terraform version -json | jq -r .terraform_version)

## Resources Created
$(terraform state list)

## Outputs
$(terraform output)

## Verification
- [x] DynamoDB tables created
- [x] Secrets Manager configured
- [x] IAM roles created
- [x] CloudWatch alarms active
- [x] SNS subscriptions confirmed

## Issues
None

## Next Steps
- Deploy Lambda functions
- Configure salt rotation schedule
- Run integration tests
EOF
```

## Remote State Setup (Required Before First Use)

Before deploying infrastructure, you must set up the Terraform backend for state management. This is a **one-time setup** per AWS account.

### Option 1: Automated Bootstrap (Recommended)

Use the provided bootstrap script:

```bash
# From the repository root
./scripts/bootstrap-terraform-backend.sh
```

This script will:
- Create S3 bucket: `mirror-dissonance-terraform-state-prod`
- Enable versioning, encryption, and block public access
- Create DynamoDB table: `terraform-state-lock` for state locking
- Apply appropriate tags for resource organization

The backend configuration is already set in `infra/terraform/backend.tf` with these values.

### Option 2: Manual Setup

If you prefer to create resources manually:

#### 1. Create S3 Bucket for State

```bash
# Create bucket
aws s3 mb s3://mirror-dissonance-terraform-state-prod \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket mirror-dissonance-terraform-state-prod \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket mirror-dissonance-terraform-state-prod \
  --server-side-encryption-configuration \
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Block public access
aws s3api put-public-access-block \
  --bucket mirror-dissonance-terraform-state-prod \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

#### 2. Create DynamoDB Table for Locking

```bash
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

#### 3. Bootstrap SSM Nonce Parameter

The application requires an SSM parameter for the redaction nonce. Create it before deploying:

```bash
# For staging
./scripts/bootstrap-nonce.sh staging

# For production
./scripts/bootstrap-nonce.sh production
```

**⚠️ Important**: Save the generated nonce value securely (e.g., in a password manager) for rotation operations.

#### 4. Initialize Terraform with Backend

The backend is already configured in `infra/terraform/backend.tf`. Simply initialize:

```bash
cd infra/terraform
terraform init

# Create and select workspace for your environment
terraform workspace new staging
terraform workspace select staging
```

## Rollback Procedures

### Partial Rollback (Specific Resource)

```bash
# Remove resource from state
terraform state rm module.monitoring.aws_cloudwatch_metric_alarm.consent_check_failures

# Delete resource manually
aws cloudwatch delete-alarms \
  --alarm-names phase-mirror-consent-check-failures-critical-staging
```

### Full Rollback (All Resources)

```bash
# ⚠️ WARNING: This destroys all infrastructure!
terraform destroy -var-file=staging.tfvars

# Review resources to be destroyed
# Type 'yes' to confirm
```

### Rollback with Data Preservation

To rollback while preserving DynamoDB data:

```bash
# 1. Remove DynamoDB tables from state
terraform state rm module.dynamodb.aws_dynamodb_table.consent_store
terraform state rm module.dynamodb.aws_dynamodb_table.calibration_store
terraform state rm module.dynamodb.aws_dynamodb_table.fp_events

# 2. Destroy other resources
terraform destroy -var-file=staging.tfvars

# 3. DynamoDB tables remain in AWS
```

## Troubleshooting

### Issue: Terraform Init Fails

```bash
# Clear local cache
rm -rf .terraform .terraform.lock.hcl

# Reinitialize
terraform init
```

### Issue: Insufficient IAM Permissions

Required IAM permissions:
- `dynamodb:*` for table operations
- `kms:*` for key operations
- `secretsmanager:*` for secret operations
- `iam:*` for role/policy operations
- `cloudwatch:*` for alarms/dashboards
- `sns:*` for topic operations

### Issue: Resource Already Exists

```bash
# Import existing resource
terraform import module.dynamodb.aws_dynamodb_table.consent_store \
  phase-mirror-consent-store-staging
```

### Issue: State Lock Error

```bash
# Force unlock (use with caution)
terraform force-unlock LOCK_ID
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/terraform-deploy.yml`:

```yaml
name: Terraform Deploy

on:
  push:
    branches: [main]
    paths: ['infra/terraform/**']
  pull_request:
    paths: ['infra/terraform/**']

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: hashicorp/setup-terraform@v2
        with:
          terraform_version: 1.5.0
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      
      - name: Terraform Init
        run: terraform init
        working-directory: ./infra/terraform
      
      - name: Terraform Validate
        run: terraform validate
        working-directory: ./infra/terraform
      
      - name: Terraform Plan
        run: terraform plan -var-file=staging.tfvars
        working-directory: ./infra/terraform
      
      - name: Terraform Apply
        if: github.ref == 'refs/heads/main'
        run: terraform apply -var-file=staging.tfvars -auto-approve
        working-directory: ./infra/terraform
```

## Maintenance

### Regular Tasks

**Daily:**
- Check CloudWatch dashboard
- Review alarm status
- Monitor costs in AWS Cost Explorer

**Weekly:**
- Review Terraform state for drift
- Update Terraform provider versions
- Review IAM access patterns

**Monthly:**
- Verify HMAC salt rotation
- Review and optimize DynamoDB usage
- Update documentation

### Updating Infrastructure

```bash
# 1. Make changes to Terraform files
vim infra/terraform/modules/dynamodb/main.tf

# 2. Validate changes
./scripts/terraform-validate.sh

# 3. Plan in staging
./scripts/terraform-plan.sh staging

# 4. Apply to staging
./scripts/terraform-apply.sh staging

# 5. Test in staging

# 6. Apply to production
./scripts/terraform-plan.sh production
./scripts/terraform-apply.sh production
```

## Reference

- [Terraform AWS Provider Docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Phase 3 Infrastructure Specs](../Phase%203:%20Infrastructure%20Deployment%20(Days%2022-30).md)
- [Terraform Best Practices](https://www.terraform-best-practices.com/)

## Support

For issues:
1. Check [Known Issues](../known-issues.md)
2. Review AWS service health dashboard
3. Open issue in repository
4. Contact DevOps team
