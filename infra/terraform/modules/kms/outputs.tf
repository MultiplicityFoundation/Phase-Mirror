output "key_id" {
  description = "KMS key ID"
  value       = aws_kms_key.main.key_id
}

output "key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.main.arn
}

output "alias_arn" {
  description = "KMS alias ARN"
  value       = aws_kms_alias.main.arn
}

output "alias_name" {
  description = "KMS alias name"
  value       = aws_kms_alias.main.name
}

output "cloudwatch_logs_key_id" {
  description = "CloudWatch Logs KMS key ID"
  value       = aws_kms_key.cloudwatch_logs.key_id
}

output "cloudwatch_logs_key_arn" {
  description = "CloudWatch Logs KMS key ARN"
  value       = aws_kms_key.cloudwatch_logs.arn
}

output "sns_key_id" {
  description = "SNS KMS key ID"
  value       = aws_kms_key.sns.key_id
}

output "sns_key_arn" {
  description = "SNS KMS key ARN"
  value       = aws_kms_key.sns.arn
}
