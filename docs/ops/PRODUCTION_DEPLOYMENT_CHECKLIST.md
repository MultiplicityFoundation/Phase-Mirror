# Production Deployment Checklist

**Date:** ___________  
**Deployer:** ___________  
**Environment:** Production  
**Terraform Version:** ___________

---

## Pre-Deployment

### Infrastructure Validation

- [ ] Terraform backend state synced (no drift)
- [ ] All staging resources deployed successfully
- [ ] Staging E2E test passing (`./scripts/test-e2e-manual.sh staging`)
- [ ] CloudWatch alarms tested and confirmed working
- [ ] SNS email subscriptions confirmed (ops team)
- [ ] PITR enabled on all staging DynamoDB tables
- [ ] Cost allocation tags applied to all staging resources
- [ ] Terraform state backup available

### Security Checklist

- [ ] IAM roles follow least-privilege principle
- [ ] GitHub OIDC trust policy restricts to `MultiplicityFoundation/Phase-Mirror` repo
- [ ] SSM parameters encrypted (SecureString type)
- [ ] S3 buckets block all public access
- [ ] Production nonce generated and stored securely (password manager)
- [ ] No hardcoded secrets in repository
- [ ] KMS keys have rotation enabled
- [ ] All resources use encryption at rest
- [ ] IAM policies reviewed for production

### Application Readiness

- [ ] Unit tests passing (>80% coverage)
- [ ] Integration tests passing (all)
- [ ] CLI commands tested with real AWS resources in staging
- [ ] Nonce rotation runbook reviewed (`docs/ops/NONCE_ROTATION_RUNBOOK.md`)
- [ ] Incident response procedures documented (`docs/ops/runbook.md`)
- [ ] Performance benchmarks met in staging

### Documentation

- [ ] README.md updated with production deployment steps
- [ ] Architecture docs reflect actual deployed state
- [ ] Runbooks created for common operations
- [ ] Contact information current in `MAINTAINERS.md`
- [ ] Rollback procedures documented and tested
- [ ] Monitoring and alerting guide available

### Team Coordination

- [ ] Deployment window scheduled and communicated
- [ ] On-call engineer notified
- [ ] Stakeholders informed of deployment
- [ ] Rollback decision maker identified
- [ ] Post-deployment monitoring schedule established

---

## Deployment Steps

### 1. Create Production Workspace

```bash
cd infra/terraform
terraform workspace new production
terraform workspace select production

# Verify workspace
terraform workspace show
# Expected output: production
```

- [ ] Production workspace created
- [ ] Workspace selection verified

### 2. Bootstrap Production Nonce

```bash
# Generate and store production nonce
./scripts/bootstrap-nonce.sh production

# Record nonce value securely
# Store in: _________________________
```

- [ ] Production nonce created
- [ ] Nonce value stored in password manager
- [ ] Parameter name verified: `/guardian/production/redaction_nonce_v1`

### 3. Review Production Configuration

```bash
# Review production.tfvars
cat infra/terraform/production.tfvars

# Expected values:
# - environment = "production"
# - enable_point_in_time_recovery = true
# - enable_deletion_protection = true
```

- [ ] Production variables reviewed
- [ ] Deletion protection enabled
- [ ] PITR enabled
- [ ] Region confirmed: `us-east-1`

### 4. Generate Terraform Plan

```bash
cd infra/terraform

# Generate plan
terraform plan \
  -var-file=production.tfvars \
  -out=production.tfplan

# Review plan output carefully
terraform show production.tfplan

# Save plan summary
terraform show production.tfplan > production-plan-$(date +%Y%m%d).txt
```

- [ ] Terraform plan generated
- [ ] Plan reviewed by deployer
- [ ] Plan reviewed by second engineer
- [ ] Expected resource count matches staging
- [ ] No unexpected deletions
- [ ] Plan saved for audit trail

### 5. Apply Infrastructure

```bash
# Apply the plan
terraform apply production.tfplan

# Monitor output for errors
# Expected: "Apply complete! Resources: X added, 0 changed, 0 destroyed."
```

**Deployment Time:** __________ (Start)  
**Completion Time:** __________ (End)

- [ ] Terraform apply completed successfully
- [ ] No errors during apply
- [ ] All resources created
- [ ] Outputs captured

### 6. Capture Terraform Outputs

```bash
# Get all outputs
terraform output > production-outputs-$(date +%Y%m%d).txt

# Key outputs:
terraform output github_actions_deploy_role_arn
terraform output github_actions_role_arn
terraform output ops_alerts_topic_arn
terraform output cloudwatch_dashboard_url
terraform output baseline_bucket_name
```

**Key Outputs:**
- GitHub Actions Deploy Role ARN: _________________________
- GitHub Actions Runtime Role ARN: _________________________
- Ops Alerts Topic ARN: _________________________
- Dashboard URL: _________________________

- [ ] All outputs captured
- [ ] ARNs documented
- [ ] Dashboard URL accessible

### 7. Verify Resources Created

```bash
# DynamoDB tables
aws dynamodb list-tables --region us-east-1 | grep mirror-dissonance-production

# Expected tables:
# - mirror-dissonance-production-fp-events
# - mirror-dissonance-production-consent
# - mirror-dissonance-production-block-counter

# Verify PITR on each table
for table in fp-events consent block-counter; do
  echo "Checking ${table}..."
  aws dynamodb describe-continuous-backups \
    --table-name "mirror-dissonance-production-${table}" \
    --region us-east-1 \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus'
done

# SSM parameter
aws ssm get-parameter \
  --name /guardian/production/redaction_nonce_v1 \
  --region us-east-1

# SNS topic
aws sns list-topics --region us-east-1 | grep mirror-dissonance-production

# CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix mirror-dissonance-production \
  --region us-east-1

# S3 baseline bucket
aws s3 ls | grep mirror-dissonance-production-baselines
```

- [ ] All DynamoDB tables created
- [ ] PITR enabled on all tables (status: ENABLED)
- [ ] SSM parameter accessible
- [ ] SNS topic created
- [ ] CloudWatch alarms configured (5-7 alarms)
- [ ] S3 baseline bucket created
- [ ] All resources properly tagged

### 8. Configure GitHub Secrets

Navigate to: https://github.com/MultiplicityFoundation/Phase-Mirror/settings/secrets/actions

Add/Update these secrets:

| Secret Name | Value (from Terraform outputs) |
|-------------|-------------------------------|
| `AWS_ROLE_ARN_PRODUCTION` | arn:aws:iam::ACCOUNT_ID:role/mirror-dissonance-production-github-deploy |
| `OPS_SNS_TOPIC_ARN_PRODUCTION` | arn:aws:sns:us-east-1:ACCOUNT_ID:mirror-dissonance-production-ops-alerts |

- [ ] `AWS_ROLE_ARN_PRODUCTION` secret added
- [ ] `OPS_SNS_TOPIC_ARN_PRODUCTION` secret added
- [ ] Secrets verified by test workflow (optional)

### 9. Subscribe to Production Alerts

```bash
# Subscribe ops team email to SNS topic
aws sns subscribe \
  --topic-arn $(terraform output -raw ops_alerts_topic_arn) \
  --protocol email \
  --notification-endpoint ops-team@example.com \
  --region us-east-1

# Confirm subscription via email
```

- [ ] SNS subscription created
- [ ] Email confirmation received
- [ ] Test alert sent and received

---

## Post-Deployment Validation

### Smoke Tests

Run production smoke tests:

```bash
# Set production environment
export ENV=production
export AWS_REGION=us-east-1

# Test 1: Grant consent
cd packages/cli
node dist/index.js consent grant \
  --org PhaseMirror \
  --scope allrepos \
  --granted-by production-bootstrap

# Test 2: Verify consent in DynamoDB
aws dynamodb get-item \
  --table-name mirror-dissonance-production-consent \
  --key '{"orgId": {"S": "PhaseMirror"}}' \
  --region us-east-1

# Test 3: Verify nonce loads
aws ssm get-parameter \
  --name /guardian/production/redaction_nonce_v1 \
  --with-decryption \
  --region us-east-1
```

- [ ] Consent grant successful
- [ ] Consent verified in DynamoDB
- [ ] Nonce loads successfully
- [ ] No errors in CloudWatch Logs

### Monitoring Verification

```bash
# Open CloudWatch dashboard
terraform output cloudwatch_dashboard_url

# Check metrics:
# - DynamoDB capacity
# - SSM parameter access
# - Alarm status
```

- [ ] CloudWatch dashboard accessible
- [ ] All metrics showing data
- [ ] All alarms in OK state
- [ ] No error spikes
- [ ] Dashboard URL shared with team

### Performance Validation

- [ ] DynamoDB response times < 50ms (p99)
- [ ] SSM parameter access < 100ms
- [ ] No throttling errors
- [ ] Baseline metrics established

### Integration Test

```bash
# Run integration tests against production
export FP_TABLE=mirror-dissonance-production-fp-events
export CONSENT_TABLE=mirror-dissonance-production-consent
export NONCE_PARAM=/guardian/production/redaction_nonce_v1

pnpm test -- --testPathPattern=integration
```

- [ ] Integration tests passing
- [ ] No test failures
- [ ] All features working as expected

---

## Rollback Plan

### Rollback Decision Criteria

Rollback if:
- [ ] Critical alarms firing
- [ ] Data corruption detected
- [ ] Performance degradation > 50%
- [ ] Integration tests failing
- [ ] Security vulnerability discovered

### Rollback Procedure

**Decision Maker:** _________________________  
**Rollback Time:** _________________________

```bash
# 1. Stop traffic (if applicable)
# Disable GitHub Actions workflow or pause deployments

# 2. Switch to previous state
cd infra/terraform
terraform workspace select production

# 3. Get previous working commit
git log --oneline

# 4. Checkout previous version
git checkout <previous-working-commit>

# 5. Generate rollback plan
terraform plan -var-file=production.tfvars -out=rollback.tfplan

# 6. Review and apply rollback
terraform apply rollback.tfplan

# 7. Notify stakeholders
aws sns publish \
  --topic-arn $(terraform output -raw ops_alerts_topic_arn) \
  --subject "[ROLLBACK] Production Deployment Rolled Back" \
  --message "Deployment rolled back to previous version. Investigating issue." \
  --region us-east-1
```

- [ ] Rollback plan documented
- [ ] Previous state backup confirmed
- [ ] Rollback tested in staging (if time permits)
- [ ] Stakeholder notification procedure ready

---

## Sign-Off

### Pre-Deployment Approval

- [ ] Lead Engineer: ___________________________ Date: ________
- [ ] Security Review: ___________________________ Date: ________
- [ ] Operations Lead: ___________________________ Date: ________

### Post-Deployment Verification

- [ ] Deployment Completed: ___________________________ Date: ________ Time: ________
- [ ] Smoke Tests Passed: ___________________________ Date: ________ Time: ________
- [ ] Monitoring Verified: ___________________________ Date: ________ Time: ________

### Final Sign-Off

- [ ] Production Deployment Successful: ___________________________ Date: ________
- [ ] Handoff to Operations: ___________________________ Date: ________

---

## Post-Deployment Actions

### Immediate (Within 1 Hour)

- [ ] Monitor CloudWatch dashboard
- [ ] Watch for alarm notifications
- [ ] Check application logs
- [ ] Verify no error spikes
- [ ] Document any issues

### Within 24 Hours

- [ ] Review deployment metrics
- [ ] Analyze cost impact
- [ ] Update documentation with lessons learned
- [ ] Schedule post-mortem if needed
- [ ] Archive deployment artifacts

### Within 1 Week

- [ ] Review weekly FP event volume
- [ ] Check DynamoDB cost (on-demand vs. provisioned)
- [ ] Verify PITR working correctly
- [ ] Test backup restore procedure
- [ ] Update capacity planning

---

## Emergency Contacts

- **Primary Deployer:** ___________________________ (Phone: _____________)
- **Backup Deployer:** ___________________________ (Phone: _____________)
- **AWS Account Owner:** ___________________________ (Phone: _____________)
- **On-Call Engineer:** ___________________________ (Check PagerDuty)
- **Security Contact:** ___________________________ (Phone: _____________)

---

## Notes

Document any deviations from standard procedure, issues encountered, or special considerations:

```
Date: ___________
Operator: ___________
Notes: 




```

---

## Checklist Summary

**Total Items:** 100+  
**Completed:** ___ / ___  
**Blocked:** ___  
**Notes:** ___

**Deployment Status:** [ ] Success [ ] Failed [ ] Rolled Back

**Next Review Date:** ___________
