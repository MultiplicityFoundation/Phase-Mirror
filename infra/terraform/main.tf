# Phase Mirror FP Calibration Service Infrastructure
# Terraform configuration for Phase 3 AWS resources

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  
  # Backend configuration for state management
  # Uncomment and configure for production use
  # backend "s3" {
  #   bucket         = "phase-mirror-terraform-state"
  #   key            = "fp-calibration/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "phase-mirror-terraform-locks"
  # }
}

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

# Local variables
locals {
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

# Legacy resources (from existing main.tf)
# These are maintained for backward compatibility

# DynamoDB table for block counter with TTL
resource "aws_dynamodb_table" "block_counter" {
  name         = "mirror-dissonance-block-counter-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bucketKey"
  range_key    = "ruleId"
  
  attribute {
    name = "bucketKey"
    type = "S"
  }
  
  attribute {
    name = "ruleId"
    type = "S"
  }
  
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  tags = merge(
    local.tags,
    {
      Name = "mirror-dissonance-block-counter-${var.environment}"
    }
  )
}

# SSM parameter for redaction nonce
resource "aws_ssm_parameter" "redaction_nonce" {
  name  = "/guardian/redaction_nonce-${var.environment}"
  type  = "SecureString"
  value = "placeholder-will-be-set-manually"
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = merge(
    local.tags,
    {
      Name = "mirror-dissonance-redaction-nonce-${var.environment}"
    }
  )
}
