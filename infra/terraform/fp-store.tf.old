# FP Events Store - Enhanced DynamoDB Schema for Day 8
# Designed for efficient false positive event tracking with windowed queries

resource "aws_dynamodb_table" "fp_events" {
  name         = "mirror-dissonance-fp-events-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"
  
  hash_key  = "pk"    # rule#{ruleId}
  range_key = "sk"    # event#{timestamp}#{eventId}
  
  attribute {
    name = "pk"
    type = "S"
  }
  
  attribute {
    name = "sk"
    type = "S"
  }
  
  attribute {
    name = "gsi1pk"    # finding#{findingId}
    type = "S"
  }
  
  attribute {
    name = "gsi1sk"    # rule#{ruleId}#{version}
    type = "S"
  }
  
  global_secondary_index {
    name            = "FindingIndex"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }
  
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  
  point_in_time_recovery {
    enabled = true
  }
  
  tags = {
    Project     = "MirrorDissonance"
    Component   = "FPCalibration"
    Environment = var.environment
  }
}
