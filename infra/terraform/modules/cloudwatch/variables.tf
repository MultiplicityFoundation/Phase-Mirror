variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "mirror-dissonance"
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
}

variable "kms_key_id" {
  description = "KMS key ID for SNS encryption"
  type        = string
}

variable "alert_email" {
  description = "Email address for alerts"
  type        = string
  default     = ""
}

variable "fp_events_table_name" {
  description = "FP Events table name for alarms"
  type        = string
}

variable "consent_table_name" {
  description = "Consent table name for alarms"
  type        = string
}

variable "block_counter_table_name" {
  description = "Block Counter table name for alarms"
  type        = string
}

variable "application_log_group" {
  description = "Application log group name"
  type        = string
  default     = "/aws/application/mirror-dissonance"
}

variable "enable_circuit_breaker_alarm" {
  description = "Enable circuit breaker alarm"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
