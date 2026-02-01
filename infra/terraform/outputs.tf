# Outputs for Phase Mirror Infrastructure

output "environment" {
  description = "Deployed environment"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

# KMS Outputs
output "kms_key_id" {
  description = "KMS key ID"
  value       = module.kms.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = module.kms.key_arn
  sensitive   = true
}

# DynamoDB Outputs
output "fp_events_table_name" {
  description = "FP Events table name"
  value       = module.dynamodb.fp_events_table_name
}

output "consent_table_name" {
  description = "Consent table name"
  value       = module.dynamodb.consent_table_name
}

output "block_counter_table_name" {
  description = "Block Counter table name"
  value       = module.dynamodb.block_counter_table_name
}

output "all_dynamodb_tables" {
  description = "All DynamoDB table names"
  value       = module.dynamodb.all_table_names
}

# SSM Outputs
output "nonce_parameter_name" {
  description = "Redaction nonce parameter name"
  value       = module.ssm.nonce_v1_parameter_name
}

output "nonce_parameter_arn" {
  description = "Redaction nonce parameter ARN"
  value       = module.ssm.nonce_v1_parameter_arn
  sensitive   = true
}

# CloudWatch Outputs
output "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  value       = module.cloudwatch.sns_topic_arn
}

output "dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.cloudwatch.dashboard_name
}

output "dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${module.cloudwatch.dashboard_name}"
}

# S3 Outputs
output "baselines_bucket_name" {
  description = "Drift baselines S3 bucket name"
  value       = aws_s3_bucket.baselines.bucket
}

output "baselines_bucket_arn" {
  description = "Drift baselines S3 bucket ARN"
  value       = aws_s3_bucket.baselines.arn
}

# Configuration Summary
output "configuration_summary" {
  description = "Configuration summary for application"
  value = {
    region                   = var.aws_region
    environment              = var.environment
    fp_events_table          = module.dynamodb.fp_events_table_name
    consent_table            = module.dynamodb.consent_table_name
    block_counter_table      = module.dynamodb.block_counter_table_name
    nonce_parameter          = module.ssm.nonce_v1_parameter_name
    baselines_bucket         = aws_s3_bucket.baselines.bucket
    cloudwatch_dashboard_url = "https://console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${module.cloudwatch.dashboard_name}"
  }
}

# IAM Outputs
output "github_terraform_role_arn" {
  description = "GitHub Actions Terraform role ARN"
  value       = module.iam.terraform_role_arn
}

output "github_deploy_role_arn" {
  description = "GitHub Actions deploy role ARN"
  value       = module.iam.deploy_role_arn
}

# Audit Outputs
output "cloudtrail_name" {
  description = "CloudTrail name"
  value       = module.audit.cloudtrail_name
}

output "cloudtrail_bucket_name" {
  description = "CloudTrail S3 bucket name"
  value       = module.audit.cloudtrail_bucket_name
}

output "security_alarm_arns" {
  description = "Security alarm ARNs"
  value       = module.audit.security_alarm_arns
}

# Backup Outputs
output "backup_vault_name" {
  description = "Backup vault name"
  value       = module.backup.backup_vault_name
}

output "backup_plan_id" {
  description = "Backup plan ID"
  value       = module.backup.backup_plan_id
}
