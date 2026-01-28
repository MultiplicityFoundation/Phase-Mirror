variable "environment" {
  description = "Environment name (e.g., production, staging, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "consent_store_table_arn" {
  description = "ARN of the consent store DynamoDB table"
  type        = string
}

variable "calibration_store_table_arn" {
  description = "ARN of the calibration store DynamoDB table"
  type        = string
}

variable "calibration_store_gsi_arn" {
  description = "ARN of the calibration store rule-index GSI"
  type        = string
}

variable "hmac_salt_secret_arn" {
  description = "ARN of the HMAC salt secret"
  type        = string
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for secrets encryption"
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
