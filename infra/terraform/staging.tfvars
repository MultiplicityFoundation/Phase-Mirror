# Staging Environment Configuration

environment                  = "staging"
aws_region                   = "us-east-1"
project_name                 = "mirror-dissonance"
enable_pitr                  = true
kms_deletion_window_days     = 7
alert_email                  = "" # Set via environment variable or after deployment
enable_circuit_breaker_alarm = true
circuit_breaker_threshold    = 0

# GitHub OIDC Configuration
github_org  = "MultiplicityFoundation"
github_repo = "Phase-Mirror"
