# Staging Environment Configuration

aws_region  = "us-east-1"
environment = "staging"

# Disable deletion protection in staging for easier cleanup
enable_point_in_time_recovery = true
enable_deletion_protection    = false

fp_ingestion_lambda_name = ""
