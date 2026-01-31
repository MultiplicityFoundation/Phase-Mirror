# Phase Mirror FP Calibration Service Infrastructure
# Terraform configuration for Phase 3 AWS resources

provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      ManagedBy   = "Terraform"
      Environment = var.environment
      Project     = "PhaseMirror"
    }
  }
}

# Local values for resource naming
locals {
  name_prefix = "mirror-dissonance-${var.environment}"
  
  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      Region      = var.region
    }
  )
  
  tags = {
    Environment = var.environment
    ManagedBy   = "Terraform"
    Project     = "PhaseMirror"
    Component   = "FPCalibration"
  }
}

# DynamoDB Tables Module
module "dynamodb" {
  source = "./modules/dynamodb"
  
  environment                   = var.environment
  enable_point_in_time_recovery = var.enable_point_in_time_recovery
  enable_deletion_protection    = var.enable_deletion_protection
  tags                          = local.tags
}

# Secrets Manager and KMS Module
module "secrets" {
  source = "./modules/secrets"
  
  environment = var.environment
  tags        = local.tags
}

# IAM Roles and Policies Module
module "iam" {
  source = "./modules/iam"
  
  environment                  = var.environment
  aws_region                   = var.aws_region
  consent_store_table_arn      = module.dynamodb.consent_store_table_arn
  calibration_store_table_arn  = module.dynamodb.calibration_store_table_arn
  calibration_store_gsi_arn    = module.dynamodb.calibration_store_gsi_arn
  hmac_salt_secret_arn         = module.secrets.hmac_salt_secret_arn
  kms_key_arn                  = module.secrets.kms_key_arn
  tags                         = local.tags
}

# CloudWatch Monitoring Module
module "monitoring" {
  source = "./modules/monitoring"
  
  environment                   = var.environment
  aws_region                    = var.aws_region
  calibration_store_table_name  = module.dynamodb.calibration_store_table_name
  fp_ingestion_lambda_name      = var.fp_ingestion_lambda_name
  tags                          = local.tags
}

# ============================================================================
# PRODUCTION-READY RESOURCES (Phase 3 - Days 22-24)
# ============================================================================

# KMS Key for DynamoDB encryption
resource "aws_kms_key" "dynamodb_encryption" {
  description             = "KMS key for Mirror Dissonance DynamoDB encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-dynamodb-key"
    }
  )
}

resource "aws_kms_alias" "dynamodb_encryption" {
  name          = "alias/${local.name_prefix}-dynamodb"
  target_key_id = aws_kms_key.dynamodb_encryption.key_id
}

# FP Events Table
resource "aws_dynamodb_table" "fp_events" {
  name         = "${local.name_prefix}-fp-events"
  billing_mode = var.fp_store_read_capacity == 0 ? "PAY_PER_REQUEST" : "PROVISIONED"
  
  # Provisioned mode settings (if enabled)
  read_capacity  = var.fp_store_read_capacity > 0 ? var.fp_store_read_capacity : null
  write_capacity = var.fp_store_write_capacity > 0 ? var.fp_store_write_capacity : null
  
  hash_key  = "pk"
  range_key = "sk"
  
  attribute {
    name = "pk"
    type = "S"
  }
  
  attribute {
    name = "sk"
    type = "S"
  }
  
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  
  attribute {
    name = "gsi1sk"
    type = "S"
  }
  
  global_secondary_index {
    name            = "FindingIndex"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
    
    # GSI capacity (on-demand inherits table mode)
    read_capacity  = var.fp_store_read_capacity > 0 ? var.fp_store_read_capacity : null
    write_capacity = var.fp_store_write_capacity > 0 ? var.fp_store_write_capacity : null
  }
  
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  
  point_in_time_recovery {
    enabled = var.enable_pitr
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.dynamodb_encryption.arn
  }
  
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-fp-events"
      Component = "FPCalibration"
    }
  )
  
  lifecycle {
    prevent_destroy = true  # Safety: prevent accidental deletion
  }
}

# Consent Table
resource "aws_dynamodb_table" "consent" {
  name         = "${local.name_prefix}-consent"
  billing_mode = "PAY_PER_REQUEST"
  
  hash_key = "orgId"
  
  attribute {
    name = "orgId"
    type = "S"
  }
  
  point_in_time_recovery {
    enabled = var.enable_pitr
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.dynamodb_encryption.arn
  }
  
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-consent"
      Component = "ConsentManagement"
    }
  )
  
  lifecycle {
    prevent_destroy = true
  }
}

# Block Counter Table
resource "aws_dynamodb_table" "block_counter" {
  name         = "${local.name_prefix}-block-counter"
  billing_mode = "PAY_PER_REQUEST"
  
  hash_key = "bucketKey"
  
  attribute {
    name = "bucketKey"
    type = "S"
  }
  
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  
  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.dynamodb_encryption.arn
  }
  
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-block-counter"
      Component = "CircuitBreaker"
    }
  )
}

# SSM Parameter for Nonce (bootstrap - value set manually first)
resource "random_uuid" "redaction_nonce_v1" {
  keepers = {
    rotation_trigger = var.nonce_rotation_trigger
  }
}

resource "aws_ssm_parameter" "redaction_nonce" {
  name        = "/guardian/${var.environment}/redaction_nonce_v1"
  description = "HMAC nonce for RedactedText validation - ${var.environment}"
  type        = "SecureString"
  value       = random_uuid.redaction_nonce_v1.result
  
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-redaction-nonce"
      Component = "Redaction"
      Version   = "1"
    }
  )
  
  lifecycle {
    ignore_changes = [value]  # Prevent unintended rotation
  }
}

# Outputs
output "fp_events_table_name" {
  description = "FP Events table name"
  value       = aws_dynamodb_table.fp_events.name
}

output "consent_table_name" {
  description = "Consent table name"
  value       = aws_dynamodb_table.consent.name
}

output "block_counter_table_name" {
  description = "Block Counter table name"
  value       = aws_dynamodb_table.block_counter.name
}

output "nonce_parameter_name" {
  description = "SSM parameter name for redaction nonce"
  value       = aws_ssm_parameter.redaction_nonce.name
}

output "kms_key_arn" {
  description = "KMS key ARN for DynamoDB encryption"
  value       = aws_kms_key.dynamodb_encryption.arn
}
