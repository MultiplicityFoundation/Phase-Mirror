# Outputs for Phase Mirror Infrastructure

# KMS Outputs
output "kms_key_id" {
  description = "KMS key ID"
  value       = module.kms.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = module.kms.key_arn
}

output "kms_alias_name" {
  description = "KMS alias name"
  value       = module.kms.alias_name
}

# DynamoDB Outputs
output "fp_events_table_name" {
  description = "FP Events table name"
  value       = module.dynamodb.fp_events_table_name
}

output "fp_events_table_arn" {
  description = "FP Events table ARN"
  value       = module.dynamodb.fp_events_table_arn
}

output "consent_table_name" {
  description = "Consent table name"
  value       = module.dynamodb.consent_table_name
}

output "consent_table_arn" {
  description = "Consent table ARN"
  value       = module.dynamodb.consent_table_arn
}

output "block_counter_table_name" {
  description = "Block Counter table name"
  value       = module.dynamodb.block_counter_table_name
}

output "block_counter_table_arn" {
  description = "Block Counter table ARN"
  value       = module.dynamodb.block_counter_table_arn
}

output "all_table_names" {
  description = "All DynamoDB table names"
  value       = module.dynamodb.all_table_names
}

# SSM Outputs
output "nonce_parameter_name" {
  description = "SSM parameter name for redaction nonce v1"
  value       = module.ssm.nonce_v1_parameter_name
}

output "nonce_parameter_arn" {
  description = "SSM parameter ARN for redaction nonce v1"
  value       = module.ssm.nonce_v1_parameter_arn
}

output "nonce_parameter_version" {
  description = "SSM parameter version for redaction nonce v1"
  value       = module.ssm.nonce_v1_version
}

# CloudWatch Outputs
output "sns_topic_arn" {
  description = "SNS topic ARN for ops alerts"
  value       = module.cloudwatch.sns_topic_arn
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.cloudwatch.dashboard_name
}

output "dashboard_arn" {
  description = "CloudWatch dashboard ARN"
  value       = module.cloudwatch.dashboard_arn
}

output "alarm_arns" {
  description = "All CloudWatch alarm ARNs"
  value       = module.cloudwatch.alarm_arns
}

# S3 Outputs
output "baselines_bucket_name" {
  description = "S3 bucket name for drift baselines"
  value       = aws_s3_bucket.baselines.id
}

output "baselines_bucket_arn" {
  description = "S3 bucket ARN for drift baselines"
  value       = aws_s3_bucket.baselines.arn
}
