# Variables for Phase Mirror FP Calibration Service Infrastructure

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production"
  }
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "aws_region" {
  description = "AWS region for resources (alias for compatibility)"
  type        = string
  default     = "us-east-1"
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = true
}

variable "enable_deletion_protection" {
  description = "Enable deletion protection for DynamoDB tables"
  type        = bool
  default     = true
}

variable "fp_ingestion_lambda_name" {
  description = "Name of the FP Ingestion Lambda function (if deployed)"
  type        = string
  default     = ""
}

variable "nonce_rotation_trigger" {
  description = "Change this value to trigger nonce rotation"
  type        = string
  default     = "v1"
}

variable "ops_sns_topic_arn" {
  description = "SNS topic ARN for operational alerts"
  type        = string
}

variable "fp_store_read_capacity" {
  description = "DynamoDB read capacity units (0 = on-demand)"
  type        = number
  default     = 0
}

variable "fp_store_write_capacity" {
  description = "DynamoDB write capacity units (0 = on-demand)"
  type        = number
  default     = 0
}

variable "enable_pitr" {
  description = "Enable point-in-time recovery for DynamoDB tables"
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 35  # 5 weeks
}

variable "circuit_breaker_threshold" {
  description = "Max blocks per hour before circuit breaker triggers"
  type        = number
  default     = 10
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project   = "MirrorDissonance"
    ManagedBy = "Terraform"
  }
}
