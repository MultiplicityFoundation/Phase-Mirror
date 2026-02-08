# CloudWatch Alarms for Phase Mirror

locals {
  alarm_namespace = "${var.project_name}/${var.environment}"
}

# SNS Topic for alerts
resource "aws_sns_topic" "ops_alerts" {
  name              = "${var.project_name}-${var.environment}-ops-alerts"
  kms_master_key_id = var.kms_key_id

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-ops-alerts"
      Environment = var.environment
    }
  )
}

resource "aws_sns_topic_subscription" "ops_alerts_email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.ops_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# DynamoDB Alarms - FP Events Table

resource "aws_cloudwatch_metric_alarm" "fp_events_read_throttle" {
  alarm_name          = "${var.project_name}-${var.environment}-fp-events-read-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "FP Events table experiencing read throttling"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]

  dimensions = {
    TableName = var.fp_events_table_name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "fp_events_write_throttle" {
  alarm_name          = "${var.project_name}-${var.environment}-fp-events-write-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "WriteThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "FP Events table experiencing write throttling"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]

  dimensions = {
    TableName = var.fp_events_table_name
  }

  tags = var.tags
}

# SSM Parameter Access Alarm

resource "aws_cloudwatch_log_metric_filter" "ssm_parameter_failures" {
  name           = "${var.project_name}-${var.environment}-ssm-failures"
  log_group_name = "/aws/ssm/${var.environment}"
  pattern        = "[time, request_id, event_type=GetParameter, status_code=4*, ...]"

  metric_transformation {
    name      = "SSMParameterFailures"
    namespace = local.alarm_namespace
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "ssm_parameter_failures" {
  alarm_name          = "${var.project_name}-${var.environment}-ssm-parameter-failures"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SSMParameterFailures"
  namespace           = local.alarm_namespace
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Multiple SSM parameter access failures detected"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# Circuit Breaker Trigger Alarm

resource "aws_cloudwatch_log_metric_filter" "circuit_breaker_triggers" {
  count          = var.enable_circuit_breaker_alarm ? 1 : 0
  name           = "${var.project_name}-${var.environment}-circuit-breaker"
  log_group_name = var.application_log_group
  pattern        = "[time, level=ERROR, message=\"Circuit breaker triggered*\"]"

  metric_transformation {
    name      = "CircuitBreakerTriggers"
    namespace = local.alarm_namespace
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "circuit_breaker_triggers" {
  count               = var.enable_circuit_breaker_alarm ? 1 : 0
  alarm_name          = "${var.project_name}-${var.environment}-circuit-breaker-triggered"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "CircuitBreakerTriggers"
  namespace           = local.alarm_namespace
  period              = 300
  statistic           = "Sum"
  threshold           = var.circuit_breaker_threshold
  alarm_description   = "Circuit breaker has been triggered"
  alarm_actions       = [aws_sns_topic.ops_alerts.arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# CloudWatch Dashboard

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.project_name}-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", { stat = "Sum", label = "FP Events Read" }],
            [".", "ConsumedWriteCapacityUnits", { stat = "Sum", label = "FP Events Write" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB Capacity Usage"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ReadThrottleEvents", { stat = "Sum", label = "Read Throttles" }],
            [".", "WriteThrottleEvents", { stat = "Sum", label = "Write Throttles" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB Throttling"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            [local.alarm_namespace, "SSMParameterFailures", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "SSM Parameter Failures"
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            [local.alarm_namespace, "CircuitBreakerTriggers", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Circuit Breaker Events"
        }
      }
    ]
  })
}
