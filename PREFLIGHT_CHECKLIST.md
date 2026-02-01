# Pre-Flight Week 0 Completion Checklist

**Purpose:** Validate that the Phase Mirror development environment is fully configured and ready for MVP development.

**Timeline:** Days -2, -1, and 0 (approximately 3-4 hours total)

---

## Day -2: Development Environment Setup

### Repository Setup
- [ ] Repository cloned successfully
  ```bash
  git clone https://github.com/PhaseMirror/Phase-Mirror.git
  cd Phase-Mirror
  git status  # Should show clean working tree
  ```

### Dependencies Installation
- [ ] Node.js 18+ installed
  ```bash
  node --version  # Should show v18.x.x or higher
  ```

- [ ] pnpm installed and accessible
  ```bash
  pnpm --version  # Should show v8.x.x or higher
  ```

- [ ] Dependencies installed successfully
  ```bash
  pnpm install
  # Should complete without errors
  ```

### Build Verification
- [ ] Build completes without errors
  ```bash
  pnpm build
  # Should build both packages/mirror-dissonance and packages/cli
  ```

- [ ] Tests run (pass/fail is OK at this stage)
  ```bash
  pnpm test
  # Should execute tests (results may vary)
  ```

### Tools Installation
- [ ] AWS CLI installed and verified
  ```bash
  aws --version
  # Should show aws-cli/2.x.x or higher
  ```

- [ ] Terraform installed and verified
  ```bash
  terraform --version
  # Should show Terraform v1.5.x or higher
  ```

- [ ] Git configured with user info
  ```bash
  git config user.name
  git config user.email
  # Should show your name and email
  ```

### Environment Validation
- [ ] Environment validation script passes
  ```bash
  ./scripts/validate-environment.sh
  # Should show green ✓ for most checks
  ```

**Expected Outcome:** Development environment is operational, code builds, and tests execute.

---

## Day -1: AWS Infrastructure Bootstrap

### AWS Credentials
- [ ] AWS credentials configured
  ```bash
  aws configure
  # Enter your AWS Access Key ID, Secret Access Key, and default region
  ```

- [ ] AWS credentials verified
  ```bash
  aws sts get-caller-identity
  # Should show your account ID and user ARN
  ```

### Terraform Backend Resources

#### S3 State Bucket
- [ ] S3 bucket created for Terraform state
  ```bash
  # Run bootstrap script (choose environment)
  ENVIRONMENT=dev ./scripts/bootstrap-terraform-backend-env.sh
  ```

- [ ] S3 bucket versioning enabled
  ```bash
  aws s3api get-bucket-versioning --bucket <bucket-name>
  # Should show "Status": "Enabled"
  ```

- [ ] S3 bucket encryption enabled
  ```bash
  aws s3api get-bucket-encryption --bucket <bucket-name>
  # Should show AES256 encryption configured
  ```

- [ ] Public access blocked on S3 bucket
  ```bash
  aws s3api get-public-access-block --bucket <bucket-name>
  # All settings should be true
  ```

#### DynamoDB Lock Table
- [ ] DynamoDB lock table created
  ```bash
  aws dynamodb describe-table --table-name <table-name>
  # Should show table details
  ```

- [ ] DynamoDB table is active
  ```bash
  aws dynamodb describe-table --table-name <table-name> --query 'Table.TableStatus'
  # Should show "ACTIVE"
  ```

- [ ] PITR enabled on lock table
  ```bash
  aws dynamodb describe-continuous-backups --table-name <table-name>
  # Should show PointInTimeRecoveryStatus: "ENABLED"
  ```

### Terraform Configuration
- [ ] Backend configuration created/updated
  ```bash
  cat infra/terraform/backend.tf
  # Should show S3 backend configuration with workspace_key_prefix
  ```

- [ ] Terraform initialized successfully
  ```bash
  cd infra/terraform
  terraform init
  # Should show "Terraform has been successfully initialized!"
  ```

- [ ] Terraform workspaces configured
  ```bash
  terraform workspace list
  # Should show available workspaces
  ```

### Documentation
- [ ] Backend documentation created
  ```bash
  cat docs/ops/TERRAFORM_BACKEND.md
  # Should exist and contain comprehensive backend documentation
  ```

- [ ] AWS service limits checked
  ```bash
  ./scripts/check-aws-limits.sh
  # Should show current resource usage vs limits
  ```

**Expected Outcome:** AWS infrastructure for Terraform state management is operational.

---

## Day 0: Baseline Documentation & Tracking

### MVP Tracking
- [ ] MVP completion tracker created
  ```bash
  cat MVP_COMPLETION_TRACKER.md
  # Should show 4-week roadmap with daily tasks
  ```

- [ ] Daily progress script created and executable
  ```bash
  ./scripts/update-progress.sh
  # Should show usage instructions
  ```

### Environment Documentation
- [ ] Environment documentation created
  ```bash
  cat ENVIRONMENT.md
  # Should contain system info, setup instructions, and troubleshooting
  ```

- [ ] Environment documentation populated (optional)
  ```bash
  ./scripts/generate-environment-doc.sh
  # Generates ENVIRONMENT.md.generated with actual system values
  ```

### Git Workflow (Optional but Recommended)
- [ ] Git hooks configured (optional)
  ```bash
  # Pre-commit hook to run tests
  cat .git/hooks/pre-commit
  
  # Commit-msg hook for conventional commits
  cat .git/hooks/commit-msg
  ```

- [ ] Feature branch created
  ```bash
  git checkout -b mvp-completion-week0
  # Or your preferred branch name
  ```

- [ ] Initial commit created with all setup files
  ```bash
  git add scripts/ MVP_COMPLETION_TRACKER.md ENVIRONMENT.md docs/ops/
  git commit -m "chore: complete Week 0 environment setup"
  ```

- [ ] Changes pushed to remote
  ```bash
  git push origin mvp-completion-week0
  # Should push successfully
  ```

**Expected Outcome:** Project tracking and documentation baseline established.

---

## Final Environment Validation

### Comprehensive Check
Run the complete validation script:
```bash
./scripts/validate-environment.sh
```

**Expected Results:**
```
=== Phase Mirror Environment Validation ===

## Prerequisites
✓ node is installed (v20.x.x)
✓ pnpm is installed (10.x.x)
✓ git is installed
✓ aws is installed
✓ terraform is installed (or ✗ if not needed yet)

## Repository Structure
✓ packages/mirror-dissonance exists
✓ packages/cli exists
✓ infra/terraform exists
✓ docs/adr exists
✓ package.json exists
✓ pnpm-workspace.yaml exists
✓ tsconfig.json exists

## Build Status
✓ packages/mirror-dissonance/dist exists
✓ packages/cli/dist exists
✓ node_modules exists
✓ pnpm-lock.yaml exists

## AWS Connectivity
✓ AWS credentials configured (or ✗ if optional)

## Git Status
✓ Current branch: <your-branch>
✓ Working tree clean (or ⚠ if uncommitted changes)
```

### Service Limits Check
```bash
./scripts/check-aws-limits.sh
```

**Expected Results:**
- All services showing green ✓ or yellow ⚠ (not red ✗)
- DynamoDB tables well below 2500 limit
- S3 buckets well below 1000 limit
- IAM roles well below 5000 limit

---

## Troubleshooting Common Issues

### Issue: pnpm not found
**Solution:**
```bash
npm install -g pnpm
```

### Issue: AWS credentials not configured
**Solution:**
```bash
aws configure
# Enter your credentials when prompted
```

### Issue: Terraform init fails
**Solution:**
```bash
# Verify backend resources exist
aws s3 ls s3://<your-bucket>/
aws dynamodb describe-table --table-name <your-table>

# If resources don't exist, run bootstrap again
ENVIRONMENT=dev ./scripts/bootstrap-terraform-backend-env.sh
```

### Issue: Build fails with TypeScript errors
**Solution:**
```bash
# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Issue: Tests fail to run
**Solution:**
```bash
# Verify Jest configuration
cat jest.config.cjs

# Run tests with verbose output
pnpm test -- --verbose
```

---

## Success Criteria

Week 0 is complete when **ALL** of the following are true:

✅ **Environment:**
- Development environment fully configured
- All tools installed and accessible
- Build and tests execute successfully

✅ **AWS Infrastructure:**
- Terraform backend resources created
- State bucket with versioning and encryption
- DynamoDB lock table with PITR
- Backend initialized and working

✅ **Documentation:**
- MVP completion tracker created
- Environment documentation complete
- Backend documentation available
- Daily progress script ready

✅ **Validation:**
- `./scripts/validate-environment.sh` passes
- `./scripts/check-aws-limits.sh` shows no critical issues
- All checklist items above marked complete

✅ **Version Control:**
- Changes committed to feature branch
- Branch pushed to remote (if applicable)

---

## Next Steps

### Week 1: Core Implementation Validation (Days 1-7)

**Tomorrow (Day 1) - Implementation Audit:**
1. Run implementation audit on FP Store
   ```bash
   cd packages/mirror-dissonance
   # Review src/fp-store/ implementation
   ```

2. Review DynamoDB operations
   - Verify `recordEvent` implementation
   - Verify `getWindowByCount` query logic
   - Check error handling

3. Validate error handling
   - Test timeout scenarios
   - Test throttling scenarios
   - Verify retry logic

4. Begin fixing critical known issues
   ```bash
   cat docs/known-issues.md
   # Review and prioritize issues
   ```

**Recommended Reading Tonight:**
- `docs/known-issues.md` - Familiarize with current issues
- `docs/adr/ADR-003-hierarchical-pmd-compute.md` - Understand L0/L1/L2 architecture
- `packages/mirror-dissonance/src/oracle.ts` - Review main Oracle implementation

**Daily Routine:**
```bash
# Morning: Update progress tracker
./scripts/update-progress.sh 1

# Throughout day: Work on tasks from MVP_COMPLETION_TRACKER.md

# Evening: Review and commit
git add -A
git commit -m "feat(scope): description of changes"
git push
```

---

## Time Estimates

- **Day -2 (Environment Setup):** 1-2 hours
- **Day -1 (AWS Bootstrap):** 1-1.5 hours
- **Day 0 (Documentation):** 0.5-1 hour
- **Total:** 3-4 hours

---

## Dependencies

**Required:**
- Node.js 18+
- npm (comes with Node.js)
- Git
- Text editor or IDE

**For AWS Deployment:**
- AWS account with appropriate permissions
- AWS CLI v2+
- Terraform 1.5+

**Optional:**
- Docker (for LocalStack integration testing)
- jq (for JSON parsing in scripts)

---

## Support Resources

- **Repository Issues:** https://github.com/PhaseMirror/Phase-Mirror/issues
- **Documentation:** `docs/` directory
- **Architecture Decisions:** `docs/adr/` directory
- **Operations Guides:** `docs/ops/` directory

---

**Checklist Completed:** [ ] Yes / [ ] No (with reasons below)

**Completion Date:** ___________

**Notes:**


---

**Last Updated:** 2026-02-01  
**Maintained By:** Phase Mirror Team
