# DynamoDB Tables for Phase Mirror FP Calibration Service
# Based on Phase 3 Infrastructure Deployment (Days 22-24)

# Consent Store Table
resource "aws_dynamodb_table" "consent_store" {
  name           = "phase-mirror-consent-store-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "orgId"
  
  attribute {
    name = "orgId"
    type = "S"
  }
  
  ttl {
    enabled        = true
    attribute_name = "expiresAt"
  }
  
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }
  
  deletion_protection_enabled = var.enable_deletion_protection
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-consent-store-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Table     = "ConsentStore"
    }
  )
}

# Calibration Store Table
resource "aws_dynamodb_table" "calibration_store" {
  name           = "phase-mirror-calibration-store-${var.environment}"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"
  
  attribute {
    name = "id"
    type = "S"
  }
  
  attribute {
    name = "ruleId"
    type = "S"
  }
  
  global_secondary_index {
    name            = "rule-index"
    hash_key        = "ruleId"
    projection_type = "ALL"
  }
  
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }
  
  deletion_protection_enabled = var.enable_deletion_protection
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-calibration-store-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Table     = "CalibrationStore"
    }
  )
}

# FP Events Table (updated from Phase 1 with Phase 2 extensions)
resource "aws_dynamodb_table" "fp_events" {
  name           = "phase-mirror-fp-events-${var.environment}"
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
  
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }
  
  deletion_protection_enabled = var.enable_deletion_protection
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-fp-events-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Table     = "FPEvents"
    }
  )
}
