# Phase Mirror FP Calibration Service - Terraform Infrastructure

This directory contains Terraform configurations for deploying the Phase Mirror FP Calibration Service infrastructure on AWS, as specified in Phase 3: Infrastructure Deployment (Days 22-30).

## Structure

```
infra/terraform/
├── main.tf                      # Main Terraform configuration
├── variables.tf                 # Input variables
├── outputs.tf                   # Output values
├── *.tfvars                     # Environment-specific variables
├── terraform.tfvars.example     # Example configuration
└── modules/
    ├── dynamodb/                # DynamoDB tables module
    ├── secrets/                 # Secrets Manager and KMS module
    ├── iam/                     # IAM roles and policies module
    └── monitoring/              # CloudWatch alarms and dashboards module
```

## Infrastructure Components

### DynamoDB Tables
- **Consent Store**: Manages organization consent for FP data collection
- **Calibration Store**: Stores anonymized FP events with k-anonymity enforcement
- **FP Events**: Tracks false positive events (extended from Phase 1)
- **Block Counter**: Legacy table for circuit breaker functionality

### Secrets Management
- **KMS Key**: Customer-managed key for secret encryption (with automatic rotation)
- **HMAC Salt Secret**: Stores salt for organization ID anonymization (rotates monthly)

### IAM Roles
- **FP Ingestion Lambda Role**: Permissions for ingesting FP events
- **Calibration Query Lambda Role**: Permissions for querying calibration data
- **Salt Rotator Lambda Role**: Permissions for rotating HMAC salt

### Monitoring
- **CloudWatch Alarms**: Critical and warning alerts for operational health
- **SNS Topics**: Notification channels for alerts
- **CloudWatch Dashboard**: Operational visibility for FP Calibration Service

## Prerequisites

1. **AWS Account**: With appropriate permissions to create resources
2. **Terraform**: Version >= 1.6 ([Install Guide](https://www.terraform.io/downloads))
3. **AWS CLI**: Configured with credentials ([Setup Guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html))

## Backend Setup (First-Time Only)

Before using Terraform, you must create the backend resources (S3 bucket and DynamoDB table) for state management. This is a one-time setup per AWS account.

### Step 1: Verify AWS Configuration

```bash
# Verify AWS CLI is configured
aws sts get-caller-identity

# Verify you have admin permissions (or sufficient IAM rights)
aws iam get-user

# Set environment variables
export AWS_REGION=us-east-1
export ENV=staging  # Start with staging
```

### Step 2: Bootstrap Terraform Backend

Run the bootstrap script to create the S3 bucket and DynamoDB table:

```bash
# From the repository root
./scripts/bootstrap-terraform-backend.sh
```

This script will:
- Create S3 bucket: `mirror-dissonance-terraform-state-prod`
- Enable versioning, encryption, and block public access
- Create DynamoDB table: `terraform-state-lock` for state locking
- Wait for resources to be available

### Step 3: Bootstrap SSM Nonce

The application requires a nonce parameter in SSM Parameter Store. Bootstrap it before running Terraform:

```bash
# For staging environment
./scripts/bootstrap-nonce.sh staging

# For production environment
./scripts/bootstrap-nonce.sh production
```

**⚠️ IMPORTANT**: Save the generated nonce value in a secure location (e.g., password manager). You'll need it for rotation operations.

### Step 4: Create Terraform Workspaces

```bash
cd infra/terraform

# Initialize with backend
terraform init

# Create staging workspace
terraform workspace new staging
terraform workspace select staging

# Later, create production workspace
terraform workspace new production
```

## Quick Start

### 1. Initialize Terraform

```bash
cd infra/terraform
terraform init
```

### 2. Configure Variables

Copy the example variables file and customize:

```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
```

Or use environment-specific files:
- `staging.tfvars` - Staging environment
- `production.tfvars` - Production environment

### 3. Validate Configuration

```bash
# Run validation script
../../scripts/terraform-validate.sh

# Or manually
terraform validate
terraform fmt -check -recursive
```

### 4. Plan Changes

```bash
# Using script (staging by default)
../../scripts/terraform-plan.sh staging

# Or manually
terraform plan -var-file=staging.tfvars -out=tfplan
```

### 5. Apply Changes

```bash
# Using script
../../scripts/terraform-apply.sh staging

# Or manually
terraform apply -var-file=staging.tfvars
```

## Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `aws_region` | AWS region for resources | `us-east-1` | No |
| `environment` | Environment name | `production` | No |
| `enable_point_in_time_recovery` | Enable PITR for DynamoDB | `true` | No |
| `enable_deletion_protection` | Enable deletion protection | `true` | No |
| `fp_ingestion_lambda_name` | FP Ingestion Lambda name | `""` | No |

## Outputs

After applying, Terraform will output:

- DynamoDB table names and ARNs
- Secrets Manager secret names
- IAM role ARNs
- SNS topic ARNs for alerts
- CloudWatch dashboard name

View outputs:
```bash
terraform output
```

## State Management

### Remote State with S3 Backend (Configured)

Terraform state is managed using an S3 backend with DynamoDB for state locking. The backend is configured in `backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "mirror-dissonance-terraform-state-prod"
    key            = "phase-mirror/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

The backend must be bootstrapped before first use (see [Backend Setup](#backend-setup-first-time-only) above).

### Workspace-Based State Isolation

Use Terraform workspaces to manage multiple environments:

```bash
# List workspaces
terraform workspace list

# Select workspace
terraform workspace select staging

# Show current workspace
terraform workspace show
```

Each workspace maintains its own state file in the S3 bucket.

## Deployment Workflow

### Staging Deployment
1. Validate configuration: `./scripts/terraform-validate.sh`
2. Generate plan: `./scripts/terraform-plan.sh staging`
3. Review plan output carefully
4. Apply changes: `./scripts/terraform-apply.sh staging`

### Production Deployment
1. Test in staging first
2. Generate plan: `./scripts/terraform-plan.sh production`
3. Review plan with team
4. Apply changes: `./scripts/terraform-apply.sh production`
5. Verify deployment with smoke tests

## Cost Estimate

Estimated monthly costs for AWS infrastructure:
- DynamoDB (on-demand): ~$75/month
- Secrets Manager: ~$0.50/month
- KMS: ~$1/month
- Lambda (if deployed): ~$15/month
- CloudWatch: ~$16/month
- SNS: <$1/month

**Total**: ~$108/month

Costs may vary based on actual usage. Enable AWS Cost Explorer for accurate tracking.

## Security Considerations

### Encryption
- All DynamoDB tables support encryption at rest (AWS-managed keys by default)
- Secrets Manager uses customer-managed KMS key with automatic rotation
- Point-in-time recovery enabled for data protection

### IAM
- All roles follow least-privilege principle
- Policies are scoped to specific resources
- KMS key policies restrict secret access via Secrets Manager

### Deletion Protection
- Enabled by default for production DynamoDB tables
- Can be disabled in staging for easier cleanup
- Use `enable_deletion_protection = false` in tfvars

## Troubleshooting

### Terraform Init Fails
```bash
# Clear cache and reinitialize
rm -rf .terraform .terraform.lock.hcl
terraform init
```

### Plan Shows Unexpected Changes
```bash
# Refresh state
terraform refresh -var-file=staging.tfvars

# Show current state
terraform show
```

### Apply Fails
```bash
# Check AWS credentials
aws sts get-caller-identity

# Check IAM permissions
aws iam get-user
```

### Destroy Infrastructure
```bash
# WARNING: This will delete all resources!
terraform destroy -var-file=staging.tfvars
```

## Maintenance

### Updating Modules
```bash
terraform get -update
terraform init -upgrade
```

### Formatting Code
```bash
terraform fmt -recursive
```

### State Operations
```bash
# List resources
terraform state list

# Show resource details
terraform state show module.dynamodb.aws_dynamodb_table.consent_store

# Remove resource from state (advanced)
terraform state rm module.dynamodb.aws_dynamodb_table.consent_store
```

## CI/CD Integration

### GitHub Actions OIDC Setup

The infrastructure includes GitHub Actions integration via OpenID Connect (OIDC), eliminating the need for long-lived AWS credentials.

#### Resources Created

1. **OIDC Provider**: Enables GitHub Actions to authenticate with AWS
2. **Deploy Role**: `mirror-dissonance-github-actions-deploy-{environment}` for infrastructure deployments
3. **Runtime Role**: `mirror-dissonance-github-actions-runtime-{environment}` for application runtime operations

#### Setup Instructions

After deploying the infrastructure:

```bash
# Get the deployment role ARN
terraform output github_actions_deploy_role_arn
```

Add the role ARN to your GitHub repository secrets:
- Secret name: `AWS_DEPLOY_ROLE_ARN`
- Secret value: The ARN from terraform output

#### Usage in GitHub Actions

```yaml
- name: Configure AWS Credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
    aws-region: us-east-1
```

For detailed examples, see [docs/ops/terraform-deployment-guide.md](../../docs/ops/terraform-deployment-guide.md).

## Documentation

- [Phase 3 Infrastructure Deployment](../../docs/Phase%203:%20Infrastructure%20Deployment%20(Days%2022-30).md) - Complete infrastructure specifications
- [Terraform Deployment Guide](../../docs/ops/terraform-deployment-guide.md) - Detailed deployment procedures
- [Architecture Documentation](../../docs/architecture.md) - System architecture and design decisions

## Support

For issues or questions:
1. Check the [Known Issues](../../docs/known-issues.md)
2. Review Phase 3 documentation
3. Open an issue in the repository

## License

Apache License 2.0 - See [LICENSE](../../LICENSE) for details.
