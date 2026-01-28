output "kms_key_id" {
  description = "ID of the KMS key for secrets encryption"
  value       = aws_kms_key.phase_mirror_secrets.key_id
}

output "kms_key_arn" {
  description = "ARN of the KMS key for secrets encryption"
  value       = aws_kms_key.phase_mirror_secrets.arn
}

output "kms_key_alias" {
  description = "Alias of the KMS key"
  value       = aws_kms_alias.phase_mirror_secrets.name
}

output "hmac_salt_secret_name" {
  description = "Name of the HMAC salt secret"
  value       = aws_secretsmanager_secret.hmac_salt.name
}

output "hmac_salt_secret_arn" {
  description = "ARN of the HMAC salt secret"
  value       = aws_secretsmanager_secret.hmac_salt.arn
}
