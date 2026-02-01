# Phase Mirror Infrastructure Modules

This directory contains Terraform modules for deploying Phase Mirror infrastructure.

## Module Overview

### 1. KMS Module (`modules/kms/`)

**Purpose:** Provides encryption key management for all infrastructure resources.

**Resources:**
- KMS encryption key with automatic rotation
- KMS alias for easy reference
- IAM policies for service access

**Outputs:**
- `key_id` - KMS key ID
- `key_arn` - KMS key ARN
- `alias_name` - KMS alias name

**Usage:**
```hcl
module "kms" {
  source = "./modules/kms"
  
  project_name         = "mirror-dissonance"
  environment          = "staging"
  aws_region           = "us-east-1"
  deletion_window_days = 30
}
```

### 2. DynamoDB Module (`modules/dynamodb/`)

**Purpose:** Creates DynamoDB tables for false positive tracking, consent management, and circuit breaker functionality.

**Resources:**
- `fp-events` table - False positive events with FindingIndex GSI
- `consent` table - Organization consent records
- `block-counter` table - Circuit breaker tracking

**Features:**
- Pay-per-request billing mode
- KMS encryption
- Point-in-time recovery (PITR)
- TTL enabled where appropriate

**Outputs:**
- `fp_events_table_name` / `fp_events_table_arn`
- `consent_table_name` / `consent_table_arn`
- `block_counter_table_name` / `block_counter_table_arn`
- `all_table_names` - Array of all table names

**Usage:**
```hcl
module "dynamodb" {
  source = "./modules/dynamodb"
  
  project_name = "mirror-dissonance"
  environment  = "staging"
  enable_pitr  = true
  kms_key_arn  = module.kms.key_arn
}
```

### 3. SSM Module (`modules/ssm/`)

**Purpose:** Manages SSM parameters for redaction nonces.

**Resources:**
- Redaction nonce v1 parameter (64-character hex)
- SecureString with KMS encryption
- Lifecycle management to prevent accidental rotation

**Outputs:**
- `nonce_v1_parameter_name` - SSM parameter name
- `nonce_v1_parameter_arn` - SSM parameter ARN
- `nonce_v1_version` - Parameter version

**Usage:**
```hcl
module "ssm" {
  source = "./modules/ssm"
  
  project_name = "mirror-dissonance"
  environment  = "staging"
  kms_key_id   = module.kms.key_id
}
```

### 4. CloudWatch Module (`modules/cloudwatch/`)

**Purpose:** Provides comprehensive monitoring, alerting, and dashboards.

**Resources:**
- SNS topic for operational alerts
- CloudWatch alarms:
  - DynamoDB read/write throttling
  - SSM parameter access failures
  - Circuit breaker triggers
- CloudWatch dashboard with key metrics

**Features:**
- Optional email subscription to alerts
- Configurable alarm thresholds
- Metric filters for application logs

**Outputs:**
- `sns_topic_arn` - SNS topic for alerts
- `dashboard_name` - Dashboard name
- `alarm_arns` - Array of all alarm ARNs

**Usage:**
```hcl
module "cloudwatch" {
  source = "./modules/cloudwatch"
  
  project_name                 = "mirror-dissonance"
  environment                  = "staging"
  aws_region                   = "us-east-1"
  kms_key_id                   = module.kms.key_id
  alert_email                  = "ops@example.com"
  fp_events_table_name         = module.dynamodb.fp_events_table_name
  consent_table_name           = module.dynamodb.consent_table_name
  block_counter_table_name     = module.dynamodb.block_counter_table_name
  enable_circuit_breaker_alarm = true
}
```

## Module Dependencies

The modules have the following dependency order:

```
1. KMS (no dependencies)
   ├── 2. DynamoDB (depends on KMS)
   ├── 3. SSM (depends on KMS)
   └── 4. CloudWatch (depends on KMS, DynamoDB)
```

## Common Variables

All modules support these common variables:

- `project_name` - Project name prefix (default: "mirror-dissonance")
- `environment` - Environment name (staging, production)
- `tags` - Additional resource tags

## Module Standards

All modules follow these conventions:

1. **Three files:** `main.tf`, `variables.tf`, `outputs.tf`
2. **Variables:** Use sensible defaults where appropriate
3. **Outputs:** Export all important resource attributes
4. **Naming:** Use `${project_name}-${environment}-${resource}` pattern
5. **Tags:** Merge common tags with resource-specific tags
6. **Dependencies:** Use explicit `depends_on` for clarity

## Existing Modules

The following modules existed before this refactoring and are still in use:

- `modules/iam/` - IAM roles and policies for Lambda functions
- `modules/monitoring/` - Legacy monitoring (may be consolidated)
- `modules/secrets/` - Secrets Manager and legacy KMS (may be replaced)

These modules are maintained separately from the new modular infrastructure.

## Testing

To test module changes:

```bash
# Validate syntax
terraform validate

# Format code
terraform fmt -recursive

# Plan changes
terraform plan -var-file=staging.tfvars

# Check specific module
terraform plan -target=module.kms
```

## Version Compatibility

- Terraform >= 1.5.0
- AWS Provider ~> 5.0
- Random Provider ~> 3.5

## Documentation

For deployment instructions, see:
- [STAGING_DEPLOYMENT_DAY16-17.md](../../STAGING_DEPLOYMENT_DAY16-17.md) - Complete deployment guide
- [README.md](./README.md) - Terraform configuration overview
