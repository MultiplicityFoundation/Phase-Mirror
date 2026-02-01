# DynamoDB Tables for Phase Mirror

# FP Events Table
resource "aws_dynamodb_table" "fp_events" {
  name         = "${var.project_name}-${var.environment}-fp-events"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

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

  # FindingIndex - query by findingId
  global_secondary_index {
    name            = "FindingIndex"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  # TTL for automatic deletion
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Server-side encryption
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-fp-events"
      Purpose     = "FalsePositiveTracking"
      Environment = var.environment
    }
  )
}

# Consent Table
resource "aws_dynamodb_table" "consent" {
  name         = "${var.project_name}-${var.environment}-consent"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "orgId"

  attribute {
    name = "orgId"
    type = "S"
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Server-side encryption
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-consent"
      Purpose     = "ConsentManagement"
      Environment = var.environment
    }
  )
}

# Block Counter Table
resource "aws_dynamodb_table" "block_counter" {
  name         = "${var.project_name}-${var.environment}-block-counter"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bucketKey"

  attribute {
    name = "bucketKey"
    type = "S"
  }

  # TTL for automatic bucket expiration
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = var.enable_pitr
  }

  # Server-side encryption
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-block-counter"
      Purpose     = "CircuitBreakerTracking"
      Environment = var.environment
    }
  )
}
