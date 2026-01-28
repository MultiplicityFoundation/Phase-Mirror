# Outputs for Phase Mirror FP Calibration Service Infrastructure

# DynamoDB Outputs
output "consent_store_table_name" {
  description = "Name of the consent store DynamoDB table"
  value       = module.dynamodb.consent_store_table_name
}

output "calibration_store_table_name" {
  description = "Name of the calibration store DynamoDB table"
  value       = module.dynamodb.calibration_store_table_name
}

output "fp_events_table_name" {
  description = "Name of the FP events DynamoDB table"
  value       = module.dynamodb.fp_events_table_name
}

# Secrets Outputs
output "hmac_salt_secret_name" {
  description = "Name of the HMAC salt secret in Secrets Manager"
  value       = module.secrets.hmac_salt_secret_name
}

output "kms_key_arn" {
  description = "ARN of the KMS key for secrets encryption"
  value       = module.secrets.kms_key_arn
}

# IAM Outputs
output "fp_ingestion_lambda_role_arn" {
  description = "ARN of the FP Ingestion Lambda role"
  value       = module.iam.fp_ingestion_lambda_role_arn
}

output "calibration_query_lambda_role_arn" {
  description = "ARN of the Calibration Query Lambda role"
  value       = module.iam.calibration_query_lambda_role_arn
}

output "salt_rotator_lambda_role_arn" {
  description = "ARN of the Salt Rotator Lambda role"
  value       = module.iam.salt_rotator_lambda_role_arn
}

# Monitoring Outputs
output "critical_alerts_topic_arn" {
  description = "ARN of the critical alerts SNS topic"
  value       = module.monitoring.critical_alerts_topic_arn
}

output "warning_alerts_topic_arn" {
  description = "ARN of the warning alerts SNS topic"
  value       = module.monitoring.warning_alerts_topic_arn
}

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = module.monitoring.dashboard_name
}

# Legacy Outputs
output "block_counter_table_name" {
  description = "Name of the block counter DynamoDB table"
  value       = aws_dynamodb_table.block_counter.name
}

output "redaction_nonce_parameter_name" {
  description = "Name of the SSM parameter for redaction nonce"
  value       = aws_ssm_parameter.redaction_nonce.name
}
