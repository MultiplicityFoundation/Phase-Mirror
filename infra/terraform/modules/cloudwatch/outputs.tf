output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = aws_sns_topic.ops_alerts.arn
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_arn" {
  description = "CloudWatch dashboard ARN"
  value       = aws_cloudwatch_dashboard.main.dashboard_arn
}

output "alarm_arns" {
  description = "All CloudWatch alarm ARNs"
  value = concat(
    [
      aws_cloudwatch_metric_alarm.fp_events_read_throttle.arn,
      aws_cloudwatch_metric_alarm.fp_events_write_throttle.arn,
      aws_cloudwatch_metric_alarm.consent_read_throttle.arn,
      aws_cloudwatch_metric_alarm.consent_write_throttle.arn,
      aws_cloudwatch_metric_alarm.block_counter_read_throttle.arn,
      aws_cloudwatch_metric_alarm.block_counter_write_throttle.arn,
      aws_cloudwatch_metric_alarm.ssm_parameter_failures.arn
    ],
    var.enable_circuit_breaker_alarm ? [aws_cloudwatch_metric_alarm.circuit_breaker_triggers[0].arn] : []
  )
}
