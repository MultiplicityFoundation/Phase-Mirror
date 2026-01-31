terraform {
  required_version = ">= 1.6.0"
  
  backend "s3" {
    bucket         = "mirror-dissonance-terraform-state-prod"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    
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
