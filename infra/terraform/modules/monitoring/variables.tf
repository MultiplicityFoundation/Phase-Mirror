variable "environment" {
  description = "Environment name (e.g., production, staging, dev)"
  type        = string
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "calibration_store_table_name" {
  description = "Name of the calibration store DynamoDB table"
  type        = string
}

variable "fp_ingestion_lambda_name" {
  description = "Name of the FP Ingestion Lambda function (optional)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
