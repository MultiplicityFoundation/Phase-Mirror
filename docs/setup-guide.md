# Mirror Dissonance Protocol - Setup Guide

## Quick Start

This guide will help you set up and deploy the Mirror Dissonance Protocol in your organization.

## Prerequisites

- **Node.js**: v18.0.0 or higher
- **pnpm**: v8.0.0 or higher
- **AWS Account**: For infrastructure deployment
- **Terraform**: v1.0 or higher (for infrastructure)
- **GitHub Repository**: With Actions enabled

## Installation Steps

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/RyVanGyver/Phase-Mirror.git
cd Phase-Mirror

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### 2. Test Local Installation

```bash
# Test basic functionality
pnpm oracle:run run --mode pull_request --branch test --dry-run

# Expected output: Oracle analysis with ALLOW decision
```

### 3. AWS Infrastructure Setup

#### Generate Redaction Nonce

```bash
# Generate a secure 32-byte nonce (64 hex characters)
openssl rand -hex 32
```

Save this value - you'll need it in the next step.

#### Store Nonce in AWS SSM

```bash
# Store in Parameter Store
aws ssm put-parameter \
  --name /guardian/redaction_nonce \
  --value YOUR_GENERATED_NONCE_HERE \
  --type SecureString \
  --region us-east-1

# Verify it was stored
aws ssm get-parameter \
  --name /guardian/redaction_nonce \
  --with-decryption \
  --region us-east-1
```

#### Deploy Terraform Infrastructure

```bash
# Navigate to terraform directory
cd infra/terraform

# Initialize Terraform
terraform init

# Review plan
terraform plan

# Apply infrastructure
terraform apply

# Note the outputs - you'll need these
```

This creates:
- DynamoDB table: `mirror-dissonance-fp-events`
- DynamoDB table: `mirror-dissonance-block-counter`
- SSM parameter: `/guardian/redaction_nonce`
- CloudWatch alarms for monitoring

### 4. GitHub Configuration

#### Update CODEOWNERS

Edit `.github/CODEOWNERS` and replace placeholders:

```
# Before
/packages/mirror-dissonance/src/rules/  @steward-username

# After  
/packages/mirror-dissonance/src/rules/  @your-actual-username
```

Update all placeholder usernames:
- `@steward-username` → Your rule steward
- `@security-lead` → Your security team lead
- `@ops-team` → Your operations team

#### Configure Branch Protection

1. Go to repository Settings → Branches
2. Add rule for `main` branch
3. Apply settings from `.github/branch-protection.json`:
   - Require status checks: "Mirror Dissonance Oracle"
   - Require code owner reviews
   - Dismiss stale reviews
   - Require conversation resolution

Or use GitHub CLI:

```bash
# Example using gh CLI
gh api repos/:owner/:repo/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  --input .github/branch-protection.json
```

#### Enable GitHub Actions

1. Go to repository Settings → Actions
2. Enable "Allow all actions and reusable workflows"
3. Verify workflows appear in Actions tab

### 5. Initial Calibration

Create a baseline for drift detection:

```bash
# Run calibration mode
pnpm oracle:run run \
  --mode calibration \
  --output baseline.json

# Review the baseline
cat baseline.json

# Commit baseline to repository
git add baseline.json
git commit -m "Add oracle baseline"
git push
```

### 6. Test GitHub Actions Integration

Create a test PR to verify the workflow:

```bash
# Create test branch
git checkout -b test/oracle-integration

# Make a small change
echo "# Test" >> test.md
git add test.md
git commit -m "Test oracle integration"

# Push and create PR
git push -u origin test/oracle-integration
gh pr create --title "Test Oracle Integration" --body "Testing the oracle workflow"
```

Watch the PR for:
- ✅ Oracle check passes
- 📊 Oracle report in Actions artifacts
- 📝 Summary in workflow output

## Configuration Options

### Environment Variables

Set these in GitHub repository secrets or workflow environment:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-key>
AWS_SECRET_ACCESS_KEY=<your-secret>
```

### Repository Variables

Set in repository settings:

- `ORACLE_MODE`: Default mode (default: `pull_request`)
- `ORACLE_STRICT`: Enable strict mode (default: `false`)

### Workflow Customization

Edit `.github/workflows/*.yml` to customize:

- Schedule for drift detection
- Branch protection requirements
- Notification settings
- Artifact retention

## Verification Checklist

After setup, verify:

- [ ] Dependencies installed successfully
- [ ] Packages build without errors
- [ ] CLI executes locally
- [ ] AWS nonce accessible
- [ ] Terraform infrastructure deployed
- [ ] DynamoDB tables created
- [ ] CloudWatch alarms configured
- [ ] CODEOWNERS updated
- [ ] Branch protection enabled
- [ ] GitHub Actions workflows active
- [ ] Test PR passes oracle check
- [ ] Baseline created
- [ ] Documentation reviewed

## Common Setup Issues

### Issue: Nonce Not Found

**Symptom:** Error loading nonce from SSM

**Solution:**
```bash
# Verify parameter exists
aws ssm describe-parameters --filters "Key=Name,Values=/guardian/redaction_nonce"

# Check IAM permissions
aws ssm get-parameter --name /guardian/redaction_nonce --with-decryption
```

### Issue: Build Failures

**Symptom:** TypeScript compilation errors

**Solution:**
```bash
# Clean and rebuild
pnpm clean
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm build
```

### Issue: GitHub Actions Not Running

**Symptom:** Workflows don't trigger on PR

**Solution:**
1. Check Actions are enabled in repo settings
2. Verify workflow files are in `.github/workflows/`
3. Check branch protection rules match workflow names
4. Review workflow logs for errors

### Issue: DynamoDB Access Denied

**Symptom:** Cannot write to DynamoDB tables

**Solution:**
```bash
# Verify IAM permissions
aws dynamodb describe-table --table-name mirror-dissonance-fp-events

# Check IAM role/user has permissions:
# - dynamodb:PutItem
# - dynamodb:GetItem
# - dynamodb:Query
# - dynamodb:UpdateItem
```

## Post-Setup Tasks

### 1. Train Your Team

- Share documentation: `/docs/`
- Run example scenarios: `/docs/examples.md`
- Review architecture: `/docs/architecture.md`
- Practice overrides and exceptions

### 2. Monitor Initial Performance

First week checklist:
- Review violation patterns
- Adjust thresholds if needed
- Record false positives
- Monitor circuit breaker
- Check CloudWatch alarms

### 3. Establish Processes

Create processes for:
- False positive reporting
- Rule updates
- Threshold adjustments
- Emergency overrides
- Baseline updates

### 4. Schedule Regular Reviews

- Weekly: Review violations and trends
- Monthly: Calibrate thresholds
- Quarterly: Update baseline
- Annually: Review and update rules

## Getting Help

- **Documentation**: `/docs/` directory
- **Examples**: `/docs/examples.md`
- **Operations**: `/docs/ops/runbook.md`
- **Architecture**: `/docs/architecture.md`
- **Issues**: GitHub Issues
- **CODEOWNERS**: See `.github/CODEOWNERS`

## Next Steps

After successful setup:

1. **Customize Rules**: Add org-specific rules in `packages/mirror-dissonance/src/rules/`
2. **Tune Thresholds**: Adjust in `packages/mirror-dissonance/src/policy/thresholds.ts`
3. **Add Redaction Rules**: Custom patterns in redaction module
4. **Enhance Monitoring**: Additional CloudWatch metrics
5. **Integrate Tools**: Webhooks, Slack, PagerDuty

## Success Criteria

Your setup is successful when:

✅ PRs automatically analyzed
✅ Violations detected accurately
✅ Strict mode blocks appropriately
✅ False positives tracked
✅ Circuit breaker functional
✅ Drift detection running
✅ Team understands system
✅ Documentation accessible
✅ Monitoring in place
✅ Processes established

Congratulations! Your Mirror Dissonance Protocol is now operational. 🎉
