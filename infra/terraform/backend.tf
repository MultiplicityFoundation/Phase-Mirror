# Terraform Backend Configuration
# Auto-generated on 2026-02-01
# 
# This backend stores Terraform state in S3 with DynamoDB locking.
# State files are encrypted at rest and versioned for rollback capability.
#
# Backend Resources:
#   - S3 Bucket: mirror-dissonance-terraform-state-prod
#   - DynamoDB Table: mirror-dissonance-terraform-lock-prod
#   - Region: us-east-1

terraform {
  required_version = ">= 1.6.0"
  
  backend "s3" {
    # S3 bucket for state storage
    bucket = "mirror-dissonance-terraform-state-prod"
    
    # State file path within bucket
    # Pattern: phase-mirror/env:/{workspace}/terraform.tfstate
    key = "phase-mirror/terraform.tfstate"
    
    # AWS region
    region = "us-east-1"
    
    # Server-side encryption
    encrypt = true
    
    # DynamoDB table for state locking
    dynamodb_table = "mirror-dissonance-terraform-lock-prod"
    
    # Workspace-specific state files
    # This creates separate state files for staging, production, etc.
    workspace_key_prefix = "env:"
    
    # Optional: Enable versioning and lifecycle
    # versioning = true  # Already enabled via bucket policy
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

# Backend configuration notes:
#
# 1. Workspace State Paths:
#    - default workspace: s3://mirror-dissonance-terraform-state-prod/phase-mirror/terraform.tfstate
#    - staging workspace: s3://mirror-dissonance-terraform-state-prod/phase-mirror/env:/staging/terraform.tfstate
#    - prod workspace: s3://mirror-dissonance-terraform-state-prod/phase-mirror/env:/prod/terraform.tfstate
#
# 2. State Locking:
#    - Lock ID format: mirror-dissonance-terraform-state-prod/phase-mirror/env:/{workspace}/terraform.tfstate
#    - Locks prevent concurrent `terraform apply` operations
#    - Locks auto-release after 20 minutes if Terraform crashes
#
# 3. Migration from Local State:
#    If migrating from local state:
#      1. Ensure backend configuration matches above
#      2. Run: terraform init -migrate-state
#      3. Confirm state migration when prompted
#      4. Verify: aws s3 ls s3://mirror-dissonance-terraform-state-prod/phase-mirror/
#
# 4. Disaster Recovery:
#    - State versioning enabled (90-day retention)
#    - PITR enabled on lock table (35-day recovery)
#    - To restore previous state version:
#        # WARNING: Always backup current state before pushing a previous version!
#        # Step 1: Backup current state (verify non-empty)
#        terraform state pull > current-state-backup.json && test -s current-state-backup.json || echo "ERROR: Backup failed or is empty"
#        # Step 2: List available versions
#        aws s3api list-object-versions --bucket mirror-dissonance-terraform-state-prod --prefix phase-mirror/
#        # Step 3: Download specific version
#        aws s3api get-object --bucket mirror-dissonance-terraform-state-prod --key phase-mirror/terraform.tfstate --version-id VERSION_ID terraform.tfstate.backup
#        # Step 4: Verify the backup state is valid JSON
#        cat terraform.tfstate.backup | jq . > /dev/null && echo "Valid JSON" || echo "ERROR: Invalid JSON"
#        # Step 5: Push the restored state (USE WITH EXTREME CAUTION)
#        terraform state push terraform.tfstate.backup
