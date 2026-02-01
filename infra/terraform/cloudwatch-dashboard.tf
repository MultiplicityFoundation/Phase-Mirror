# CloudWatch Dashboard for Mirror Dissonance
# Day 18: Enable Monitoring & Observability
# This dashboard focuses on the core infrastructure (FP Events, Consent, Block Counter)

resource "aws_cloudwatch_dashboard" "mirror_dissonance" {
  dashboard_name = "MirrorDissonance-Infrastructure-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      # FP Store - DynamoDB Capacity
      {
        type = "metric"
        x    = 0
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", { stat = "Sum", label = "Read Capacity" }],
            [".", "ConsumedWriteCapacityUnits", { stat = "Sum", label = "Write Capacity" }],
          ]
          period  = 300
          stat    = "Sum"
          region  = var.aws_region
          title   = "FP Store - DynamoDB Capacity"
          yAxis   = { left = { min = 0 } }
        }
      },

      # DynamoDB User Errors
      {
        type = "metric"
        x    = 12
        y    = 0
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "UserErrors", "TableName", aws_dynamodb_table.fp_events.name, { stat = "Sum" }],
            ["...", aws_dynamodb_table.consent.name, { stat = "Sum" }],
            ["...", aws_dynamodb_table.block_counter.name, { stat = "Sum" }],
          ]
          period  = 300
          stat    = "Sum"
          region  = var.aws_region
          title   = "DynamoDB User Errors"
          yAxis   = { left = { min = 0 } }
        }
      },

      # SSM Parameter Access
      {
        type = "metric"
        x    = 0
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/SSM", "UserErrorCount", "ParameterName", aws_ssm_parameter.redaction_nonce.name, { stat = "Sum" }],
          ]
          period  = 300
          stat    = "Sum"
          region  = var.aws_region
          title   = "Nonce Access Errors"
          yAxis   = { left = { min = 0 } }
        }
      },

      # DynamoDB System Errors
      {
        type = "metric"
        x    = 12
        y    = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "SystemErrors", "TableName", aws_dynamodb_table.fp_events.name, { stat = "Sum" }],
            ["...", aws_dynamodb_table.consent.name, { stat = "Sum" }],
          ]
          period  = 300
          stat    = "Sum"
          region  = var.aws_region
          title   = "DynamoDB System Errors"
          yAxis   = { left = { min = 0 } }
        }
      },

      # FP Events Table - Request Latency
      {
        type = "metric"
        x    = 0
        y    = 12
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", aws_dynamodb_table.fp_events.name, "Operation", "GetItem", { stat = "Average" }],
            ["...", "PutItem", { stat = "Average" }],
            ["...", "Query", { stat = "Average" }],
          ]
          period  = 300
          stat    = "Average"
          region  = var.aws_region
          title   = "FP Events - Request Latency (ms)"
          yAxis   = { left = { min = 0 } }
        }
      },

      # Alarm Status
      {
        type = "alarm"
        x    = 12
        y    = 12
        width = 12
        height = 6
        properties = {
          title  = "Active Alarms"
          alarms = [
            aws_cloudwatch_metric_alarm.ssm_nonce_failures.arn,
            aws_cloudwatch_metric_alarm.fp_store_throttles.arn,
            aws_cloudwatch_metric_alarm.fp_store_system_errors.arn,
            aws_cloudwatch_metric_alarm.fp_store_high_reads.arn,
          ]
        }
      },

      # Circuit Breaker Metric (if log group exists)
      {
        type = "metric"
        x    = 0
        y    = 18
        width = 12
        height = 6
        properties = {
          metrics = [
            ["MirrorDissonance", "CircuitBreakerActivations", { stat = "Sum" }],
          ]
          period  = 3600
          stat    = "Sum"
          region  = var.aws_region
          title   = "Circuit Breaker Activations (per hour)"
          yAxis   = { left = { min = 0 } }
        }
      },

      # Nonce Validation Failures
      {
        type = "metric"
        x    = 12
        y    = 18
        width = 12
        height = 6
        properties = {
          metrics = [
            ["MirrorDissonance", "NonceValidationFailures", { stat = "Sum" }],
          ]
          period  = 300
          stat    = "Sum"
          region  = var.aws_region
          title   = "Nonce Validation Failures"
          yAxis   = { left = { min = 0 } }
        }
      }
    ]
  })

  tags = merge(
    local.common_tags,
    {
      Name      = "mirror-dissonance-${var.environment}-dashboard"
      Component = "Monitoring"
    }
  )
}

# Output the dashboard URL
output "cloudwatch_dashboard_url" {
  description = "URL to CloudWatch dashboard"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.mirror_dissonance.dashboard_name}"
}

output "cloudwatch_dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.mirror_dissonance.dashboard_name
}
