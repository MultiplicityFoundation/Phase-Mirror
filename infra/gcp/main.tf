/**
 * Phase Mirror GCP Infrastructure
 * 
 * Provisions:
 * - Firestore collections (fp_events, consent, block_counter)
 * - Secret Manager (HMAC nonce with quarterly rotation)
 * - Cloud Storage bucket (drift baselines with versioning)
 * - Cloud KMS (customer-managed encryption key)
 * - Workload Identity Federation (GitHub Actions OIDC)
 */

terraform {
  required_version = ">= 1.5"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  
  backend "gcs" {
    # bucket = "phase-mirror-tfstate"  # Set via -backend-config during init
    prefix = "terraform/state"
  }
}

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  default     = "staging"
}

variable "hmac_nonce_secret" {
  description = "HMAC nonce secret for anonymization (must be a secure 64-character hex string)"
  type        = string
  sensitive   = true
  
  validation {
    condition     = length(var.hmac_nonce_secret) == 64 && can(regex("^[0-9a-fA-F]{64}$", var.hmac_nonce_secret))
    error_message = "The hmac_nonce_secret must be a 64-character hexadecimal string. Generate with: openssl rand -hex 32"
  }
  
  validation {
    condition     = var.hmac_nonce_secret != "0000000000000000000000000000000000000000000000000000000000000000"
    error_message = "The hmac_nonce_secret cannot be the placeholder value. Generate a secure nonce with: openssl rand -hex 32"
  }
  
  validation {
    condition     = var.hmac_nonce_secret != "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
    error_message = "The hmac_nonce_secret cannot be the example placeholder. Generate a secure nonce with: openssl rand -hex 32"
  }
}

variable "github_repo" {
  description = "GitHub repository in format owner/repo"
  type        = string
  default     = "MultiplicityFoundation/Phase-Mirror"
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  app_name = "phase-mirror"
  labels = {
    app         = local.app_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

# Enable required APIs
resource "google_project_service" "firestore" {
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager" {
  service            = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudkms" {
  service            = "cloudkms.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "storage" {
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iamcredentials" {
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

# Firestore Database (Native mode)
resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.firestore]
}

# Cloud KMS Keyring for encryption
resource "google_kms_key_ring" "phase_mirror" {
  name     = "${local.app_name}-keyring-${var.environment}"
  location = var.region

  depends_on = [google_project_service.cloudkms]
}

# Cloud KMS Crypto Key for Secret Manager encryption
resource "google_kms_crypto_key" "secret_encryption" {
  name     = "secret-encryption-key"
  key_ring = google_kms_key_ring.phase_mirror.id

  rotation_period = "7776000s" # 90 days (quarterly rotation)

  lifecycle {
    prevent_destroy = true
  }
}

# HMAC Nonce Secret (for anonymization)
resource "google_secret_manager_secret" "hmac_nonce" {
  secret_id = "${local.app_name}-hmac-nonce-${var.environment}"

  labels = local.labels

  replication {
    auto {}
  }

  depends_on = [google_project_service.secretmanager]
}

# Initial nonce value (replace with actual generated value)
resource "google_secret_manager_secret_version" "hmac_nonce_v1" {
  secret = google_secret_manager_secret.hmac_nonce.id

  # Use the validated nonce from variable
  # Generate with: openssl rand -hex 32
  secret_data = var.hmac_nonce_secret

  lifecycle {
    ignore_changes = [secret_data] # Prevent overwriting manual rotations
  }
}

# Cloud Storage bucket for drift baselines
resource "google_storage_bucket" "baselines" {
  name          = "${var.project_id}-${local.app_name}-baselines-${var.environment}"
  location      = var.region
  force_destroy = false

  labels = local.labels

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 10
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  uniform_bucket_level_access = true

  depends_on = [google_project_service.storage]
}

# Service account for Phase Mirror application
resource "google_service_account" "phase_mirror" {
  account_id   = "${local.app_name}-sa-${var.environment}"
  display_name = "Phase Mirror Service Account (${var.environment})"
  description  = "Service account for Phase Mirror application runtime"
}

# IAM binding: Firestore Data User
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.phase_mirror.email}"
}

# IAM binding: Secret Manager Secret Accessor
resource "google_secret_manager_secret_iam_member" "nonce_accessor" {
  secret_id = google_secret_manager_secret.hmac_nonce.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.phase_mirror.email}"
}

# IAM binding: Storage Object Admin (for baselines)
resource "google_storage_bucket_iam_member" "baselines_admin" {
  bucket = google_storage_bucket.baselines.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.phase_mirror.email}"
}

# Workload Identity Pool for GitHub Actions
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "${local.app_name}-github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Workload Identity Pool for GitHub Actions OIDC"

  depends_on = [google_project_service.iam]
}

# Workload Identity Provider (GitHub OIDC)
resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub OIDC Provider"
  description                        = "OIDC provider for GitHub Actions"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# IAM binding: Allow GitHub Actions to impersonate service account
resource "google_service_account_iam_member" "github_sa_user" {
  service_account_id = google_service_account.phase_mirror.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repo}"
}

# Outputs
output "firestore_database" {
  description = "Firestore database name"
  value       = google_firestore_database.default.name
}

output "secret_id" {
  description = "Secret Manager secret ID for HMAC nonce"
  value       = google_secret_manager_secret.hmac_nonce.secret_id
}

output "baselines_bucket" {
  description = "Cloud Storage bucket for baselines"
  value       = google_storage_bucket.baselines.name
}

output "service_account_email" {
  description = "Service account email for application runtime"
  value       = google_service_account.phase_mirror.email
}

output "workload_identity_provider" {
  description = "Workload Identity Provider for GitHub Actions"
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "project_id" {
  description = "GCP project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP region"
  value       = var.region
}
