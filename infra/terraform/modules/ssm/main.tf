# SSM Parameters for Phase Mirror

# Generate initial nonce (64 hex characters)
resource "random_id" "nonce_v1" {
  byte_length = 32 # 32 bytes = 64 hex chars
}

resource "aws_ssm_parameter" "redaction_nonce_v1" {
  name        = "/guardian/${var.environment}/redaction_nonce_v1"
  description = "Redaction nonce version 1 for ${var.environment}"
  type        = "SecureString"
  value       = random_id.nonce_v1.hex
  key_id      = var.kms_key_id

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-nonce-v1"
      Purpose     = "RedactionNonce"
      Version     = "1"
      Environment = var.environment
    }
  )

  lifecycle {
    ignore_changes = [value] # Don't update nonce on subsequent applies
  }
}

# Placeholder for v2 (created during rotation)
# Uncomment when rotating:
# resource "random_id" "nonce_v2" {
#   byte_length = 32
# }
#
# resource "aws_ssm_parameter" "redaction_nonce_v2" {
#   name        = "/guardian/${var.environment}/redaction_nonce_v2"
#   description = "Redaction nonce version 2 for ${var.environment}"
#   type        = "SecureString"
#   value       = random_id.nonce_v2.hex
#   key_id      = var.kms_key_id
#   
#   tags = merge(
#     var.tags,
#     {
#       Name        = "${var.project_name}-${var.environment}-nonce-v2"
#       Purpose     = "RedactionNonce"
#       Version     = "2"
#       Environment = var.environment
#     }
#   )
# }
