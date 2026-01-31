# S3 Bucket and IAM for Drift Detection Baselines
# Day 26: Baseline Storage

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# S3 Bucket for drift detection baselines
resource "aws_s3_bucket" "baselines" {
  bucket = "${local.name_prefix}-baselines"
  
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-baselines"
      Component = "DriftDetection"
    }
  )
}

# Versioning (track baseline history)
resource "aws_s3_bucket_versioning" "baselines" {
  bucket = aws_s3_bucket.baselines.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# KMS Key for S3
resource "aws_kms_key" "s3_encryption" {
  description             = "KMS key for Mirror Dissonance S3 encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  
  tags = merge(
    local.common_tags,
    {
      Name = "${local.name_prefix}-s3-key"
    }
  )
}

resource "aws_kms_alias" "s3_encryption" {
  name          = "alias/${local.name_prefix}-s3"
  target_key_id = aws_kms_key.s3_encryption.key_id
}

# Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "baselines" {
  bucket = aws_s3_bucket.baselines.id
  
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3_encryption.arn
    }
  }
}

# Lifecycle policy (retain baselines for 90 days)
resource "aws_s3_bucket_lifecycle_configuration" "baselines" {
  bucket = aws_s3_bucket.baselines.id
  
  rule {
    id     = "archive-old-baselines"
    status = "Enabled"
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    expiration {
      days = 365
    }
    
    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# IAM Role for GitHub Actions (OIDC)
resource "aws_iam_role" "github_actions_runtime" {
  name = "${local.name_prefix}-github-actions-runtime"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:PhaseMirror/Phase-Mirror:*"
          }
        }
      }
    ]
  })
  
  tags = local.common_tags
}

# Attach policies to GitHub Actions role
resource "aws_iam_role_policy" "github_actions_runtime" {
  name = "baseline-access"
  role = aws_iam_role.github_actions_runtime.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.baselines.arn,
          "${aws_s3_bucket.baselines.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = [
          aws_ssm_parameter.redaction_nonce.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = [
          aws_dynamodb_table.fp_events.arn,
          aws_dynamodb_table.consent.arn,
          aws_dynamodb_table.block_counter.arn,
          "${aws_dynamodb_table.fp_events.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [
          aws_kms_key.dynamodb_encryption.arn,
          aws_kms_key.s3_encryption.arn
        ]
      }
    ]
  })
}

# Bucket policy for GitHub Actions OIDC
resource "aws_s3_bucket_policy" "baselines" {
  bucket = aws_s3_bucket.baselines.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowGitHubActionsRead"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.github_actions_runtime.arn
        }
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.baselines.arn}/*"
      },
      {
        Sid    = "AllowGitHubActionsWrite"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.github_actions_runtime.arn
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.baselines.arn}/*"
      }
    ]
  })
}

# Outputs
output "baseline_bucket_name" {
  description = "S3 bucket for drift baselines"
  value       = aws_s3_bucket.baselines.id
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions"
  value       = aws_iam_role.github_actions_runtime.arn
}
