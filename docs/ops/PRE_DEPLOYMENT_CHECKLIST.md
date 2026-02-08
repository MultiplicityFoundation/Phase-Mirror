# Pre-Deployment Checklist - Phase 3

## Prerequisites Verification

### Phase 2 Completions
- [x] FPStore DynamoDB implementation complete
- [x] ConsentStore DynamoDB implementation complete
- [x] BlockCounter DynamoDB implementation complete
- [x] RedactedText HMAC validation complete
- [x] Report schema v2 published
- [x] All integration tests passing in staging
- [x] Adapter error propagation contract formalised (ADR-006)
- [x] CLI path resolution fixed for all deployment contexts

### AWS Account Setup
- [x] Production AWS account identified
- [x] IAM roles created for GitHub Actions
  - [x] `mirror-dissonance-{env}-github-terraform` (Terraform apply permissions)
  - [x] `mirror-dissonance-{env}-github-deploy` (DynamoDB, SSM read permissions)
- [ ] Cost allocation tags configured
- [ ] Billing alarms set (threshold: $100/month initially)

### Secrets & Parameters
- [x] SSM parameter namespace decided: `/guardian/{env}/`
- [ ] GitHub secrets configured:
  - [ ] `AWS_ROLE_ARN_STAGING` (for OIDC — set after first `terraform apply`)
  - [ ] `AWS_ROLE_ARN_PRODUCTION` (for OIDC — set after production deploy)
  - [x] Terraform state bucket name in `backend.tf` (hard-coded, no secret needed)
  - [x] Terraform lock table name in `backend.tf` (hard-coded, no secret needed)
- [ ] Initial nonce generated and stored in SSM manually (`scripts/bootstrap-nonce.sh`)

### Terraform State Backend
- [x] S3 bucket created: `mirror-dissonance-terraform-state-prod`
- [x] Versioning enabled on bucket
- [x] DynamoDB lock table created: `mirror-dissonance-terraform-lock-prod`
- [x] Backend configuration updated in `infra/terraform/backend.tf`
- [x] GitHub OIDC provider resource added (`infra/terraform/github-oidc.tf`)

### Monitoring Prerequisites
- [ ] SNS topic for ops alerts created
- [ ] Email subscription confirmed
- [ ] PagerDuty integration configured (if applicable)

### Environment Variables

```bash
export TF_VAR_environment=production
export TF_VAR_region=us-east-1
export TF_VAR_ops_sns_topic_arn=arn:aws:sns:us-east-1:ACCOUNT:mirror-dissonance-ops
export TF_VAR_nonce_rotation_trigger=initial
```

## Pre-Deployment Validation Steps

### 1. Terraform Configuration Review

```bash
cd infra/terraform

# Review backend configuration
cat backend.tf

# Review variables
cat variables.tf

# Check formatting
terraform fmt -check -recursive
```

### 2. Credentials Verification

```bash
# Verify AWS credentials
aws sts get-caller-identity

# Verify correct region
aws configure get region

# Test S3 backend access
aws s3 ls s3://mirror-dissonance-terraform-state-prod/
```

### 3. Initialize Terraform Backend

```bash
cd infra/terraform

# Initialize with backend configuration
terraform init

# Validate configuration
terraform validate
```

### 4. Generate and Review Plan

```bash
# Create plan for production
terraform plan -var="environment=production" -out=production.tfplan

# Review plan output carefully
terraform show production.tfplan

# Check resource counts
terraform show -json production.tfplan | jq '.resource_changes | length'
```

### 5. Security Verification

- [ ] KMS key rotation enabled
- [ ] DynamoDB encryption at rest enabled
- [ ] SSM parameters using SecureString type
- [ ] IAM least privilege principle applied
- [ ] All resources tagged appropriately

### 6. Cost Estimation

```bash
# Use terraform cost estimation tool
terraform plan -var="environment=production" | grep "will cost"

# Expected monthly costs (initial):
# - DynamoDB on-demand: $5-10
# - KMS keys: $1/key/month
# - SSM parameters: Free tier
# - PITR: ~$0.20/GB-month
# Total: <$20/month initially
```

## Post-Deployment Validation

### 1. Resource Verification

```bash
# List DynamoDB tables
aws dynamodb list-tables --region us-east-1 | grep mirror-dissonance

# Describe FP events table
aws dynamodb describe-table \
  --table-name mirror-dissonance-production-fp-events \
  --region us-east-1

# Verify SSM parameter
aws ssm get-parameter \
  --name /guardian/production/redaction_nonce_v1 \
  --with-decryption \
  --region us-east-1

# Check KMS key
aws kms list-aliases --region us-east-1 | grep mirror-dissonance
```

### 2. PITR Verification

```bash
# Run PITR verification script
./scripts/verify-pitr.sh production us-east-1
```

### 3. Monitoring Setup Verification

```bash
# List CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix "mirror-dissonance" \
  --region us-east-1

# Verify SNS topic subscriptions
aws sns list-subscriptions-by-topic \
  --topic-arn "${TF_VAR_ops_sns_topic_arn}" \
  --region us-east-1
```

### 4. Access Control Verification

```bash
# Test runtime role permissions
aws sts assume-role \
  --role-arn "arn:aws:iam::ACCOUNT:role/MirrorDissonanceRuntime" \
  --role-session-name "test-session"

# Test DynamoDB read access
aws dynamodb get-item \
  --table-name mirror-dissonance-production-consent \
  --key '{"orgId":{"S":"test"}}' \
  --region us-east-1
```

## Rollback Plan

### If Deployment Fails

1. **Review Terraform Error**
   ```bash
   # Check Terraform logs
   terraform show
   
   # Review state
   terraform state list
   ```

2. **Destroy Partial Resources (if needed)**
   ```bash
   # Target specific resources
   terraform destroy -target=aws_dynamodb_table.fp_events
   ```

3. **Restore Previous State**
   ```bash
   # List state versions
   aws s3api list-object-versions \
     --bucket mirror-dissonance-terraform-state-prod \
     --prefix production/terraform.tfstate
   
   # Download previous version if needed
   aws s3api get-object \
     --bucket mirror-dissonance-terraform-state-prod \
     --key production/terraform.tfstate \
     --version-id <VERSION_ID> \
     terraform.tfstate.rollback
   ```

## Sign-Off Checklist

Before proceeding to Day 23 deployment:

- [ ] All prerequisites verified
- [ ] Terraform configuration validated
- [ ] Plan reviewed and approved by team lead
- [ ] Backup/rollback procedures documented
- [ ] On-call engineer notified
- [ ] Deployment window scheduled
- [ ] Stakeholders informed

## Emergency Contacts

- **Primary Operator**: [Name] - [Email] - [Phone]
- **Backup Operator**: [Name] - [Email] - [Phone]
- **AWS Account Owner**: [Name] - [Email]
- **On-Call Engineer**: Check PagerDuty rotation

## Notes

Document any deviations from standard procedure here:

```
Date: ___________
Operator: ___________
Notes: 




```
