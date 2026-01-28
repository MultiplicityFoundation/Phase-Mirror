# Mirror Dissonance Protocol Infrastructure
# Terraform configuration for AWS resources

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (e.g., production, staging)"
  type        = string
  default     = "production"
}

# DynamoDB table for false positive tracking
resource "aws_dynamodb_table" "fp_events" {
  name           = "mirror-dissonance-fp-events"
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
    name = "ruleId"
    type = "S"
  }
  
  # Global secondary index for finding-based queries
  global_secondary_index {
    name            = "finding-index"
    hash_key        = "findingId"
    projection_type = "ALL"
  }
  
  # Global secondary index for rule-based queries
  global_secondary_index {
    name            = "rule-index"
    hash_key        = "ruleId"
    projection_type = "ALL"
  }
  
  tags = {
    Name        = "mirror-dissonance-fp-events"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# DynamoDB table for block counter with TTL
resource "aws_dynamodb_table" "block_counter" {
  name           = "mirror-dissonance-block-counter"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "bucketKey"
  range_key      = "ruleId"
  
  attribute {
    name = "bucketKey"
    type = "S"
  }
  
  attribute {
    name = "ruleId"
    type = "S"
  }
  
  # TTL configuration for automatic cleanup
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }
  
  tags = {
    Name        = "mirror-dissonance-block-counter"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# SSM parameter for redaction nonce
resource "aws_ssm_parameter" "redaction_nonce" {
  name  = "/guardian/redaction_nonce"
  type  = "SecureString"
  value = "placeholder-will-be-set-manually"
  
  lifecycle {
    ignore_changes = [value]
  }
  
  tags = {
    Name        = "mirror-dissonance-redaction-nonce"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# CloudWatch alarm for SSM GetParameter failures
resource "aws_cloudwatch_metric_alarm" "ssm_get_parameter_errors" {
  alarm_name          = "mirror-dissonance-ssm-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/SSM"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Alert when SSM GetParameter fails for redaction nonce"
  
  dimensions = {
    ParameterName = aws_ssm_parameter.redaction_nonce.name
  }
  
  tags = {
    Name        = "mirror-dissonance-ssm-errors"
    Environment = var.environment
  }
}

# CloudWatch alarm for high block rate (circuit breaker)
resource "aws_cloudwatch_metric_alarm" "high_block_rate" {
  alarm_name          = "mirror-dissonance-high-block-rate"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "BlockCount"
  namespace           = "MirrorDissonance"
  period              = "3600"
  statistic           = "Sum"
  threshold           = "100"
  alarm_description   = "Alert when block rate exceeds circuit breaker threshold"
  
  tags = {
    Name        = "mirror-dissonance-high-block-rate"
    Environment = var.environment
  }
}

# Outputs
output "fp_events_table_name" {
  value       = aws_dynamodb_table.fp_events.name
  description = "Name of the false positive events DynamoDB table"
}

output "block_counter_table_name" {
  value       = aws_dynamodb_table.block_counter.name
  description = "Name of the block counter DynamoDB table"
}

output "redaction_nonce_parameter_name" {
  value       = aws_ssm_parameter.redaction_nonce.name
  description = "Name of the SSM parameter for redaction nonce"
}
