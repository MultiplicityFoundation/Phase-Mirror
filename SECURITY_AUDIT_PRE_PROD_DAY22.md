# Security Audit & Pre-Production Checklist

Comprehensive security audit blueprint for Phase Mirror production deployment.

## 0. Pre-flight Setup

```bash
cd Phase-Mirror
git checkout -b release/security-audit-preprod
```

## 1. Security Audit Architecture

### 1.1. Audit Categories

```text
┌────────────────────────────────────────────────────────────┐
│ Security Audit & Pre-Production Checklist                 │
├────────────────────────────────────────────────────────────┤
│ 1. Identity & Access Management (IAM)                     │
│    - OIDC configuration                                    │
│    - Role permissions (least privilege)                    │
│    - Service accounts                                      │
│                                                            │
│ 2. Data Protection                                        │
│    - Encryption at rest (KMS)                              │
│    - Encryption in transit (TLS)                           │
│    - Secrets management                                    │
│                                                            │
│ 3. Network Security                                       │
│    - Public exposure                                       │
│    - API security                                          │
│    - Rate limiting                                         │
│                                                            │
│ 4. Logging & Monitoring                                   │
│    - CloudTrail configuration                              │
│    - Security alarms                                       │
│    - Log retention                                         │
│                                                            │
│ 5. Vulnerability Assessment                               │
│    - Dependency scanning                                   │
│    - Code analysis                                         │
│    - Infrastructure scanning                               │
│                                                            │
│ 6. Compliance & Governance                                │
│    - Data retention policies                               │
│    - Privacy controls (redaction)                          │
│    - Audit trail                                           │
│                                                            │
│ 7. Incident Response Readiness                            │
│    - Runbooks                                              │
│    - Contact lists                                         │
│    - Recovery procedures                                   │
│                                                            │
│ 8. Pre-Production Validation                              │
│    - Infrastructure readiness                              │
│    - Performance validation                                │
│    - Backup verification                                   │
└────────────────────────────────────────────────────────────┘
```

## 2. Automated Security Audit Script

### 2.1. Comprehensive Audit Script

The automated security audit script is located at:

```bash
scripts/security/full-security-audit.sh
```

### 2.2. Running the Security Audit

To run the security audit:

```bash
# Make the script executable
chmod +x scripts/security/full-security-audit.sh

# Run for staging environment
./scripts/security/full-security-audit.sh staging

# Run for production environment
./scripts/security/full-security-audit.sh production
```

### 2.3. Audit Coverage

The script performs comprehensive checks across:

#### 1. Identity & Access Management
- OIDC provider configuration and thumbprint
- IAM role existence and trust policies
- Session duration limits
- Long-lived credential detection

#### 2. Data Protection
- DynamoDB encryption (KMS)
- S3 bucket encryption
- SSM parameter encryption
- KMS key rotation status

#### 3. Network Security
- S3 public access blocking
- DynamoDB access configuration

#### 4. Logging & Monitoring
- CloudTrail logging status
- Log file validation
- Multi-region trail configuration
- CloudTrail encryption
- Security alarm configuration
- Log retention policies

#### 5. Backup & Recovery
- DynamoDB Point-in-Time Recovery (PITR)
- S3 versioning
- AWS Backup vault and recovery points

#### 6. Vulnerability Assessment
- Dependency security audit
- Critical and high-severity vulnerability detection

### 2.4. Report Generation

The script generates detailed markdown reports in:

```
./security-audit-reports/audit-{environment}-{timestamp}.md
```

Each report includes:
- Executive summary
- Detailed check results
- Pass/Fail/Warning counts
- Remediation recommendations

### 2.5. Exit Codes

- `0`: All checks passed
- `1`: One or more checks failed (requires remediation)

## 2.6. Additional Security Scripts

The security suite includes three additional specialized scripts:

#### Pre-Production Checklist (`pre-production-checklist.sh`)

Comprehensive validation before production deployment:

```bash
./scripts/security/pre-production-checklist.sh [staging|production]
```

Validates 7 categories:
- Infrastructure Readiness (Terraform state, DynamoDB, S3, KMS)
- Security Controls (OIDC, IAM, encryption, secrets)
- Monitoring & Alerting (CloudTrail, dashboards, alarms, SNS)
- Backup & Recovery (PITR, versioning, backup vault)
- Testing & Quality (unit tests, E2E tests, vulnerabilities)
- Documentation (runbooks, ops guides, README)
- CI/CD Readiness (workflows, branch protection)

Generates reports in: `./pre-prod-reports/preprod-checklist-{timestamp}.md`

#### Dependency Scanner (`scan-dependencies.sh`)

Automated dependency vulnerability scanning:

```bash
./scripts/security/scan-dependencies.sh
```

Features:
- Uses `pnpm audit` for vulnerability detection
- Categorizes by severity (Critical, High, Moderate, Low)
- Checks for known vulnerable packages
- Provides remediation recommendations
- Generates JSON reports in `./security-audit-reports/`

Exit codes:
- `0`: No critical or high vulnerabilities
- `1`: Critical or high vulnerabilities found

#### Terraform Security Scanner (`scan-terraform.sh`)

Infrastructure-as-code security validation:

```bash
./scripts/security/scan-terraform.sh
```

Checks:
- Hardcoded secrets detection
- Encryption configurations (DynamoDB, S3)
- Public access configurations
- Logging configurations (CloudTrail)
- IAM policy reviews (overly permissive policies)

Returns advisory warnings, not failures.

### 2.7. Recommended Security Workflow

For comprehensive pre-production validation:

```bash
# 1. Full security audit
./scripts/security/full-security-audit.sh staging

# 2. Dependency scanning
./scripts/security/scan-dependencies.sh

# 3. Terraform infrastructure scanning
./scripts/security/scan-terraform.sh

# 4. Pre-production checklist
./scripts/security/pre-production-checklist.sh staging

# 5. Review all reports
ls -lh security-audit-reports/ pre-prod-reports/
```

## 3. Pre-Production Checklist

Before production deployment, ensure:

### Infrastructure Readiness
- [ ] All IAM roles configured with OIDC
- [ ] No long-lived credentials in use
- [ ] All encryption at rest enabled (KMS)
- [ ] All encryption in transit configured
- [ ] Public access blocked on all resources

### Monitoring & Logging
- [ ] CloudTrail enabled and logging
- [ ] Security alarms configured
- [ ] Log retention policies set (≥90 days)
- [ ] Alert notification channels configured

### Backup & Recovery
- [ ] DynamoDB PITR enabled on all tables
- [ ] S3 versioning enabled on critical buckets
- [ ] AWS Backup vault configured
- [ ] Recovery procedures documented and tested

### Security Validation
- [ ] No critical vulnerabilities in dependencies
- [ ] No high-severity vulnerabilities in dependencies
- [ ] Security audit script passes with 0 failures
- [ ] Penetration testing completed (if applicable)

### Compliance
- [ ] Data retention policies documented
- [ ] Privacy controls implemented
- [ ] Audit trail verified
- [ ] Incident response plan documented

## 4. Troubleshooting

### Common Issues

#### OIDC Provider Not Found
```bash
# Create OIDC provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

#### Encryption Not Enabled
```bash
# Enable DynamoDB encryption
aws dynamodb update-table \
  --table-name <table-name> \
  --sse-specification Enabled=true,SSEType=KMS

# Enable S3 encryption
aws s3api put-bucket-encryption \
  --bucket <bucket-name> \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms"
      }
    }]
  }'
```

#### CloudTrail Not Logging
```bash
# Start CloudTrail logging
aws cloudtrail start-logging --name <trail-name>
```

## 5. Next Steps

1. Run the security audit script
2. Review the generated report
3. Remediate any failures
4. Re-run the audit to verify fixes
5. Document any accepted risks
6. Obtain sign-off from security team
7. Proceed with production deployment

## 6. References

- [AWS Security Best Practices](https://docs.aws.amazon.com/security/)
- [OIDC Integration Guide](./GITHUB_OIDC_DAY13.md)
- [Staging Deployment Guide](./STAGING_DEPLOYMENT_DAY16-17.md)
- [Performance Benchmarks](./PERFORMANCE_BENCHMARKS_DAY21.md)
