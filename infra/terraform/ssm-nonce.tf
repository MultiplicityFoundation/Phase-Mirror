# SSM Nonce Persistence - Day 12 Morning
# HMAC nonce for RedactedText validation with rotation support

resource "random_uuid" "redaction_nonce_v1" {
  keepers = {
    # Regenerate on manual trigger
    rotation_trigger = var.nonce_rotation_trigger
  }
}

resource "aws_ssm_parameter" "redaction_nonce" {
  name        = "/guardian/redaction_nonce_v1"
  description = "HMAC nonce for RedactedText validation - version 1"
  type        = "SecureString"
  value       = random_uuid.redaction_nonce_v1.result
  
  tags = {
    Project   = "MirrorDissonance"
    Component = "Redaction"
    Version   = "1"
  }
  
  lifecycle {
    ignore_changes = [value]  # Prevent Terraform from rotating unintentionally
  }
}

# CloudWatch alarm for SSM access failures
resource "aws_cloudwatch_metric_alarm" "ssm_nonce_failures" {
  alarm_name          = "mirror-dissonance-ssm-nonce-failures-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/SSM"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "SSM GetParameter failures for redaction nonce"
  
  dimensions = {
    ParameterName = aws_ssm_parameter.redaction_nonce.name
  }
  
  alarm_actions = [var.ops_sns_topic_arn]
}
