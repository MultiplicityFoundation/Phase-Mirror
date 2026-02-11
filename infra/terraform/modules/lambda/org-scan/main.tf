# Lambda Module: Org-Scan
#
# Deploys the org-scan Lambda function with EventBridge hourly schedule.
# This function refreshes RepoGovernanceState[] in DynamoDB so MD-101
# can analyze a recent snapshot without hitting GitHub's API at query time.
#
# Central tension: This is the "central cron" approach — operationally
# simpler than the GitHub Action path because the Lambda runs close to
# DynamoDB with no OIDC plumbing.

# ─── Lambda Function ─────────────────────────────────────────────────

resource "aws_lambda_function" "org_scan" {
  function_name = "${var.project_name}-${var.environment}-org-scan"
  description   = "Scheduled org governance scanner for Phase Mirror federation"
  role          = aws_iam_role.org_scan_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  filename      = var.lambda_zip_path
  timeout       = var.lambda_timeout
  memory_size   = var.lambda_memory_size

  source_code_hash = filebase64sha256(var.lambda_zip_path)

  environment {
    variables = {
      MD_ORGS                   = var.github_orgs
      MD_GOVERNANCE_CACHE_TABLE = var.governance_cache_table_name
      NODE_OPTIONS              = "--enable-source-maps"
    }
  }

  # GitHub token stored in Secrets Manager; Lambda reads it at runtime.
  # We do NOT put credentials in environment variables visible in the
  # Terraform state or CloudWatch logs.

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-org-scan"
      Purpose     = "OrgGovernanceScan"
      Component   = "Federation"
      Environment = var.environment
    }
  )
}

# ─── IAM Role ─────────────────────────────────────────────────────────

resource "aws_iam_role" "org_scan_lambda" {
  name               = "${var.project_name}-${var.environment}-org-scan-lambda"
  description        = "Execution role for the org-scan Lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-org-scan-lambda"
      Purpose     = "OrgScanLambdaRole"
      Environment = var.environment
    }
  )
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ─── IAM Policies ────────────────────────────────────────────────────

resource "aws_iam_role_policy" "org_scan_dynamodb" {
  name   = "DynamoDBGovernanceCache"
  role   = aws_iam_role.org_scan_lambda.id
  policy = data.aws_iam_policy_document.org_scan_dynamodb_policy.json
}

data "aws_iam_policy_document" "org_scan_dynamodb_policy" {
  statement {
    sid    = "GovernanceCacheReadWrite"
    effect = "Allow"
    actions = [
      "dynamodb:BatchWriteItem",
      "dynamodb:PutItem",
      "dynamodb:Query",
      "dynamodb:DescribeTable",
    ]
    resources = [var.governance_cache_table_arn]
  }
}

# Secrets Manager access for GitHub token
resource "aws_iam_role_policy" "org_scan_secrets" {
  count  = var.github_token_secret_arn != "" ? 1 : 0
  name   = "SecretsManagerGitHubToken"
  role   = aws_iam_role.org_scan_lambda.id
  policy = data.aws_iam_policy_document.org_scan_secrets_policy[0].json
}

data "aws_iam_policy_document" "org_scan_secrets_policy" {
  count = var.github_token_secret_arn != "" ? 1 : 0

  statement {
    sid    = "ReadGitHubToken"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [var.github_token_secret_arn]
  }
}

# KMS decrypt (for encrypted DynamoDB + Secrets Manager)
resource "aws_iam_role_policy" "org_scan_kms" {
  name   = "KMSDecrypt"
  role   = aws_iam_role.org_scan_lambda.id
  policy = data.aws_iam_policy_document.org_scan_kms_policy.json
}

data "aws_iam_policy_document" "org_scan_kms_policy" {
  statement {
    sid    = "KMSDecryptForGovernance"
    effect = "Allow"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey",
    ]
    resources = [var.kms_key_arn]
  }
}

# CloudWatch Logs
resource "aws_iam_role_policy_attachment" "org_scan_logs" {
  role       = aws_iam_role.org_scan_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ─── CloudWatch Log Group ────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "org_scan" {
  name              = "/aws/lambda/${aws_lambda_function.org_scan.function_name}"
  retention_in_days = var.log_retention_days

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-org-scan-logs"
      Purpose     = "OrgScanLambdaLogs"
      Environment = var.environment
    }
  )
}

# ─── EventBridge Schedule ────────────────────────────────────────────

resource "aws_cloudwatch_event_rule" "org_scan_schedule" {
  name                = "${var.project_name}-${var.environment}-org-scan"
  description         = "Trigger org governance scan every hour"
  schedule_expression = var.schedule_expression
  is_enabled          = var.schedule_enabled

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-org-scan-schedule"
      Purpose     = "OrgScanSchedule"
      Environment = var.environment
    }
  )
}

resource "aws_cloudwatch_event_target" "org_scan_target" {
  rule      = aws_cloudwatch_event_rule.org_scan_schedule.name
  target_id = "lambda-org-scan"
  arn       = aws_lambda_function.org_scan.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.org_scan.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.org_scan_schedule.arn
}

# ─── CloudWatch Alarm: Scan Failures ─────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "org_scan_errors" {
  count = var.alert_sns_topic_arn != "" ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-org-scan-errors"
  alarm_description   = "Org-scan Lambda errors in the last execution"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 3600
  statistic           = "Sum"
  threshold           = 0

  dimensions = {
    FunctionName = aws_lambda_function.org_scan.function_name
  }

  alarm_actions = [var.alert_sns_topic_arn]

  tags = merge(
    var.tags,
    {
      Name        = "${var.project_name}-${var.environment}-org-scan-errors"
      Purpose     = "OrgScanErrorAlarm"
      Environment = var.environment
    }
  )
}
