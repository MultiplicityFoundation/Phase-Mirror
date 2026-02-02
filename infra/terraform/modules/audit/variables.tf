variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "mirror-dissonance"
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for CloudTrail encryption"
  type        = string
}

variable "cloudwatch_kms_key_arn" {
  description = "KMS key ARN for CloudWatch Logs encryption"
  type        = string
}

variable "sns_topic_arn" {
  description = "SNS topic ARN for alerts"
  type        = string
}

variable "dynamodb_table_arns" {
  description = "DynamoDB table ARNs to monitor"
  type        = list(string)
  default     = []
}

variable "s3_bucket_arns" {
  description = "S3 bucket ARNs to monitor"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention (days)"
  type        = number
  default     = 90
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
