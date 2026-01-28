# CloudWatch Monitoring for Phase Mirror FP Calibration Service
# Based on Phase 3 Infrastructure Deployment (Days 28-29)

# SNS Topics for Alerts
resource "aws_sns_topic" "critical_alerts" {
  name = "phase-mirror-critical-alerts-${var.environment}"
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-critical-alerts-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Critical"
    }
  )
}

resource "aws_sns_topic" "warning_alerts" {
  name = "phase-mirror-warning-alerts-${var.environment}"
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-warning-alerts-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Warning"
    }
  )
}

# Critical Alarm: Consent Check Failures
resource "aws_cloudwatch_metric_alarm" "consent_check_failures" {
  alarm_name          = "phase-mirror-consent-check-failures-critical-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ConsentCheckFailures"
  namespace           = "PhaseMirror/FPCalibration"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Consent store failures prevent FP data collection (fail-closed)"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.critical_alerts.arn]
  
  dimensions = {
    Environment = var.environment
  }
  
  tags = merge(
    var.tags,
    {
      Name      = "consent-check-failures-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Critical"
    }
  )
}

# Critical Alarm: Salt Loading Failures
resource "aws_cloudwatch_metric_alarm" "salt_loading_failures" {
  alarm_name          = "phase-mirror-salt-loading-failures-critical-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "AnonymizationErrors"
  namespace           = "PhaseMirror/FPCalibration"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Cannot load HMAC salt from Secrets Manager"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.critical_alerts.arn]
  
  tags = merge(
    var.tags,
    {
      Name      = "salt-loading-failures-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Critical"
    }
  )
}

# Critical Alarm: DynamoDB Throttling
resource "aws_cloudwatch_metric_alarm" "calibration_store_throttling" {
  alarm_name          = "phase-mirror-calibration-store-throttling-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "DynamoDB throttling on calibration store"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.critical_alerts.arn]
  
  dimensions = {
    TableName = var.calibration_store_table_name
  }
  
  tags = merge(
    var.tags,
    {
      Name      = "calibration-store-throttling-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Critical"
    }
  )
}

# Warning Alarm: High Ingestion Latency
resource "aws_cloudwatch_metric_alarm" "high_ingestion_latency" {
  alarm_name          = "phase-mirror-fp-ingest-latency-warning-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FPIngestLatency"
  namespace           = "PhaseMirror/FPCalibration"
  period              = 900
  statistic           = "Average"
  threshold           = 1000
  alarm_description   = "FP ingestion latency exceeds 1 second"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.warning_alerts.arn]
  
  tags = merge(
    var.tags,
    {
      Name      = "high-ingestion-latency-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Warning"
    }
  )
}

# Warning Alarm: Lambda Errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  count = var.fp_ingestion_lambda_name != "" ? 1 : 0
  
  alarm_name          = "phase-mirror-fp-ingestion-lambda-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Lambda function errors"
  treat_missing_data  = "notBreaching"
  
  alarm_actions = [aws_sns_topic.warning_alerts.arn]
  
  dimensions = {
    FunctionName = var.fp_ingestion_lambda_name
  }
  
  tags = merge(
    var.tags,
    {
      Name      = "fp-ingestion-lambda-errors-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Severity  = "Warning"
    }
  )
}

# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "fp_calibration" {
  dashboard_name = "PhaseMirror-FPCalibration-${var.environment}"
  
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["PhaseMirror/FPCalibration", "FPEventsIngested", { stat = "Sum" }]
          ]
          period = 300
          region = var.aws_region
          title  = "FP Ingestion Volume"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["PhaseMirror/FPCalibration", "ConsentCheckFailures", { stat = "Sum" }]
          ]
          period = 300
          region = var.aws_region
          title  = "Consent Check Failures"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["PhaseMirror/FPCalibration", "AnonymizationErrors", { stat = "Sum" }]
          ]
          period = 300
          region = var.aws_region
          title  = "Anonymization Errors"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["PhaseMirror/FPCalibration", "FPIngestLatency", { stat = "Average" }],
            ["...", { stat = "p99" }]
          ]
          period = 300
          region = var.aws_region
          title  = "Ingestion Latency"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      },
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", { stat = "Sum", dimensions = { TableName = var.calibration_store_table_name } }],
            [".", "ThrottledRequests", { stat = "Sum", dimensions = { TableName = var.calibration_store_table_name } }]
          ]
          period = 300
          region = var.aws_region
          title  = "DynamoDB Performance"
          yAxis = {
            left = {
              min = 0
            }
          }
        }
      }
    ]
  })
}
