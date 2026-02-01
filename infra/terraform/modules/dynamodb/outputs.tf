output "fp_events_table_name" {
  description = "FP Events table name"
  value       = aws_dynamodb_table.fp_events.name
}

output "fp_events_table_arn" {
  description = "FP Events table ARN"
  value       = aws_dynamodb_table.fp_events.arn
}

output "consent_table_name" {
  description = "Consent table name"
  value       = aws_dynamodb_table.consent.name
}

output "consent_table_arn" {
  description = "Consent table ARN"
  value       = aws_dynamodb_table.consent.arn
}

output "block_counter_table_name" {
  description = "Block Counter table name"
  value       = aws_dynamodb_table.block_counter.name
}

output "block_counter_table_arn" {
  description = "Block Counter table ARN"
  value       = aws_dynamodb_table.block_counter.arn
}

output "all_table_names" {
  description = "All DynamoDB table names"
  value = [
    aws_dynamodb_table.fp_events.name,
    aws_dynamodb_table.consent.name,
    aws_dynamodb_table.block_counter.name
  ]
}
