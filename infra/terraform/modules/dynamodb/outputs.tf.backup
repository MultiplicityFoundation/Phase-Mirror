output "consent_store_table_name" {
  description = "Name of the consent store DynamoDB table"
  value       = aws_dynamodb_table.consent_store.name
}

output "consent_store_table_arn" {
  description = "ARN of the consent store DynamoDB table"
  value       = aws_dynamodb_table.consent_store.arn
}

output "calibration_store_table_name" {
  description = "Name of the calibration store DynamoDB table"
  value       = aws_dynamodb_table.calibration_store.name
}

output "calibration_store_table_arn" {
  description = "ARN of the calibration store DynamoDB table"
  value       = aws_dynamodb_table.calibration_store.arn
}

output "calibration_store_gsi_arn" {
  description = "ARN of the calibration store rule-index GSI"
  value       = "${aws_dynamodb_table.calibration_store.arn}/index/rule-index"
}

output "fp_events_table_name" {
  description = "Name of the FP events DynamoDB table"
  value       = aws_dynamodb_table.fp_events.name
}

output "fp_events_table_arn" {
  description = "ARN of the FP events DynamoDB table"
  value       = aws_dynamodb_table.fp_events.arn
}
