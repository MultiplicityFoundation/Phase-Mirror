# Terraform Backend Configuration
# Created: 2026-02-01
# Purpose: Store Terraform state in S3 with DynamoDB locking
#
# State is stored in S3 with server-side encryption (AES256)
# DynamoDB provides state locking to prevent concurrent modifications
# Versioning is enabled on the S3 bucket for state rollback capability
#
# For environment-specific configurations:
#   - Use terraform workspaces (dev, staging, production)
#   - Each workspace has its own state file in S3
#   - State files are organized under: s3://bucket/phase-mirror/env:/workspace-name/terraform.tfstate

terraform {
  required_version = ">= 1.6.0"
  
  backend "s3" {
    bucket         = "mirror-dissonance-terraform-state-prod"
    key            = "phase-mirror/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    
    # Workspace-specific state files
    # Each workspace (dev, staging, production) gets its own state file
    # Format: phase-mirror/env:/workspace-name/terraform.tfstate
    workspace_key_prefix = "env"
    
    # Prevent accidental state corruption
    skip_credentials_validation = false
    skip_metadata_api_check     = false
  }
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}
