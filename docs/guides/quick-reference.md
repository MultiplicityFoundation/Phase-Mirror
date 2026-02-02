# Phase Mirror Quick Reference

Quick command reference for Phase Mirror development and operations.

## Daily Development

### Environment Validation
```bash
# Validate full environment
./scripts/validate-environment.sh

# Check AWS service limits
./scripts/check-aws-limits.sh

# Update daily progress
./scripts/update-progress.sh 1  # Week number
```

### Build & Test
```bash
# Build all packages
pnpm build

# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test -- path/to/test.test.ts

# Run tests in watch mode
pnpm test -- --watch
```

### Git Workflow
```bash
# Check git status
git status

# Create feature branch
git checkout -b feature/description

# Stage changes
git add .

# Commit with conventional format
git commit -m "type(scope): description"

# Push to remote
git push origin branch-name

# View commit history
git log --oneline -10
```

## Terraform Operations

### Backend Management
```bash
# Navigate to Terraform directory
cd infra/terraform

# Initialize Terraform with backend
terraform init

# Verify backend configuration
cat backend.tf
```

### Workspace Management
```bash
# List workspaces
terraform workspace list

# Create workspace
terraform workspace new staging

# Switch workspace
terraform workspace select staging

# Show current workspace
terraform workspace show
```

### Plan & Apply
```bash
# Generate plan
terraform plan -out=tfplan

# Apply plan
terraform apply tfplan

# Apply with auto-approve (use carefully!)
terraform apply -auto-approve

# Destroy resources (use very carefully!)
terraform destroy
```

### State Management
```bash
# List resources in state
terraform state list

# Show specific resource
terraform state show aws_dynamodb_table.fp_events

# Pull state to local file (backup)
terraform state pull > backup-$(date +%Y%m%d).tfstate

# Refresh state
terraform refresh
```

## AWS Operations

### Credentials & Configuration
```bash
# Configure AWS credentials
aws configure

# Check current identity
aws sts get-caller-identity

# Set profile
export AWS_PROFILE=your-profile

# Set region
export AWS_REGION=us-east-1
```

### S3 Operations
```bash
# List buckets
aws s3 ls

# List objects in bucket
aws s3 ls s3://bucket-name/prefix/ --recursive

# Check bucket versioning
aws s3api get-bucket-versioning --bucket bucket-name

# Check bucket encryption
aws s3api get-bucket-encryption --bucket bucket-name

# List object versions
aws s3api list-object-versions --bucket bucket-name --prefix path/to/object
```

### DynamoDB Operations
```bash
# List tables
aws dynamodb list-tables

# Describe table
aws dynamodb describe-table --table-name table-name

# Check PITR status
aws dynamodb describe-continuous-backups --table-name table-name

# Scan table (limited items)
aws dynamodb scan --table-name table-name --max-items 10

# Get item
aws dynamodb get-item --table-name table-name --key '{"id": {"S": "value"}}'
```

### SSM Parameter Store
```bash
# List parameters
aws ssm describe-parameters

# Get parameter value
aws ssm get-parameter --name /path/to/parameter --with-decryption

# List parameters with prefix
aws ssm get-parameters-by-path --path /guardian/ --recursive

# Put parameter
aws ssm put-parameter --name /path/to/parameter --value "value" --type SecureString
```

### CloudWatch Logs
```bash
# List log groups
aws logs describe-log-groups

# Tail log stream
aws logs tail /aws/lambda/function-name --follow

# Get recent logs
aws logs filter-log-events --log-group-name /aws/lambda/function-name --start-time $(date -u -d '1 hour ago' +%s)000
```

## Testing & Quality

### Run Tests
```bash
# All tests
pnpm test

# Specific package
pnpm --filter @mirror-dissonance/core test

# Watch mode
pnpm test -- --watch

# Coverage report
pnpm test:coverage

# Update snapshots
pnpm test -- -u
```

### Linting
```bash
# Run linter (if configured)
pnpm lint

# Fix auto-fixable issues
pnpm lint -- --fix
```

### Code Quality
```bash
# Type check
pnpm build  # TypeScript compilation

# Check for security vulnerabilities
npm audit

# Check for outdated packages
pnpm outdated
```

## Documentation

### View Documentation
```bash
# MVP completion tracker
cat docs/internal/mvp-completion-tracker.md

# Environment documentation
cat docs/guides/environment.md

# Pre-flight checklist
cat docs/internal/preflight-checklist.md

# Terraform backend docs
cat docs/ops/TERRAFORM_BACKEND.md

# Known issues
cat docs/known-issues.md

# Architecture decisions
ls docs/adr/
```

### Generate Documentation
```bash
# Generate environment documentation
./scripts/generate-environment-doc.sh

# View generated doc
cat ENVIRONMENT.md.generated
```

## Scripts

### Environment & Validation
```bash
# Validate environment
./scripts/validate-environment.sh

# Check AWS limits
./scripts/check-aws-limits.sh

# Generate environment doc
./scripts/generate-environment-doc.sh

# Update daily progress
./scripts/update-progress.sh <week-number>
```

### Infrastructure Bootstrap
```bash
# Bootstrap Terraform backend (dev)
ENVIRONMENT=dev ./scripts/bootstrap-terraform-backend-env.sh

# Bootstrap Terraform backend (staging)
ENVIRONMENT=staging ./scripts/bootstrap-terraform-backend-env.sh

# Bootstrap Terraform backend (production)
ENVIRONMENT=production ./scripts/bootstrap-terraform-backend-env.sh

# Bootstrap nonce (if script exists)
./scripts/bootstrap-nonce.sh staging
```

### Deployment
```bash
# Validate Terraform
cd infra/terraform && ../../scripts/terraform-validate.sh

# Plan deployment
cd infra/terraform && ../../scripts/terraform-plan.sh staging

# Apply deployment
cd infra/terraform && ../../scripts/terraform-apply.sh staging
```

## Package Management

### pnpm Commands
```bash
# Install dependencies
pnpm install

# Add dependency to workspace root
pnpm add -w package-name

# Add dependency to specific package
pnpm --filter @mirror-dissonance/core add package-name

# Remove dependency
pnpm remove package-name

# Update dependencies
pnpm update

# Clean node_modules
pnpm clean  # if script exists
rm -rf node_modules packages/*/node_modules
```

### Workspace Commands
```bash
# Run command in all workspaces
pnpm -r run build

# Run command in specific workspace
pnpm --filter @mirror-dissonance/core build

# List workspaces
pnpm list -r --depth 0
```

## Troubleshooting

### Common Issues

#### Build Fails
```bash
# Clean and rebuild
rm -rf packages/*/dist
pnpm install
pnpm build
```

#### Tests Fail
```bash
# Run with verbose output
pnpm test -- --verbose

# Run single test file
pnpm test -- path/to/test.test.ts
```

#### AWS Credentials Issues
```bash
# Reconfigure credentials
aws configure

# Check current credentials
aws sts get-caller-identity

# Use specific profile
export AWS_PROFILE=your-profile
```

#### Terraform State Locked
```bash
# List locks
aws dynamodb scan --table-name terraform-state-lock

# Manually remove lock (ONLY if no Terraform running!)
aws dynamodb delete-item --table-name terraform-state-lock \
  --key '{"LockID": {"S": "bucket-name/path/to/state"}}'
```

#### Git Issues
```bash
# Reset to last commit
git reset --hard HEAD

# Discard local changes
git checkout -- .

# Clean untracked files (careful!)
git clean -fd
```

## Performance Monitoring

### Benchmarks
```bash
# Run benchmarks (if available)
pnpm benchmark

# Profile test execution
pnpm test -- --detectLeaks
```

### Resource Usage
```bash
# Check disk usage
du -sh .
du -sh node_modules
du -sh packages/*/dist

# Check running processes
ps aux | grep node
ps aux | grep terraform
```

## Version Control

### Conventional Commits
```bash
# Format: type(scope): description

# Types:
feat     # New feature
fix      # Bug fix
docs     # Documentation changes
style    # Code style changes (formatting)
refactor # Code refactoring
test     # Test changes
chore    # Build/tooling changes

# Examples:
git commit -m "feat(fp-store): add batch write support"
git commit -m "fix(consent): handle expired consent properly"
git commit -m "docs(readme): update installation instructions"
git commit -m "test(oracle): add integration tests"
```

### Branch Management
```bash
# Create feature branch
git checkout -b feature/description

# Create fix branch
git checkout -b fix/issue-description

# Switch branches
git checkout branch-name

# Delete branch
git branch -d branch-name

# View all branches
git branch -a
```

## Emergency Procedures

### Rollback Terraform Changes
```bash
# View previous state
terraform state pull > current.tfstate

# Restore from S3 version
aws s3api list-object-versions --bucket bucket-name --prefix path/to/state
aws s3api get-object --bucket bucket-name --key path/to/state \
  --version-id VERSION_ID state.backup

# Push restored state
terraform state push state.backup
```

### Emergency Contact
- **Issues:** https://github.com/PhaseMirror/Phase-Mirror/issues
- **Documentation:** `docs/` directory

---

**Quick Reference Version:** 1.0  
**Last Updated:** 2026-02-01  
**For:** Phase Mirror MVP Development
