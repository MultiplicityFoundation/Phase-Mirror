variable "project_name" {
  description = "Project name prefix"
  type        = string
  default     = "mirror-dissonance"
}

variable "environment" {
  description = "Environment (staging, production)"
  type        = string
}

variable "enable_pitr" {
  description = "Enable Point-in-Time Recovery"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
