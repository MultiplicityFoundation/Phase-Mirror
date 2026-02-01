output "nonce_v1_parameter_name" {
  description = "Nonce v1 parameter name"
  value       = aws_ssm_parameter.redaction_nonce_v1.name
}

output "nonce_v1_parameter_arn" {
  description = "Nonce v1 parameter ARN"
  value       = aws_ssm_parameter.redaction_nonce_v1.arn
}

output "nonce_v1_version" {
  description = "Nonce v1 parameter version"
  value       = aws_ssm_parameter.redaction_nonce_v1.version
}
