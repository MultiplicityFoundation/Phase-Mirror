output "lambda_function_name" {
  description = "Org-scan Lambda function name"
  value       = aws_lambda_function.org_scan.function_name
}

output "lambda_function_arn" {
  description = "Org-scan Lambda function ARN"
  value       = aws_lambda_function.org_scan.arn
}

output "lambda_role_arn" {
  description = "Org-scan Lambda IAM role ARN"
  value       = aws_iam_role.org_scan_lambda.arn
}

output "schedule_rule_arn" {
  description = "EventBridge schedule rule ARN"
  value       = aws_cloudwatch_event_rule.org_scan_schedule.arn
}

output "log_group_name" {
  description = "CloudWatch Log Group name"
  value       = aws_cloudwatch_log_group.org_scan.name
}
