# GCP Infrastructure for Phase Mirror

This directory contains Terraform configuration for deploying Phase Mirror to Google Cloud Platform.

## Prerequisites

- Terraform 1.5+
- Google Cloud CLI (`gcloud`)
- A GCP project with billing enabled
- Appropriate IAM permissions

## Resources Provisioned

- **Firestore (Native mode)**: For `fp_events`, `consent`, and `block_counter` collections
- **Secret Manager**: HMAC nonce storage with quarterly rotation
- **Cloud Storage**: Baseline storage with versioning
- **Cloud KMS**: Customer-managed encryption key
- **Workload Identity Federation**: GitHub Actions OIDC authentication
- **Service Account**: Application runtime identity with IAM bindings

## Deployment

### 1. Generate HMAC Nonce

**CRITICAL**: You must generate a secure nonce before deployment:

```bash
openssl rand -hex 32
```

This will output a 64-character hexadecimal string. Save this securely.

### 2. Configure Variables

Copy the example tfvars file:

```bash
cp staging.tfvars.example staging.tfvars
```

Edit `staging.tfvars` and set:
- `project_id`: Your GCP project ID
- `region`: Your preferred GCP region (default: us-central1)
- `hmac_nonce_secret`: The nonce generated in step 1

**WARNING**: Never commit `staging.tfvars` or `production.tfvars` to version control!

### 3. Initialize Terraform

```bash
terraform init -backend-config="bucket=YOUR_TFSTATE_BUCKET"
```

### 4. Plan and Apply

```bash
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

## Guardrails

### Nonce Validation

The Terraform configuration includes validation rules that will **block apply** if:

1. The `hmac_nonce_secret` is not a valid 64-character hexadecimal string
2. The `hmac_nonce_secret` is set to the placeholder value

This prevents accidental deployment with insecure or placeholder nonce values.

### Example Error

If you try to apply with a placeholder nonce, you'll see:

```
Error: Invalid value for variable

  on main.tf line 39:
  39: variable "hmac_nonce_secret" {

The hmac_nonce_secret cannot be the placeholder value. Generate a secure
nonce with: openssl rand -hex 32
```

## Nonce Rotation

After initial deployment, rotate the nonce using Secret Manager:

```bash
# Generate new nonce
NEW_NONCE=$(openssl rand -hex 32)

# Create new version
gcloud secrets versions add phase-mirror-hmac-nonce-staging \
  --data-file=- <<< "$NEW_NONCE"
```

The `lifecycle.ignore_changes` block prevents Terraform from overwriting manual rotations.

## Environment Variables

After deployment, configure your application with:

```bash
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export GCP_SECRET_NAME=phase-mirror-hmac-nonce-staging
export GCP_BASELINE_BUCKET=$(terraform output -raw baselines_bucket)
```

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use separate projects** for staging and production
3. **Enable audit logging** for Secret Manager access
4. **Rotate nonces quarterly** (automated via KMS rotation)
5. **Review IAM bindings** regularly
6. **Enable deletion protection** for production resources

## Outputs

The configuration provides these outputs:

- `firestore_database`: Database name
- `secret_id`: Secret Manager secret ID
- `baselines_bucket`: Cloud Storage bucket name
- `service_account_email`: Service account email
- `workload_identity_provider`: GitHub Actions WIF provider

Use these outputs to configure your CI/CD workflows and application.
