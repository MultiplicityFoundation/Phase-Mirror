variable "environment" {
  description = "Environment name (e.g., production, staging, dev)"
  type        = string
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
