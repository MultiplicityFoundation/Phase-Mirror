terraform {
  # Terraform 1.5.0+ is required for the latest backend features
  # and workspace key prefix support
  required_version = ">= 1.5.0"

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

  backend "s3" {
    # Backend resources must be created before Terraform can use them
    # Run: ./scripts/create-backend-resources.sh

    bucket  = "mirror-dissonance-terraform-state-prod"
    key     = "terraform.tfstate"
    region  = "us-east-1"
    encrypt = true

    # State locking via DynamoDB
    dynamodb_table = "mirror-dissonance-terraform-lock-prod"

    # Workspace support
    workspace_key_prefix = "workspaces"
  }
}

