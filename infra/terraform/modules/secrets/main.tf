# AWS Secrets Manager and KMS for Phase Mirror FP Calibration Service
# Based on Phase 3 Infrastructure Deployment (Days 25-26)

terraform {
  required_providers {
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# KMS key for encrypting secrets
resource "aws_kms_key" "phase_mirror_secrets" {
  description             = "KMS key for Phase Mirror FP Calibration secrets encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-secrets-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Purpose   = "SecretsEncryption"
    }
  )
}

# KMS key alias for easier reference
resource "aws_kms_alias" "phase_mirror_secrets" {
  name          = "alias/phase-mirror-secrets-${var.environment}"
  target_key_id = aws_kms_key.phase_mirror_secrets.key_id
}

# Generate random password for initial HMAC salt
resource "random_password" "hmac_salt" {
  length  = 32
  special = true
}

# Secrets Manager secret for HMAC salt
resource "aws_secretsmanager_secret" "hmac_salt" {
  name        = "/phase-mirror/fp-calibration/hmac-salt-${var.environment}"
  description = "HMAC salt for organization ID anonymization (rotates monthly)"
  kms_key_id  = aws_kms_key.phase_mirror_secrets.arn
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-hmac-salt-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Rotation  = "Monthly"
    }
  )
}

# Initial secret version with generated salt
resource "aws_secretsmanager_secret_version" "hmac_salt_initial" {
  secret_id = aws_secretsmanager_secret.hmac_salt.id
  secret_string = jsonencode({
    salt           = random_password.hmac_salt.result
    rotationMonth  = formatdate("YYYY-MM", timestamp())
    rotatedAt      = timestamp()
  })
  
  lifecycle {
    ignore_changes = [secret_string]
  }
}
