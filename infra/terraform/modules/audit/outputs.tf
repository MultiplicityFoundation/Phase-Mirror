output "cloudtrail_name" {
  description = "CloudTrail name"
  value       = aws_cloudtrail.main.name
}

output "cloudtrail_arn" {
  description = "CloudTrail ARN"
  value       = aws_cloudtrail.main.arn
}

output "cloudtrail_bucket_name" {
  description = "CloudTrail S3 bucket name"
  value       = aws_s3_bucket.cloudtrail.bucket
}

output "cloudtrail_log_group_name" {
  description = "CloudTrail CloudWatch log group name"
  value       = aws_cloudwatch_log_group.cloudtrail.name
}

output "security_alarm_arns" {
  description = "Security alarm ARNs"
  value = [
    aws_cloudwatch_metric_alarm.unauthorized_api_calls.arn,
    aws_cloudwatch_metric_alarm.root_account_usage.arn,
    aws_cloudwatch_metric_alarm.iam_policy_changes.arn,
    aws_cloudwatch_metric_alarm.kms_key_changes.arn
  ]
}
