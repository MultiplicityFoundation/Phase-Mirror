# Pre-Production Deployment Checklist

## Overview

This checklist must be completed before deploying Phase Mirror to production.

## 1. Infrastructure Readiness

### 1.1 Terraform Backend
- [ ] S3 bucket for state storage exists
- [ ] DynamoDB table for state locking exists
- [ ] State backend is encrypted
- [ ] State backend access is restricted

### 1.2 Core Infrastructure
- [ ] All DynamoDB tables created
  - [ ] `mirror-dissonance-production-fp-events`
  - [ ] `mirror-dissonance-production-consent`
  - [ ] `mirror-dissonance-production-block-counter`
- [ ] SSM parameters created
  - [ ] `/guardian/production/redaction_nonce_v1`
- [ ] S3 buckets created
  - [ ] `mirror-dissonance-production-baselines`
  - [ ] `mirror-dissonance-production-cloudtrail`
- [ ] KMS keys provisioned and rotation enabled

## 2. Security Controls

### 2.1 Identity & Access Management
- [ ] OIDC provider configured for GitHub Actions
- [ ] IAM roles created with least privilege
  - [ ] Terraform role
  - [ ] Deploy role
- [ ] No long-lived credentials in use
- [ ] Session duration ≤1 hour
- [ ] MFA enforced for console access (manual check)

### 2.2 Data Protection
- [ ] DynamoDB encryption enabled (KMS)
- [ ] S3 encryption enabled (KMS)
- [ ] SSM parameters stored as SecureString
- [ ] KMS key rotation enabled
- [ ] TLS 1.2+ enforced for all connections

### 2.3 Network Security
- [ ] S3 public access blocked
- [ ] No publicly accessible resources
- [ ] VPC endpoints configured (if applicable)

## 3. Monitoring & Alerting

### 3.1 CloudTrail
- [ ] CloudTrail enabled and logging
- [ ] Multi-region trail enabled
- [ ] Log file validation enabled
- [ ] CloudTrail logs encrypted
- [ ] CloudTrail logs retained ≥90 days

### 3.2 CloudWatch
- [ ] Dashboard created
- [ ] Security alarms configured
  - [ ] Unauthorized API calls
  - [ ] Root account usage
  - [ ] IAM policy changes
  - [ ] KMS key changes
- [ ] SNS topic for alerts
- [ ] Alert recipients configured

### 3.3 Application Logging
- [ ] Application logs to CloudWatch
- [ ] Log retention configured
- [ ] Sensitive data redacted in logs

## 4. Backup & Recovery

### 4.1 DynamoDB
- [ ] Point-in-Time Recovery (PITR) enabled
- [ ] Backup plan configured
  - [ ] Daily backups (7-day retention)
  - [ ] Weekly backups (30-day retention)
  - [ ] Monthly backups (90-day retention)

### 4.2 S3
- [ ] Versioning enabled
- [ ] Lifecycle policies configured
- [ ] Cross-region replication (optional)

### 4.3 Recovery Testing
- [ ] PITR restore tested
- [ ] Backup restore tested
- [ ] Recovery time documented

## 5. Testing & Quality

### 5.1 Automated Tests
- [ ] Unit tests pass (≥90% coverage)
- [ ] Integration tests pass
- [ ] E2E tests pass against staging

### 5.2 Performance
- [ ] Performance benchmarks meet targets
  - [ ] Redaction: <5ms
  - [ ] DynamoDB write: <100ms
  - [ ] Complete workflow: <500ms
- [ ] Load testing completed
- [ ] No throttling under expected load

### 5.3 Security Testing
- [ ] Dependency audit clean (no critical/high)
- [ ] Terraform security scan passed
- [ ] Infrastructure security audit passed

## 6. Documentation

### 6.1 Operational Docs
- [ ] Security incident runbook
- [ ] Nonce rotation guide
- [ ] Backup/recovery procedures
- [ ] On-call procedures

### 6.2 Technical Docs
- [ ] README.md current
- [ ] API documentation
- [ ] Architecture diagrams

## 7. CI/CD Readiness

### 7.1 GitHub Actions
- [ ] Terraform workflow configured
- [ ] E2E test workflow configured
- [ ] Security scan workflow configured
- [ ] OIDC roles have correct permissions

### 7.2 Branch Protection
- [ ] `main` branch protected
- [ ] Require PR reviews
- [ ] Require status checks
- [ ] Require signed commits (optional)

## 8. Compliance & Governance

### 8.1 Data Handling
- [ ] PII redaction functioning
- [ ] Data retention policies enforced (TTL)
- [ ] Right to deletion process documented

### 8.2 Audit Trail
- [ ] All API calls logged (CloudTrail)
- [ ] User actions attributable
- [ ] Logs tamper-protected

## 9. Go-Live Preparation

### 9.1 Pre-Deployment
- [ ] Change management ticket created
- [ ] Rollback plan documented
- [ ] On-call schedule confirmed
- [ ] Stakeholders notified

### 9.2 Deployment
- [ ] Deploy during low-traffic window
- [ ] Monitor dashboards during deploy
- [ ] Verify health checks pass
- [ ] Smoke tests pass

### 9.3 Post-Deployment
- [ ] Monitor for 24 hours
- [ ] Verify metrics normal
- [ ] Document any issues
- [ ] Update status page

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| Security Lead | | | |
| Operations Lead | | | |
| Product Owner | | | |

---

## Automated Verification

Run the automated checklist:

```bash
./scripts/security/pre-production-checklist.sh production
```

Run the full audit suite:

```bash
./scripts/security/run-all-audits.sh production
```
