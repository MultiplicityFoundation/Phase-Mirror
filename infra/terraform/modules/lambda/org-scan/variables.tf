variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "mirror-dissonance"
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "lambda_zip_path" {
  description = "Path to the bundled Lambda deployment package (zip)"
  type        = string
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 300
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 256
}

variable "github_orgs" {
  description = "Comma-separated list of GitHub org logins to scan"
  type        = string
}

variable "governance_cache_table_name" {
  description = "Name of the DynamoDB governance cache table"
  type        = string
}

variable "governance_cache_table_arn" {
  description = "ARN of the DynamoDB governance cache table"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for DynamoDB + Secrets Manager encryption"
  type        = string
}

variable "github_token_secret_arn" {
  description = "ARN of Secrets Manager secret containing the GitHub App token. Leave empty to skip Secrets Manager policy."
  type        = string
  default     = ""
}

variable "schedule_expression" {
  description = "EventBridge schedule expression (e.g. 'rate(1 hour)' or 'cron(17 * * * ? *)')"
  type        = string
  default     = "rate(1 hour)"
}

variable "schedule_enabled" {
  description = "Whether the EventBridge schedule is enabled"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

variable "alert_sns_topic_arn" {
  description = "SNS topic ARN for Lambda error alarms. Leave empty to skip alarm creation."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
