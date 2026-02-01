# Quick Start Guide

Get Mirror Dissonance up and running in 5 minutes for local development or self-hosted deployment.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Node.js** v18+ and **pnpm** installed
- [ ] **AWS CLI** configured with credentials (for production deployment)
- [ ] **Terraform** v1.6+ (for infrastructure deployment)
- [ ] **Git** for version control
- [ ] **GitHub repository** where you want to use Mirror Dissonance

### Optional for Full Features
- [ ] AWS account with permissions for DynamoDB, SSM, KMS
- [ ] GitHub Actions enabled on your repository

---

## Installation

### Option 1: Local Development (No AWS Required)

```bash
# Clone the repository
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror

# Install dependencies
pnpm install

# Build the packages
pnpm build

# Run in local mode (no AWS dependencies)
cd packages/cli
pnpm start analyze --mode pull_request --local
```

### Option 2: Global CLI Installation

```bash
# Install from npm (when published)
npm install -g @mirror-dissonance/cli

# Or link locally for development
cd packages/cli
npm link

# Use globally
mirror-dissonance analyze --help
```

---

## Step-by-Step Deployment (Staging)

### 1. Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure

# Verify access
aws sts get-caller-identity
```

### 2. Deploy Infrastructure with Terraform

```bash
# Navigate to Terraform directory
cd infra/terraform

# Initialize Terraform
terraform init

# Create staging workspace
terraform workspace new staging
terraform workspace select staging

# Review the plan
terraform plan -var-file=staging.tfvars

# Apply infrastructure
terraform apply -var-file=staging.tfvars
```

**Expected Resources Created:**
- DynamoDB tables: `mirror-dissonance-staging-fp-events`, `mirror-dissonance-staging-consent`, `mirror-dissonance-staging-block-counter`
- SSM parameter: `/guardian/staging/redaction_nonce_v1`
- KMS key for encryption
- CloudWatch alarms
- S3 bucket for baseline storage

### 3. Generate Initial Nonce

```bash
# Generate nonce for anonymization
./scripts/rotate-nonce.sh staging 0
```

### 4. Configure GitHub Actions

Add to your repository `.github/workflows/mirror-dissonance.yml`:

```yaml
name: Mirror Dissonance Check

on:
  pull_request:
  merge_group:

jobs:
  oracle:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ORACLE_ROLE }}
          aws-region: us-east-1
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'  # Uses latest 18.x - consider pinning (e.g., 18.20.0) for reproducibility
      
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Run Mirror Dissonance
        run: |
          npx @mirror-dissonance/cli analyze \
            --mode pull_request \
            --repository ${{ github.repository }} \
            --commit ${{ github.sha }} \
            --fp-table-name mirror-dissonance-staging-fp-events \
            --consent-table-name mirror-dissonance-staging-consent \
            --nonce-parameter /guardian/staging/redaction_nonce_v1
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dissonance-report
          path: dissonance_report.json
```

### 5. Add GitHub Secrets

In your repository settings, add:
- `AWS_ORACLE_ROLE`: ARN of IAM role for GitHub Actions OIDC

---

## Verification Steps

### Test CLI Locally

```bash
# Run against local test data
mirror-dissonance analyze \
  --mode pull_request \
  --local \
  --verbose

# Check output
cat dissonance_report.json | jq .
```

### Verify Infrastructure

```bash
# Check DynamoDB tables
aws dynamodb list-tables | grep mirror-dissonance-staging

# Verify SSM parameter
aws ssm get-parameter \
  --name /guardian/staging/redaction_nonce_v1 \
  --with-decryption

# Check CloudWatch alarms
aws cloudwatch describe-alarms \
  --alarm-name-prefix mirror-dissonance-staging
```

### Test GitHub Actions Workflow

1. Create a test branch
2. Make a small change
3. Open a pull request
4. Check the Actions tab for workflow run
5. Verify `dissonance_report.json` artifact is uploaded

---

## Common Issues and Solutions

### Issue: "Nonce not found"
**Cause:** SSM parameter doesn't exist  
**Solution:** Run `./scripts/rotate-nonce.sh staging 0`

### Issue: "DynamoDB table not found"
**Cause:** Terraform not applied or wrong region  
**Solution:** Verify with `terraform output` and check AWS region

### Issue: "Permission denied"
**Cause:** IAM role lacks required permissions  
**Solution:** Review IAM policy in `infra/terraform/github-oidc.tf`

### Issue: Schema validation failed
**Cause:** Version mismatch between CLI and library  
**Solution:** Ensure all packages are at the same version: `pnpm install`

### Issue: Circuit breaker triggered
**Cause:** Too many blocks in short time period  
**Solution:** This is expected behavior. Review FP events and adjust thresholds if needed

---

## Next Steps

After successful deployment:

1. **Configure Rules:** See [CONFIGURATION.md](./CONFIGURATION.md) for rule tuning
2. **Set Up Monitoring:** Enable CloudWatch dashboards and SNS alerts
3. **Review Documentation:** Check [architecture.md](./architecture.md) for system design
4. **Join Community:** Visit governance docs for contribution guidelines

---

## Quick Reference Commands

```bash
# Build project
pnpm build

# Run tests
pnpm test

# Run CLI locally
mirror-dissonance analyze --mode pull_request --local

# Deploy to staging
cd infra/terraform && terraform apply -var-file=staging.tfvars

# Rotate nonce
./scripts/rotate-nonce.sh staging 0

# Check logs
aws logs tail /aws/lambda/mirror-dissonance-staging --follow
```

---

## Getting Help

- **Documentation:** Browse [docs/](../docs/) directory
- **Issues:** Report bugs on [GitHub Issues](https://github.com/PhaseMirror/Phase-Mirror/issues)
- **FAQ:** See [FAQ.md](./FAQ.md) for common questions
- **Troubleshooting:** Detailed guide in [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
