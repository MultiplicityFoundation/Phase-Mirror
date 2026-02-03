# Phase Mirror DynamoDB Tables with GSI Configuration
# AWS Adapter Infrastructure

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# False Positive Events Table
resource "aws_dynamodb_table" "fp_events" {
  name           = "phase-mirror-fp-events"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "findingId"
    type = "S"
  }

  attribute {
    name = "orgId"
    type = "S"
  }

  attribute {
    name = "repoId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # GSI for finding lookup
  global_secondary_index {
    name            = "FindingIndex"
    hash_key        = "findingId"
    projection_type = "ALL"
  }

  # GSI for organization-based queries with time range
  global_secondary_index {
    name            = "OrgIdCreatedAtIndex"
    hash_key        = "orgId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  # GSI for repository-based queries with time range
  global_secondary_index {
    name            = "RepoIdCreatedAtIndex"
    hash_key        = "repoId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }

  tags = {
    Name        = "Phase Mirror FP Events"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Consent Store Table
resource "aws_dynamodb_table" "consents" {
  name         = "phase-mirror-consents"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "Phase Mirror Consents"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Block Counter Table (Circuit Breaker)
resource "aws_dynamodb_table" "block_counter" {
  name         = "phase-mirror-block-counter"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bucketKey"

  attribute {
    name = "bucketKey"
    type = "S"
  }

  # Enable TTL for automatic expiration
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = {
    Name        = "Phase Mirror Block Counter"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Calibration Store Table
resource "aws_dynamodb_table" "calibration" {
  name         = "phase-mirror-calibration"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = {
    Name        = "Phase Mirror Calibration"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# S3 Bucket for Baselines
resource "aws_s3_bucket" "baselines" {
  bucket = "phase-mirror-baselines-${var.environment}"

  tags = {
    Name        = "Phase Mirror Baselines"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Enable versioning for baselines
resource "aws_s3_bucket_versioning" "baselines" {
  bucket = aws_s3_bucket.baselines.id

  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket for Reports
resource "aws_s3_bucket" "reports" {
  bucket = "phase-mirror-reports-${var.environment}"

  tags = {
    Name        = "Phase Mirror Reports"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Variables
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
}

# Outputs
output "fp_events_table_name" {
  value       = aws_dynamodb_table.fp_events.name
  description = "FP Events DynamoDB table name"
}

output "consents_table_name" {
  value       = aws_dynamodb_table.consents.name
  description = "Consents DynamoDB table name"
}

output "block_counter_table_name" {
  value       = aws_dynamodb_table.block_counter.name
  description = "Block Counter DynamoDB table name"
}

output "calibration_table_name" {
  value       = aws_dynamodb_table.calibration.name
  description = "Calibration DynamoDB table name"
}

output "baselines_bucket_name" {
  value       = aws_s3_bucket.baselines.bucket
  description = "Baselines S3 bucket name"
}

output "reports_bucket_name" {
  value       = aws_s3_bucket.reports.bucket
  description = "Reports S3 bucket name"
}
