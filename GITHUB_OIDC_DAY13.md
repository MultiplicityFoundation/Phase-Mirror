# GitHub Actions OIDC Authentication Setup with AWS

This document provides a comprehensive guide for setting up GitHub Actions OIDC authentication with AWS for the Phase Mirror project.

## 0. Pre-flight Setup

```bash
cd Phase-Mirror
git checkout -b infra/github-oidc-setup
```

## 1. OIDC Architecture Overview

### 1.1. What we're building

```text
GitHub Actions Workflow
        ↓
   (OIDC Token)
        ↓
AWS STS AssumeRoleWithWebIdentity
        ↓
   Temporary Credentials
        ↓
Access AWS Resources (DynamoDB, SSM, S3, CloudWatch)
```

### Benefits:

✅ No long-lived AWS credentials in GitHub secrets

✅ Automatic credential rotation

✅ Fine-grained IAM permissions per workflow

✅ Audit trail via CloudTrail

✅ Multi-environment support (staging, production)

## 2. AWS OIDC Provider Setup

### 2.1. Create OIDC provider script

The OIDC provider setup script is located at `scripts/oidc/create-oidc-provider.sh`.

This script:
- Creates a GitHub OIDC provider in AWS
- Checks if provider already exists
- Tags the provider with project metadata

### 2.2. Running the setup

```bash
# Set AWS credentials
export AWS_PROFILE=your-profile
export AWS_REGION=us-east-1

# Run the OIDC provider setup
./scripts/oidc/create-oidc-provider.sh
```

## 3. IAM Roles with OIDC Trust

The Terraform IAM module (`infra/terraform/modules/iam/`) creates two GitHub Actions roles:

### 3.1. GitHub Actions Terraform Role

**Purpose**: Run Terraform operations (plan, apply, destroy)

**Permissions**:
- Terraform state access (S3)
- Terraform locking (DynamoDB)
- DynamoDB table management
- KMS key management
- SSM parameter management
- S3 bucket management
- CloudWatch monitoring setup
- SNS topic management

### 3.2. GitHub Actions Deploy Role

**Purpose**: Deploy and test operations

**Permissions**:
- DynamoDB read/write operations
- SSM parameter read access
- KMS decrypt operations
- S3 baseline access
- CloudWatch metrics and logs

## 4. Terraform Configuration

### 4.1. Module Structure

```
infra/terraform/modules/iam/
├── main.tf       # Role definitions and policies
├── variables.tf  # Input variables
└── outputs.tf    # Role ARNs and names
```

### 4.2. Usage in main configuration

The IAM module is referenced in `infra/terraform/main.tf`:

```hcl
module "iam" {
  source = "./modules/iam"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  github_org   = var.github_org
  github_repo  = var.github_repo

  tags = local.common_tags
}
```

## 5. Deployment Steps

### 5.1. Create OIDC Provider (One-time)

```bash
cd scripts/oidc
./create-oidc-provider.sh
```

### 5.2. Deploy IAM Roles

```bash
cd infra/terraform

# Initialize Terraform
terraform init

# Plan changes
terraform plan -var-file=staging.tfvars

# Apply changes
terraform apply -var-file=staging.tfvars
```

### 5.3. Configure GitHub Secrets

After deployment, note the role ARNs from Terraform outputs:

```bash
terraform output github_terraform_role_arn
terraform output github_deploy_role_arn
```

Add these to GitHub repository settings as variables:
- `AWS_TERRAFORM_ROLE_ARN`
- `AWS_DEPLOY_ROLE_ARN`

## 6. GitHub Actions Workflow Configuration

### 6.1. Example workflow using OIDC

```yaml
name: Deploy to AWS
on:
  push:
    branches: [main]

permissions:
  id-token: write   # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: us-east-1
          
      - name: Deploy application
        run: |
          # Your deployment commands here
          echo "Deploying to AWS..."
```

## 7. Security Considerations

### 7.1. Trust Policy Constraints

Roles are restricted to:
- Specific repository (`repo:PhaseMirror/Phase-Mirror:*`)
- Specific branches (main, develop)
- Pull requests

### 7.2. Session Duration

- Maximum session duration: 1 hour
- Automatic credential rotation

### 7.3. Least Privilege

Each role has minimum required permissions for its specific purpose.

## 8. Troubleshooting

### 8.1. "Not authorized to perform sts:AssumeRoleWithWebIdentity"

Check:
- OIDC provider exists in AWS
- Role trust policy includes correct repository and branch
- GitHub Actions has `id-token: write` permission

### 8.2. "Invalid identity token"

Check:
- Token audience is `sts.amazonaws.com`
- Repository name matches exactly

### 8.3. Permission denied errors

Check:
- Role has necessary IAM policies
- Resource ARNs in policies are correct
- KMS key policies allow role access

## 9. Maintenance

### 9.1. Adding new workflows

Update role trust policies to include new branch names or workflow conditions.

### 9.2. Updating permissions

Modify IAM policies in `modules/iam/main.tf` and re-apply Terraform.

### 9.3. Rotating OIDC thumbprint

If GitHub changes their thumbprint:

```bash
# Update thumbprint in create-oidc-provider.sh
# Re-run the script to update provider
./scripts/oidc/create-oidc-provider.sh
```

## 10. References

- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS IAM OIDC Identity Providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [AWS Configure Credentials Action](https://github.com/aws-actions/configure-aws-credentials)
