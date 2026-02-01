variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "mirror-dissonance"
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "enable_pitr" {
  description = "Enable Point-in-Time Recovery for DynamoDB"
  type        = bool
  default     = true
}

variable "kms_deletion_window_days" {
  description = "KMS key deletion window (days)"
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Email address for CloudWatch alerts"
  type        = string
  default     = ""
}

variable "enable_circuit_breaker_alarm" {
  description = "Enable circuit breaker CloudWatch alarm"
  type        = bool
  default     = true
}

variable "github_org" {
  description = "GitHub organization name"
  type        = string
  default     = "PhaseMirror"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "Phase-Mirror"
}
