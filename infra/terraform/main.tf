# Phase Mirror Infrastructure - Main Configuration

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "MirrorDissonance"
      ManagedBy   = "Terraform"
      Environment = var.environment
      Workspace   = terraform.workspace
    }
  }
}

locals {
  common_tags = {
    Project     = "MirrorDissonance"
    Environment = var.environment
    Workspace   = terraform.workspace
  }
}

# KMS Key (create first)
module "kms" {
  source = "./modules/kms"

  project_name         = var.project_name
  environment          = var.environment
  aws_region           = var.aws_region
  deletion_window_days = var.kms_deletion_window_days

  tags = local.common_tags
}

# DynamoDB Tables
module "dynamodb" {
  source = "./modules/dynamodb"

  project_name = var.project_name
  environment  = var.environment
  enable_pitr  = var.enable_pitr
  kms_key_arn  = module.kms.key_arn

  tags = local.common_tags

  depends_on = [module.kms]
}

# SSM Parameters
module "ssm" {
  source = "./modules/ssm"

  project_name = var.project_name
  environment  = var.environment
  kms_key_id   = module.kms.key_id

  tags = local.common_tags

  depends_on = [module.kms]
}

# CloudWatch Monitoring
module "cloudwatch" {
  source = "./modules/cloudwatch"

  project_name                 = var.project_name
  environment                  = var.environment
  aws_region                   = var.aws_region
  kms_key_id                   = module.kms.key_id
  alert_email                  = var.alert_email
  fp_events_table_name         = module.dynamodb.fp_events_table_name
  consent_table_name           = module.dynamodb.consent_table_name
  block_counter_table_name     = module.dynamodb.block_counter_table_name
  enable_circuit_breaker_alarm = var.enable_circuit_breaker_alarm

  tags = local.common_tags

  depends_on = [module.dynamodb]
}

# S3 Bucket for Drift Baselines
resource "aws_s3_bucket" "baselines" {
  bucket = "${var.project_name}-${var.environment}-baselines"

  tags = merge(
    local.common_tags,
    {
      Name    = "${var.project_name}-${var.environment}-baselines"
      Purpose = "DriftBaselines"
    }
  )
}

resource "aws_s3_bucket_versioning" "baselines" {
  bucket = aws_s3_bucket.baselines.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "baselines" {
  bucket = aws_s3_bucket.baselines.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = module.kms.key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "baselines" {
  bucket = aws_s3_bucket.baselines.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
