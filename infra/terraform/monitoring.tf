# CloudWatch Alarms and Monitoring for Mirror Dissonance
# Day 25: SSM & DynamoDB Monitoring

# SNS Topic for Ops Alerts (if not already created)
resource "aws_sns_topic" "ops_alerts" {
  name = "${local.name_prefix}-ops-alerts"
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-ops-alerts"
    }
  )
}

resource "aws_sns_topic_subscription" "ops_email" {
  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = var.ops_email_address
}

# SSM GetParameter Failures
resource "aws_cloudwatch_metric_alarm" "ssm_nonce_failures" {
  alarm_name          = "${local.name_prefix}-ssm-nonce-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UserErrorCount"
  namespace           = "AWS/SSM"
  period              = 300  # 5 minutes
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "SSM GetParameter failures for redaction nonce (5+ failures in 10 min)"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    ParameterName = aws_ssm_parameter.redaction_nonce.name
  }
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
  ok_actions    = [aws_sns_topic.ops_alerts.arn]
}

# DynamoDB FP Store Throttling
resource "aws_cloudwatch_metric_alarm" "fp_store_throttles" {
  alarm_name          = "${local.name_prefix}-fp-store-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UserErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "FP store experiencing throttling (10+ errors in 10 min)"
  
  dimensions = {
    TableName = aws_dynamodb_table.fp_events.name
  }
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# DynamoDB System Errors
resource "aws_cloudwatch_metric_alarm" "fp_store_system_errors" {
  alarm_name          = "${local.name_prefix}-fp-store-system-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "FP store system errors detected"
  
  dimensions = {
    TableName = aws_dynamodb_table.fp_events.name
  }
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# High Consumed Read Capacity (cost monitoring)
resource "aws_cloudwatch_metric_alarm" "fp_store_high_reads" {
  alarm_name          = "${local.name_prefix}-fp-store-high-reads"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ConsumedReadCapacityUnits"
  namespace           = "AWS/DynamoDB"
  period              = 3600  # 1 hour
  statistic           = "Sum"
  threshold           = 10000  # 10K RCUs/hour
  alarm_description   = "FP store consuming high read capacity (cost alert)"
  treat_missing_data  = "notBreaching"
  
  dimensions = {
    TableName = aws_dynamodb_table.fp_events.name
  }
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# Circuit Breaker Activation Rate
resource "aws_cloudwatch_log_metric_filter" "circuit_breaker_activations" {
  name           = "${local.name_prefix}-circuit-breaker-activations"
  log_group_name = "/aws/lambda/mirror-dissonance-oracle"  # Adjust based on deployment
  
  pattern = "[time, request_id, level=ERROR, msg=\"Circuit breaker triggered*\"]"
  
  metric_transformation {
    name      = "CircuitBreakerActivations"
    namespace = "MirrorDissonance"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "circuit_breaker_frequent" {
  alarm_name          = "${local.name_prefix}-circuit-breaker-frequent"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CircuitBreakerActivations"
  namespace           = "MirrorDissonance"
  period              = 3600  # 1 hour
  statistic           = "Sum"
  threshold           = 3
  alarm_description   = "Circuit breaker activated 3+ times in 1 hour"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# Nonce Validation Failures
resource "aws_cloudwatch_log_metric_filter" "nonce_validation_failures" {
  name           = "${local.name_prefix}-nonce-validation-failures"
  log_group_name = "/aws/lambda/mirror-dissonance-oracle"
  
  pattern = "[time, request_id, level=ERROR, msg=\"*nonce validation failed*\"]"
  
  metric_transformation {
    name      = "NonceValidationFailures"
    namespace = "MirrorDissonance"
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "nonce_validation_failures" {
  alarm_name          = "${local.name_prefix}-nonce-validation-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NonceValidationFailures"
  namespace           = "MirrorDissonance"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Nonce validation failures detected (possible rotation issue)"
  
  alarm_actions = [aws_sns_topic.ops_alerts.arn]
}

# Outputs
output "ops_alerts_topic_arn" {
  description = "SNS topic ARN for operational alerts"
  value       = aws_sns_topic.ops_alerts.arn
}
