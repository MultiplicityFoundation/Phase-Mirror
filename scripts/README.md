# Scripts Directory

This directory contains operational scripts for Phase Mirror infrastructure management, deployment, and testing.

## Environment Validation Scripts (Pre-Flight Week 0)

### `update-progress.sh`
**Purpose:** Automated daily progress tracking for MVP completion

**Usage:**
```bash
./scripts/update-progress.sh <week-number>

# Examples:
./scripts/update-progress.sh 1  # Week 1 update
./scripts/update-progress.sh 2  # Week 2 update
```

**Actions:**
- Runs test suite and captures results
- Generates coverage report (if available)
- Counts known issues from `docs/known-issues.md`
- Captures git status
- Appends formatted update to `MVP_COMPLETION_TRACKER.md`

**Generated Entry Includes:**
- Date and week number
- Current git branch
- Test pass/fail counts
- Coverage percentage
- Known issues count (critical/important)
- Uncommitted changes count
- Sections for: Completed Today, Blockers, Tomorrow's Focus, Metrics

**Run:** Daily at end of workday to track progress

---

### `validate-environment.sh`
**Purpose:** Validates the development environment setup

**Usage:**
```bash
./scripts/validate-environment.sh
```

**Checks:**
- Prerequisites (node, pnpm, git, aws, terraform)
- Repository structure
- Build artifacts
- AWS connectivity
- Git status

**Run:** Anytime to verify environment health

---

### `generate-environment-doc.sh`
**Purpose:** Generates populated ENVIRONMENT.md documentation

**Usage:**
```bash
./scripts/generate-environment-doc.sh
```

**Creates:**
- Populated environment documentation with actual system values
- System information (OS, Node, pnpm, AWS, Terraform versions)
- AWS configuration details
- Repository status
- Build status

**Output:** `ENVIRONMENT.md.generated` (review and rename to `ENVIRONMENT.md`)

---

## Bootstrap Scripts (Day -1 & Day 15)

### `oidc/create-oidc-provider.sh`
**Purpose:** Creates GitHub OIDC provider in AWS for GitHub Actions authentication

**Usage:**
```bash
# Use default region
./scripts/oidc/create-oidc-provider.sh

# Specify region
AWS_REGION=us-west-2 ./scripts/oidc/create-oidc-provider.sh
```

**Creates:**
- GitHub OIDC provider in AWS IAM
- Configures trust relationship with GitHub Actions
- Sets up thumbprint for token validation
- Tags provider with project metadata

**Features:**
- Idempotent (safe to run multiple times)
- Checks for existing provider before creating
- Uses official GitHub Actions thumbprint
- Region-aware configuration

**Run Once:** Before deploying GitHub Actions IAM roles

**See also:** `GITHUB_OIDC_DAY13.md` for complete OIDC setup guide

---

### `bootstrap-terraform-backend-env.sh`
**Purpose:** Creates S3 bucket and DynamoDB table for Terraform state management (with environment support)

**Usage:**
```bash
# Use default values (dev environment)
./scripts/bootstrap-terraform-backend-env.sh

# Specify environment
ENVIRONMENT=staging ./scripts/bootstrap-terraform-backend-env.sh
ENVIRONMENT=production ./scripts/bootstrap-terraform-backend-env.sh

# Full customization
AWS_REGION=us-west-2 ENVIRONMENT=staging PROJECT_NAME=mirror-dissonance ./scripts/bootstrap-terraform-backend-env.sh
```

**Creates:**
- S3 bucket with versioning, encryption, and lifecycle policies
- DynamoDB table with Point-in-Time Recovery
- Backend configuration file (`infra/terraform/backend-{env}.hcl`)

**Features:**
- Environment-specific naming (dev, staging, production)
- Lifecycle policies (90-day version retention)
- Comprehensive security settings
- Auto-generated backend configuration

**Run Once:** Before first `terraform init` for each environment

---

### `check-aws-limits.sh`
**Purpose:** Checks AWS service limits to ensure sufficient quotas for deployment

**Usage:**
```bash
./scripts/check-aws-limits.sh
```

**Checks:**
- DynamoDB table limits (2500 max)
- SSM parameter limits (10,000 max)
- S3 bucket limits (1000 soft limit)
- IAM role limits (5000 max)
- VPC limits (5 default)
- Lambda function limits (1000 max)
- CloudWatch log groups

**Output:**
- ✓ Green: Under 70% of limit
- ⚠ Yellow: 70-90% of limit (warning)
- ✗ Red: >90% of limit (critical)

**Exit Codes:**
- 0: All limits OK
- 1: Warnings (approaching limits)
- 2: Critical (near limits, action required)

**Run:** Before infrastructure deployment and periodically during operation

---

### `bootstrap-terraform-backend.sh`
**Purpose:** Creates S3 bucket and DynamoDB table for Terraform state management

**Usage:**
```bash
./scripts/bootstrap-terraform-backend.sh
```

**Creates:**
- S3 bucket: `mirror-dissonance-terraform-state-prod`
- DynamoDB table: `terraform-state-lock`
- Enables versioning, encryption, and public access blocking

**Run Once:** Before first `terraform init`

---

### `bootstrap-nonce.sh`
**Purpose:** Generates and stores SSM nonce parameter for RedactedText validation

**Usage:**
```bash
./scripts/bootstrap-nonce.sh [environment]
# Examples:
./scripts/bootstrap-nonce.sh staging
./scripts/bootstrap-nonce.sh production
```

**Creates:**
- SSM parameter: `/guardian/{env}/redaction_nonce_v1`
- Type: SecureString (encrypted)
- UUID-based nonce value

**Security:** Save the generated nonce value securely!

---

## Terraform Scripts (Days 16-17)

### `terraform-validate.sh`
**Purpose:** Validates Terraform configuration syntax and formatting

**Usage:**
```bash
cd infra/terraform
../../scripts/terraform-validate.sh
```

**Checks:**
- Configuration validity
- Format compliance
- Module consistency

---

### `terraform-plan.sh`
**Purpose:** Generates Terraform execution plan for review

**Usage:**
```bash
cd infra/terraform
../../scripts/terraform-plan.sh [environment]
# Examples:
../../scripts/terraform-plan.sh staging
../../scripts/terraform-plan.sh production
```

**Outputs:**
- Execution plan file
- Resource changes summary
- Cost estimation (if available)

---

### `terraform-apply.sh`
**Purpose:** Applies Terraform configuration to deploy infrastructure

**Usage:**
```bash
cd infra/terraform
../../scripts/terraform-apply.sh [environment]
```

**Actions:**
- Applies Terraform plan
- Creates/updates infrastructure
- Outputs resource details

---

### `deploy-production.sh`
**Purpose:** Complete production deployment workflow

**Usage:**
```bash
./scripts/deploy-production.sh
```

**Workflow:**
1. Validates configuration
2. Generates plan
3. Reviews changes
4. Applies to production
5. Runs smoke tests

---

## Testing Scripts (Days 18-20)

### `test-e2e-manual.sh`
**Purpose:** End-to-end manual validation test

**Usage:**
```bash
./scripts/test-e2e-manual.sh [environment] [region]
# Examples:
./scripts/test-e2e-manual.sh staging us-east-1
./scripts/test-e2e-manual.sh production us-east-1
```

**Tests:**
1. Grant consent via CLI
2. Verify consent in DynamoDB
3. Record test FP event
4. Query FP window
5. Verify SSM parameter access

**Prerequisites:**
- CLI built (`cd packages/cli && pnpm build`)
- AWS credentials configured
- Infrastructure deployed

**Duration:** ~2-3 minutes

---

### `test-nonce-rotation.sh`
**Purpose:** Tests nonce rotation with zero downtime

**Usage:**
```bash
./scripts/test-nonce-rotation.sh [environment] [region]
# Examples:
./scripts/test-nonce-rotation.sh staging us-east-1
./scripts/test-nonce-rotation.sh production us-east-1
```

**Steps:**
1. Checks current nonce (v1)
2. Creates new nonce (v2)
3. Verifies both accessible
4. Documents grace period
5. Provides completion steps

**Note:** Does not delete old nonce (manual step for safety)

**See also:** `docs/ops/nonce-rotation.md`

---

### `test-alarms.sh`
**Purpose:** Tests CloudWatch alarms configuration

**Usage:**
```bash
./scripts/test-alarms.sh [environment]
```

**Validates:**
- Alarm existence
- Threshold configuration
- SNS topic associations
- Alarm state

---

### `run-integration-tests.sh`
**Purpose:** Runs integration tests against deployed infrastructure

**Usage:**
```bash
./scripts/run-integration-tests.sh [environment]
```

**Tests:**
- DynamoDB operations
- SSM parameter access
- Consent management
- FP event recording

---

## Verification Scripts (Day 18)

### `verify-pitr.sh`
**Purpose:** Verifies Point-in-Time Recovery is enabled on DynamoDB tables

**Usage:**
```bash
./scripts/verify-pitr.sh [environment] [region]
# Examples:
./scripts/verify-pitr.sh staging us-east-1
./scripts/verify-pitr.sh production us-east-1
```

**Checks:**
- PITR status on all tables
- Recovery window availability
- Backup configuration

**Expected:** All tables show `ENABLED` status

---

## Usage Patterns

### First-Time Setup (Pre-Flight Week 0 & Day 15)
```bash
# 0. Validate environment (Pre-Flight Week 0)
./scripts/validate-environment.sh

# 1. Generate environment documentation
./scripts/generate-environment-doc.sh
mv ENVIRONMENT.md.generated ENVIRONMENT.md

# 2. Bootstrap backend (Day -1)
ENVIRONMENT=dev ./scripts/bootstrap-terraform-backend-env.sh

# 3. Bootstrap nonce (Day 15)
./scripts/bootstrap-nonce.sh staging

# 4. Initialize Terraform
cd infra/terraform
terraform init -backend-config=backend-dev.hcl
```

### Staging Deployment (Days 16-17)
```bash
# 1. Validate
cd infra/terraform
../../scripts/terraform-validate.sh

# 2. Plan
../../scripts/terraform-plan.sh staging

# 3. Apply
../../scripts/terraform-apply.sh staging

# 4. Verify PITR
../../scripts/verify-pitr.sh staging us-east-1
```

### E2E Testing (Days 19-20)
```bash
# 1. Run manual E2E test
./scripts/test-e2e-manual.sh staging

# 2. Test nonce rotation
./scripts/test-nonce-rotation.sh staging

# 3. Verify alarms
./scripts/test-alarms.sh staging

# 4. Run integration tests
./scripts/run-integration-tests.sh staging
```

### Production Deployment (Day 21)
```bash
# 1. Review checklist
cat docs/ops/PRODUCTION_DEPLOYMENT_CHECKLIST.md

# 2. Bootstrap production nonce
./scripts/bootstrap-nonce.sh production

# 3. Deploy (with caution!)
./scripts/deploy-production.sh

# 4. Run smoke tests
./scripts/test-e2e-manual.sh production
```

---

## Script Conventions

### Exit Codes
- `0` - Success
- `1` - General error
- `2` - Missing prerequisites

### Output Format
- `🚀` - Starting operation
- `✅` - Success
- `❌` - Error
- `⚠️` - Warning
- `⏳` - In progress

### Environment Variables
Most scripts support:
- `AWS_REGION` - AWS region (default: us-east-1)
- `AWS_PROFILE` - AWS profile to use

### Error Handling
All scripts use `set -euo pipefail` for strict error handling:
- `-e` - Exit on error
- `-u` - Exit on undefined variable
- `-o pipefail` - Catch errors in pipes

---

## Troubleshooting

### Script Permission Denied
```bash
chmod +x scripts/*.sh
```

### AWS Credentials Not Found
```bash
aws configure
# or
export AWS_PROFILE=your-profile
```

### Terraform Not Initialized
```bash
cd infra/terraform
terraform init
```

### CLI Not Built
```bash
cd packages/cli
pnpm install
pnpm build
```

---

## Additional Resources

- **Deployment Guide:** `docs/ops/STAGING_DEPLOYMENT.md`
- **Production Checklist:** `docs/ops/PRODUCTION_DEPLOYMENT_CHECKLIST.md`
- **Phase 3 Completion:** `docs/PHASE3_COMPLETION.md`
- **Nonce Rotation:** `docs/ops/nonce-rotation.md`
- **Terraform Guide:** `docs/ops/terraform-deployment-guide.md`
- **Runbook:** `docs/ops/runbook.md`

---

## Contributing

When adding new scripts:

1. Use descriptive names
2. Add help text (`--help`)
3. Include error handling
4. Document in this README
5. Make executable (`chmod +x`)
6. Test in staging first

---

**Last Updated:** 2026-02-01  
**Maintained By:** Phase Mirror Team
