# Terraform Backend Verification - Day 15

This guide provides comprehensive instructions for setting up and verifying the Terraform backend infrastructure for Phase Mirror.

## Overview

The Terraform backend uses:
- **S3 bucket**: `mirror-dissonance-terraform-state-prod` for state storage
- **DynamoDB table**: `mirror-dissonance-terraform-lock-prod` for state locking
- **Region**: `us-east-1`

## Pre-flight Setup

```bash
cd Phase-Mirror
git checkout -b infra/terraform-backend-verification
cd infra/terraform
```

## Step 1: Review Infrastructure Layout

### 1.1. Inspect Terraform directory structure

```bash
ls -la
tree .
```

Expected structure:

```
infra/terraform/
├── backend.tf           # S3 + DynamoDB backend config
├── main.tf              # Main infrastructure
├── variables.tf         # Input variables
├── outputs.tf           # Output values
├── staging.tfvars       # Staging environment config
├── production.tfvars    # Production environment config
├── modules/
│   ├── dynamodb/        # DynamoDB tables module
│   ├── iam/             # IAM roles module
│   ├── monitoring/      # CloudWatch alarms module
│   └── secrets/         # Secrets management module
└── README.md
```

## Step 2: Backend Configuration Review

### 2.1. Review backend.tf

The backend configuration includes:
- S3 bucket for state storage with encryption
- DynamoDB table for state locking
- Workspace support for environment separation
- Required Terraform version (>= 1.5.0)
- AWS provider version (~> 5.0)

```bash
cat backend.tf
```

## Step 3: Backend Resources Creation

### 3.1. Create backend resources

Run the automated script to create S3 bucket and DynamoDB table:

```bash
../../scripts/create-backend-resources.sh
```

This script:
1. Creates S3 bucket with versioning enabled
2. Enables server-side encryption (AES256)
3. Blocks all public access
4. Creates DynamoDB table with PAY_PER_REQUEST billing
5. Configures appropriate tags

## Step 4: Backend Verification

### 4.1. Run comprehensive verification tests

```bash
../../scripts/verify-backend.sh
```

The verification script performs 8 checks:
1. S3 bucket exists
2. Versioning enabled
3. Encryption enabled (AES256 or KMS)
4. Public access blocked
5. DynamoDB table exists
6. DynamoDB key schema correct (LockID)
7. DynamoDB billing mode (PAY_PER_REQUEST)
8. S3 read/write functionality

## Step 5: Terraform Initialization

### 5.1. Run initialization tests

```bash
../../scripts/test-terraform-init.sh
```

This script tests:
1. Clean Terraform initialization
2. Backend configuration success
3. Terraform version detection
4. Workspace operations (create/select/delete)
5. DynamoDB lock table accessibility

### 5.2. Manual initialization (if needed)

```bash
# Initialize Terraform
terraform init

# Create staging workspace
terraform workspace new staging

# Plan with staging configuration
terraform plan -var-file=staging.tfvars
```

## Workspace Management

### List workspaces
```bash
terraform workspace list
```

### Create/select workspace
```bash
terraform workspace new staging
terraform workspace select staging
```

### Delete workspace
```bash
terraform workspace delete test-workspace
```

## State File Paths

With the current configuration:
- **Default workspace**: `s3://mirror-dissonance-terraform-state-prod/terraform.tfstate`
- **Named workspace**: `s3://mirror-dissonance-terraform-state-prod/workspaces/{workspace-name}/terraform.tfstate`

## Troubleshooting

### Backend initialization fails

1. Verify AWS credentials are configured:
   ```bash
   aws sts get-caller-identity
   ```

2. Check if backend resources exist:
   ```bash
   aws s3 ls s3://mirror-dissonance-terraform-state-prod
   aws dynamodb describe-table --table-name mirror-dissonance-terraform-lock-prod --region us-east-1
   ```

3. Re-run backend creation script if resources are missing

### State locking issues

If state is locked and Terraform crashes:
```bash
# Force unlock (use with caution!)
terraform force-unlock <lock-id>
```

### Permission errors

Ensure your AWS credentials have the following permissions:
- S3: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`
- DynamoDB: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:DeleteItem`

## Next Steps

1. Run infrastructure plan: `terraform plan -var-file=staging.tfvars`
2. Apply infrastructure: `terraform apply -var-file=staging.tfvars`
3. Review CloudWatch dashboards and alarms
4. Configure production environment: `terraform workspace new production`

## Scripts Reference

- **create-backend-resources.sh**: Creates S3 bucket and DynamoDB table
- **verify-backend.sh**: Runs 8 comprehensive verification tests
- **test-terraform-init.sh**: Tests Terraform initialization and workspace operations

## Resources

- Terraform S3 Backend: https://www.terraform.io/docs/language/settings/backends/s3.html
- AWS S3 Versioning: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- DynamoDB State Locking: https://www.terraform.io/docs/language/settings/backends/s3.html#dynamodb-state-locking
