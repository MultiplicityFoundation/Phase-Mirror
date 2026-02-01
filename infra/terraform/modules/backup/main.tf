# AWS Backup for DynamoDB Tables

# Backup Vault
resource "aws_backup_vault" "main" {
  name        = "${var.project_name}-${var.environment}-vault"
  kms_key_arn = var.kms_key_arn

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-vault"
    }
  )
}

# Backup Plan
resource "aws_backup_plan" "main" {
  name = "${var.project_name}-${var.environment}-plan"

  # Daily backups retained for 7 days
  rule {
    rule_name         = "DailyBackups"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 * * ? *)" # 5 AM UTC daily

    lifecycle {
      delete_after = 7
    }

    recovery_point_tags = merge(
      var.tags,
      {
        Type = "Daily"
      }
    )
  }

  # Weekly backups retained for 30 days
  rule {
    rule_name         = "WeeklyBackups"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 ? * SUN *)" # 5 AM UTC Sundays

    lifecycle {
      delete_after = 30
    }

    recovery_point_tags = merge(
      var.tags,
      {
        Type = "Weekly"
      }
    )
  }

  # Monthly backups retained for 90 days
  rule {
    rule_name         = "MonthlyBackups"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 1 * ? *)" # 5 AM UTC first of month

    lifecycle {
      delete_after = 90
    }

    recovery_point_tags = merge(
      var.tags,
      {
        Type = "Monthly"
      }
    )
  }

  tags = var.tags
}

# IAM Role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "${var.project_name}-${var.environment}-backup"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "backup_policy" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore_policy" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

# Backup Selection (DynamoDB Tables)
resource "aws_backup_selection" "dynamodb_tables" {
  name         = "${var.project_name}-${var.environment}-dynamodb"
  plan_id      = aws_backup_plan.main.id
  iam_role_arn = aws_iam_role.backup.arn

  resources = var.dynamodb_table_arns

  condition {
    string_equals {
      key   = "aws:ResourceTag/Environment"
      value = var.environment
    }
  }
}

# Backup notifications
resource "aws_sns_topic" "backup_notifications" {
  name              = "${var.project_name}-${var.environment}-backup-notifications"
  kms_master_key_id = var.sns_kms_key_arn

  tags = var.tags
}

resource "aws_sns_topic_subscription" "backup_email" {
  count     = var.notification_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.backup_notifications.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

resource "aws_backup_vault_notifications" "main" {
  backup_vault_name   = aws_backup_vault.main.name
  sns_topic_arn       = aws_sns_topic.backup_notifications.arn
  backup_vault_events = ["BACKUP_JOB_COMPLETED", "RESTORE_JOB_COMPLETED", "BACKUP_JOB_FAILED", "RESTORE_JOB_FAILED"]
}
