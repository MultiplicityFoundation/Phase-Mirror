# Infrastructure-focused CloudWatch dashboard

locals {
  alarm_namespace = "${var.project_name}/${var.environment}"
}

resource "aws_cloudwatch_dashboard" "infrastructure" {
  dashboard_name = "MirrorDissonance-Infrastructure-${var.environment}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type  = "metric"
        x     = 0
        y     = 0
        width = 24
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", module.dynamodb.fp_events_table_name, { stat = "Sum", label = "FP Read" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", module.dynamodb.fp_events_table_name, { stat = "Sum", label = "FP Write" }],
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", module.dynamodb.consent_table_name, { stat = "Sum", label = "Consent Read" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", module.dynamodb.consent_table_name, { stat = "Sum", label = "Consent Write" }],
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", module.dynamodb.block_counter_table_name, { stat = "Sum", label = "Block Read" }],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", module.dynamodb.block_counter_table_name, { stat = "Sum", label = "Block Write" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB Capacity Usage"
        }
      },
      {
        type  = "metric"
        x     = 0
        y     = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "UserErrors", "TableName", module.dynamodb.fp_events_table_name, { stat = "Sum", label = "FP Errors" }],
            ["AWS/DynamoDB", "UserErrors", "TableName", module.dynamodb.consent_table_name, { stat = "Sum", label = "Consent Errors" }],
            ["AWS/DynamoDB", "UserErrors", "TableName", module.dynamodb.block_counter_table_name, { stat = "Sum", label = "Block Errors" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB User Errors"
        }
      },
      {
        type  = "metric"
        x     = 12
        y     = 6
        width = 12
        height = 6
        properties = {
          metrics = [
            ["AWS/DynamoDB", "SystemErrors", "TableName", module.dynamodb.fp_events_table_name, { stat = "Sum", label = "FP Errors" }],
            ["AWS/DynamoDB", "SystemErrors", "TableName", module.dynamodb.consent_table_name, { stat = "Sum", label = "Consent Errors" }],
            ["AWS/DynamoDB", "SystemErrors", "TableName", module.dynamodb.block_counter_table_name, { stat = "Sum", label = "Block Errors" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "DynamoDB System Errors"
        }
      },
      {
        type  = "metric"
        x     = 0
        y     = 12
        width = 12
        height = 6
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
        type  = "metric"
        x     = 12
        y     = 12
        width = 12
        height = 6
        properties = {
          metrics = [
            [local.alarm_namespace, "CircuitBreakerTriggers", { stat = "Sum" }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Circuit Breaker Events"
        }
      },
      {
        type  = "alarm"
        x     = 0
        y     = 18
        width = 24
        height = 6
        properties = {
          title  = "Active Alarms"
          alarms = module.cloudwatch.alarm_arns
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
