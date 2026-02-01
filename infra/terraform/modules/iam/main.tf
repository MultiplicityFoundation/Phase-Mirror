# IAM Roles for GitHub Actions OIDC

data "aws_caller_identity" "current" {}

locals {
  github_org  = var.github_org
  github_repo = var.github_repo
  account_id  = data.aws_caller_identity.current.account_id
  oidc_provider_arn = "arn:aws:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

# GitHub Actions Role - Terraform Operations
resource "aws_iam_role" "github_actions_terraform" {
  name        = "${var.project_name}-${var.environment}-github-terraform"
  description = "Role for GitHub Actions to run Terraform"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:${local.github_org}/${local.github_repo}:ref:refs/heads/main",
              "repo:${local.github_org}/${local.github_repo}:ref:refs/heads/develop",
              "repo:${local.github_org}/${local.github_repo}:pull_request"
            ]
          }
        }
      }
    ]
  })

  max_session_duration = 3600 # 1 hour

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-github-terraform"
      Purpose     = "GitHubActionsTerraform"
      Environment = var.environment
    }
  )
}

# Policy for Terraform operations
resource "aws_iam_role_policy" "github_terraform_policy" {
  name = "TerraformOperations"
  role = aws_iam_role.github_actions_terraform.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "TerraformStateAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::mirror-dissonance-terraform-state-prod",
          "arn:aws:s3:::mirror-dissonance-terraform-state-prod/*"
        ]
      },
      {
        Sid    = "TerraformLocking"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = "arn:aws:dynamodb:*:${local.account_id}:table/mirror-dissonance-terraform-lock-prod"
      },
      {
        Sid    = "DynamoDBManagement"
        Effect = "Allow"
        Action = [
          "dynamodb:CreateTable",
          "dynamodb:DeleteTable",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:UpdateTable",
          "dynamodb:UpdateContinuousBackups",
          "dynamodb:UpdateTimeToLive",
          "dynamodb:TagResource",
          "dynamodb:UntagResource",
          "dynamodb:ListTagsOfResource"
        ]
        Resource = "arn:aws:dynamodb:*:${local.account_id}:table/${var.project_name}-${var.environment}-*"
      },
      {
        Sid    = "KMSManagement"
        Effect = "Allow"
        Action = [
          "kms:CreateKey",
          "kms:CreateAlias",
          "kms:DeleteAlias",
          "kms:DescribeKey",
          "kms:GetKeyPolicy",
          "kms:GetKeyRotationStatus",
          "kms:ListAliases",
          "kms:ListResourceTags",
          "kms:PutKeyPolicy",
          "kms:TagResource",
          "kms:UntagResource",
          "kms:EnableKeyRotation",
          "kms:ScheduleKeyDeletion"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = var.aws_region
          }
        }
      },
      {
        Sid    = "SSMManagement"
        Effect = "Allow"
        Action = [
          "ssm:PutParameter",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:DeleteParameter",
          "ssm:DescribeParameters",
          "ssm:AddTagsToResource",
          "ssm:RemoveTagsFromResource",
          "ssm:ListTagsForResource"
        ]
        Resource = "arn:aws:ssm:*:${local.account_id}:parameter/guardian/${var.environment}/*"
      },
      {
        Sid    = "S3Management"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:GetBucketVersioning",
          "s3:PutBucketVersioning",
          "s3:GetEncryptionConfiguration",
          "s3:PutEncryptionConfiguration",
          "s3:GetBucketPublicAccessBlock",
          "s3:PutBucketPublicAccessBlock",
          "s3:GetBucketTagging",
          "s3:PutBucketTagging",
          "s3:ListBucket"
        ]
        Resource = "arn:aws:s3:::${var.project_name}-${var.environment}-*"
      },
      {
        Sid    = "CloudWatchManagement"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricAlarm",
          "cloudwatch:DeleteAlarms",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:PutDashboard",
          "cloudwatch:DeleteDashboards",
          "cloudwatch:GetDashboard",
          "cloudwatch:ListDashboards",
          "logs:CreateLogGroup",
          "logs:DeleteLogGroup",
          "logs:DescribeLogGroups",
          "logs:PutMetricFilter",
          "logs:DeleteMetricFilter",
          "logs:DescribeMetricFilters",
          "logs:TagLogGroup",
          "logs:UntagLogGroup"
        ]
        Resource = "*"
      },
      {
        Sid    = "SNSManagement"
        Effect = "Allow"
        Action = [
          "sns:CreateTopic",
          "sns:DeleteTopic",
          "sns:GetTopicAttributes",
          "sns:SetTopicAttributes",
          "sns:Subscribe",
          "sns:Unsubscribe",
          "sns:TagResource",
          "sns:UntagResource"
        ]
        Resource = "arn:aws:sns:*:${local.account_id}:${var.project_name}-${var.environment}-*"
      },
      {
        Sid    = "IAMReadOnly"
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies"
        ]
        Resource = "*"
      }
    ]
  })
}

# GitHub Actions Role - Test/Deploy Operations
resource "aws_iam_role" "github_actions_deploy" {
  name        = "${var.project_name}-${var.environment}-github-deploy"
  description = "Role for GitHub Actions to deploy and test"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = local.oidc_provider_arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = [
              "repo:${local.github_org}/${local.github_repo}:ref:refs/heads/main",
              "repo:${local.github_org}/${local.github_repo}:ref:refs/heads/develop",
              "repo:${local.github_org}/${local.github_repo}:pull_request"
            ]
          }
        }
      }
    ]
  })

  max_session_duration = 3600

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-github-deploy"
      Purpose     = "GitHubActionsDeploy"
      Environment = var.environment
    }
  )
}

# Policy for deployment/testing
resource "aws_iam_role_policy" "github_deploy_policy" {
  name = "DeployOperations"
  role = aws_iam_role.github_actions_deploy.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DescribeTable"
        ]
        Resource = [
          "arn:aws:dynamodb:*:${local.account_id}:table/${var.project_name}-${var.environment}-*",
          "arn:aws:dynamodb:*:${local.account_id}:table/${var.project_name}-${var.environment}-*/index/*"
        ]
      },
      {
        Sid    = "SSMAccess"
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:aws:ssm:*:${local.account_id}:parameter/guardian/${var.environment}/*"
      },
      {
        Sid    = "KMSDecrypt"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = [
              "dynamodb.${var.aws_region}.amazonaws.com",
              "ssm.${var.aws_region}.amazonaws.com"
            ]
          }
        }
      },
      {
        Sid    = "S3BaselineAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.project_name}-${var.environment}-baselines",
          "arn:aws:s3:::${var.project_name}-${var.environment}-baselines/*"
        ]
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "${var.project_name}/${var.environment}"
          }
        }
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:${local.account_id}:log-group:/aws/github-actions/${var.project_name}-${var.environment}*"
      }
    ]
  })
}
