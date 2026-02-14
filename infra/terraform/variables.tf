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

variable "circuit_breaker_threshold" {
  description = "Circuit breaker alarm threshold (count per period)"
  type        = number
  default     = 0
}

variable "github_org" {
  description = "GitHub organization name"
  type        = string
  default     = "MultiplicityFoundation"
}

variable "github_repo" {
  description = "GitHub repository name"
  type        = string
  default     = "Phase-Mirror"
}

variable "audit_log_retention_days" {
  description = "CloudWatch Logs retention for audit logs (days)"
  type        = number
  default     = 90
}

variable "backup_notification_email" {
  description = "Email address for backup notifications"
  type        = string
  default     = ""
}

variable "org_scan_lambda_zip_path" {
  description = "Path to the org-scan Lambda deployment package (zip). Build with: cd infra && pnpm build && zip dist/org-scan-lambda.zip dist/lambda/org-scan/index.js"
  type        = string
  default     = "dist/org-scan-lambda.zip"
}
