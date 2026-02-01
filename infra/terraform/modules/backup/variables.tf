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
  description = "KMS key ARN for backup encryption"
  type        = string
}

variable "sns_kms_key_arn" {
  description = "KMS key ARN for SNS encryption"
  type        = string
}

variable "dynamodb_table_arns" {
  description = "DynamoDB table ARNs to back up"
  type        = list(string)
}

variable "notification_email" {
  description = "Email for backup notifications"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
