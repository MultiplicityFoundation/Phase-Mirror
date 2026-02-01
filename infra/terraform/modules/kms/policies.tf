# Enhanced KMS Key Policies

# CloudWatch Logs encryption key
resource "aws_kms_key" "cloudwatch_logs" {
  description             = "${var.project_name} ${var.environment} CloudWatch Logs encryption"
  deletion_window_in_days = var.deletion_window_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:CreateGrant",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:*"
          }
        }
      },
      {
        Sid    = "Deny Unencrypted Operations"
        Effect = "Deny"
        Principal = {
          AWS = "*"
        }
        Action = [
          "kms:Decrypt",
          "kms:ReEncrypt*"
        ]
        Resource = "*"
        Condition = {
          Bool = {
            "kms:BypassPolicyLockoutSafetyCheck" = "true"
          }
        }
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name    = "${var.project_name}-${var.environment}-cloudwatch-key"
      Purpose = "CloudWatchLogsEncryption"
    }
  )
}

resource "aws_kms_alias" "cloudwatch_logs" {
  name          = "alias/${var.project_name}-${var.environment}-cloudwatch"
  target_key_id = aws_kms_key.cloudwatch_logs.key_id
}

# SNS encryption key
resource "aws_kms_key" "sns" {
  description             = "${var.project_name} ${var.environment} SNS encryption"
  deletion_window_in_days = var.deletion_window_days
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow SNS"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow CloudWatch Alarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(
    var.tags,
    {
      Name    = "${var.project_name}-${var.environment}-sns-key"
      Purpose = "SNSEncryption"
    }
  )
}

resource "aws_kms_alias" "sns" {
  name          = "alias/${var.project_name}-${var.environment}-sns"
  target_key_id = aws_kms_key.sns.key_id
}
