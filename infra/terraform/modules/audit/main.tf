# CloudTrail and AWS Config for Audit & Compliance

# S3 Bucket for CloudTrail Logs
resource "aws_s3_bucket" "cloudtrail" {
  bucket = "${var.project_name}-${var.environment}-cloudtrail"

  tags = merge(
    var.tags,
    {
      Name    = "${var.project_name}-${var.environment}-cloudtrail"
      Purpose = "AuditLogs"
    }
  )
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  rule {
    id     = "ExpireOldLogs"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  bucket = aws_s3_bucket.cloudtrail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AWSCloudTrailAclCheck"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:GetBucketAcl"
        Resource = aws_s3_bucket.cloudtrail.arn
      },
      {
        Sid    = "AWSCloudTrailWrite"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Sid    = "DenyUnencryptedObjectUploads"
        Effect = "Deny"
        Principal = {
          AWS = "*"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.cloudtrail.arn}/*"
        Condition = {
          StringNotEquals = {
            "s3:x-amz-server-side-encryption" = "aws:kms"
          }
        }
      }
    ]
  })
}

# CloudTrail
resource "aws_cloudtrail" "main" {
  name                          = "${var.project_name}-${var.environment}"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = var.kms_key_arn
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail_cloudwatch.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    # Data event monitoring is optional - only configure if ARN lists are provided
    # If both lists are empty, only management events will be logged
    dynamic "data_resource" {
      for_each = length(var.dynamodb_table_arns) > 0 ? [1] : []
      content {
        type   = "AWS::DynamoDB::Table"
        values = var.dynamodb_table_arns
      }
    }

    dynamic "data_resource" {
      for_each = length(var.s3_bucket_arns) > 0 ? [1] : []
      content {
        type   = "AWS::S3::Object"
        values = var.s3_bucket_arns
      }
    }
  }

  insight_selector {
    insight_type = "ApiCallRateInsight"
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-trail"
    }
  )

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}

# CloudWatch Log Group for CloudTrail
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${var.project_name}-${var.environment}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.cloudwatch_kms_key_arn

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-cloudtrail-logs"
    }
  )
}

# IAM Role for CloudTrail to CloudWatch Logs
resource "aws_iam_role" "cloudtrail_cloudwatch" {
  name = "${var.project_name}-${var.environment}-cloudtrail-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "cloudtrail_cloudwatch" {
  name = "CloudWatchLogsPolicy"
  role = aws_iam_role.cloudtrail_cloudwatch.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
      }
    ]
  })
}

# Metric Filters for Security Events

# Unauthorized API calls
resource "aws_cloudwatch_log_metric_filter" "unauthorized_api_calls" {
  name           = "${var.project_name}-${var.environment}-unauthorized-api-calls"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }"

  metric_transformation {
    name      = "UnauthorizedAPICalls"
    namespace = "${var.project_name}/${var.environment}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "unauthorized_api_calls" {
  alarm_name          = "${var.project_name}-${var.environment}-unauthorized-api-calls"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "UnauthorizedAPICalls"
  namespace           = "${var.project_name}/${var.environment}/Security"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Multiple unauthorized API calls detected"
  alarm_actions       = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# Root account usage
resource "aws_cloudwatch_log_metric_filter" "root_account_usage" {
  name           = "${var.project_name}-${var.environment}-root-account-usage"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"

  metric_transformation {
    name      = "RootAccountUsage"
    namespace = "${var.project_name}/${var.environment}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "root_account_usage" {
  alarm_name          = "${var.project_name}-${var.environment}-root-account-usage"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "RootAccountUsage"
  namespace           = "${var.project_name}/${var.environment}/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Root account usage detected - immediate investigation required"
  alarm_actions       = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# IAM policy changes
resource "aws_cloudwatch_log_metric_filter" "iam_policy_changes" {
  name           = "${var.project_name}-${var.environment}-iam-policy-changes"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{($.eventName=DeleteGroupPolicy)||($.eventName=DeleteRolePolicy)||($.eventName=DeleteUserPolicy)||($.eventName=PutGroupPolicy)||($.eventName=PutRolePolicy)||($.eventName=PutUserPolicy)||($.eventName=CreatePolicy)||($.eventName=DeletePolicy)||($.eventName=CreatePolicyVersion)||($.eventName=DeletePolicyVersion)||($.eventName=AttachRolePolicy)||($.eventName=DetachRolePolicy)||($.eventName=AttachUserPolicy)||($.eventName=DetachUserPolicy)||($.eventName=AttachGroupPolicy)||($.eventName=DetachGroupPolicy)}"

  metric_transformation {
    name      = "IAMPolicyChanges"
    namespace = "${var.project_name}/${var.environment}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "iam_policy_changes" {
  alarm_name          = "${var.project_name}-${var.environment}-iam-policy-changes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "IAMPolicyChanges"
  namespace           = "${var.project_name}/${var.environment}/Security"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "IAM policy changes detected"
  alarm_actions       = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}

# KMS key deletion or disable
resource "aws_cloudwatch_log_metric_filter" "kms_key_changes" {
  name           = "${var.project_name}-${var.environment}-kms-key-changes"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{($.eventName=DisableKey)||($.eventName=ScheduleKeyDeletion)}"

  metric_transformation {
    name      = "KMSKeyChanges"
    namespace = "${var.project_name}/${var.environment}/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "kms_key_changes" {
  alarm_name          = "${var.project_name}-${var.environment}-kms-key-changes"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "KMSKeyChanges"
  namespace           = "${var.project_name}/${var.environment}/Security"
  period              = 60
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "KMS key deletion or disable detected - critical alert"
  alarm_actions       = [var.sns_topic_arn]
  treat_missing_data  = "notBreaching"

  tags = var.tags
}
