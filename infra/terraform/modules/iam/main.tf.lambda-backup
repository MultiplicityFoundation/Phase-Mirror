# IAM Roles and Policies for Phase Mirror FP Calibration Service
# Based on Phase 3 Infrastructure Deployment (Day 27)

# FP Ingestion Lambda Role
resource "aws_iam_role" "fp_ingestion_lambda" {
  name = "phase-mirror-fp-ingestion-lambda-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-fp-ingestion-lambda-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Function  = "FPIngestion"
    }
  )
}

# Attach basic execution role for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "fp_ingestion_basic" {
  role       = aws_iam_role.fp_ingestion_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Inline policy for FP Ingestion Lambda
resource "aws_iam_role_policy" "fp_ingestion_inline" {
  name = "fp-ingestion-permissions"
  role = aws_iam_role.fp_ingestion_lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadConsentStore"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:Query"
        ]
        Resource = var.consent_store_table_arn
      },
      {
        Sid    = "WriteCalibrationStore"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = var.calibration_store_table_arn
      },
      {
        Sid    = "ReadHMACSalt"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.hmac_salt_secret_arn
      },
      {
        Sid    = "DecryptSecrets"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = var.kms_key_arn
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# Calibration Query Lambda Role
resource "aws_iam_role" "calibration_query_lambda" {
  name = "phase-mirror-calibration-query-lambda-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-calibration-query-lambda-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Function  = "CalibrationQuery"
    }
  )
}

# Attach basic execution role for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "calibration_query_basic" {
  role       = aws_iam_role.calibration_query_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Inline policy for Calibration Query Lambda
resource "aws_iam_role_policy" "calibration_query_inline" {
  name = "calibration-query-permissions"
  role = aws_iam_role.calibration_query_lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadCalibrationStore"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          var.calibration_store_table_arn,
          var.calibration_store_gsi_arn
        ]
      }
    ]
  })
}

# Salt Rotation Lambda Role
resource "aws_iam_role" "salt_rotator_lambda" {
  name = "phase-mirror-salt-rotator-lambda-${var.environment}"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = merge(
    var.tags,
    {
      Name      = "phase-mirror-salt-rotator-lambda-${var.environment}"
      Project   = "PhaseMirror"
      Component = "FPCalibration"
      Function  = "SaltRotation"
    }
  )
}

# Attach basic execution role for CloudWatch Logs
resource "aws_iam_role_policy_attachment" "salt_rotator_basic" {
  role       = aws_iam_role.salt_rotator_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Inline policy for Salt Rotator Lambda
resource "aws_iam_role_policy" "salt_rotator_inline" {
  name = "salt-rotator-permissions"
  role = aws_iam_role.salt_rotator_lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ManageHMACSalt"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = var.hmac_salt_secret_arn
      },
      {
        Sid    = "EncryptDecryptSecrets"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = var.kms_key_arn
      }
    ]
  })
}
