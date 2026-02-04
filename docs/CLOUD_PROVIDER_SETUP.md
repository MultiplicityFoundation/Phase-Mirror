# Cloud Provider Configuration Guide

This guide explains how to configure Phase Mirror's cloud provider backend and use the CLI without cloud credentials.

## Default Configuration: Local Mode

Phase Mirror defaults to **local mode**, which uses file-based storage and requires no cloud credentials. This design ensures:

✅ **Community accessibility** - Contributors can clone, build, and test without any cloud setup  
✅ **CI/CD simplicity** - Tests run in CI without credential management  
✅ **Development speed** - Instant feedback with no network latency  
✅ **Cost efficiency** - Zero cloud costs for development and testing  

## Quick Start (No Cloud Credentials Required)

1. Clone and install:
```bash
git clone https://github.com/MultiplicityFoundation/Phase-Mirror.git
cd Phase-Mirror
pnpm install
pnpm build
```

2. Run the CLI:
```bash
# The CLI works out of the box with local storage
oracle analyze .github/workflows/
oracle validate
oracle drift --baseline baseline.json
```

3. Run tests:
```bash
# All tests run with local adapters (no credentials needed)
pnpm test
```

That's it! No environment variables, no cloud accounts, no credentials needed.

## Environment Variables

### Local Mode (Default)

```bash
# Optional: Specify local mode explicitly
export CLOUD_PROVIDER=local

# Optional: Change local data directory
export LOCAL_DATA_DIR=.phase-mirror-data
```

If `CLOUD_PROVIDER` is not set, it defaults to `local`.

### GCP Mode (Optional)

For production deployments with GCP:

```bash
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export GCP_BASELINE_BUCKET=your-project-baselines-staging
export GCP_SECRET_NAME=phase-mirror-hmac-nonce-staging
```

Credentials:
- **Local development**: `gcloud auth application-default login`
- **CI/CD**: Workload Identity Federation (configured in Terraform)

### AWS Mode (Optional)

For production deployments with AWS:

```bash
export CLOUD_PROVIDER=aws
export AWS_REGION=us-east-1
export AWS_FP_TABLE=phase-mirror-fp-events
export AWS_CONSENT_TABLE=phase-mirror-consent
export AWS_BLOCK_COUNTER_TABLE=phase-mirror-block-counter
export AWS_NONCE_PARAMETER=/phase-mirror/hmac-nonce
export AWS_BASELINE_BUCKET=phase-mirror-baselines
```

Credentials:
- **Local development**: `aws configure` or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
- **CI/CD**: OIDC authentication (configured in Terraform)

## CLI Behavior Without Credentials

The CLI produces meaningful reports without any cloud credentials:

### What Works in Local Mode

✅ **All analysis commands**
```bash
oracle analyze .github/workflows/
oracle validate
oracle drift --baseline baseline.json
```

✅ **Configuration management**
```bash
oracle config show
oracle config set drift.threshold 0.15
```

✅ **False positive tracking**
```bash
oracle fp mark FINDING-123 --reason "Safe pattern"
oracle fp list --rule MD-001
```

✅ **Baseline management**
```bash
oracle baseline --output baseline.json
```

✅ **Reports and output**
- JSON reports (`dissonance_report.json`)
- SARIF format for GitHub integration
- Text output for human review
- GitHub annotations

### Local Storage Location

When running in local mode, data is stored in:
- **Default**: `.test-data/` in the current directory
- **Custom**: Set via `LOCAL_DATA_DIR` environment variable

Directory structure:
```
.test-data/
├── fp_events/          # False positive events
├── consent/            # Consent records
├── block_counter/      # Circuit breaker state
├── secrets/            # Nonce storage
└── baselines/          # Drift baselines
```

## Switching Providers

Change providers without code changes by setting `CLOUD_PROVIDER`:

### Development → Staging → Production

```bash
# Local development (default)
export CLOUD_PROVIDER=local
oracle analyze

# Staging with GCP
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=my-project-staging
oracle analyze

# Production with GCP
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=my-project-prod
oracle analyze
```

### Multi-Cloud Testing

Test the same workflow across providers:

```bash
# Test with local storage
CLOUD_PROVIDER=local pnpm test

# Test with AWS (if credentials available)
CLOUD_PROVIDER=aws pnpm test

# Test with GCP (if credentials available)
CLOUD_PROVIDER=gcp GCP_PROJECT_ID=test-project pnpm test
```

## Deployment Guardrails

### GCP Deployment

Phase Mirror includes Terraform validation that **blocks deployment** if the HMAC nonce is not properly configured:

```bash
cd infra/gcp

# Generate secure nonce
openssl rand -hex 32

# Create tfvars file
cat > staging.tfvars <<EOF
project_id = "my-project"
region = "us-central1"
environment = "staging"
hmac_nonce_secret = "YOUR_SECURE_NONCE_HERE"
EOF

# Apply (will fail if nonce is placeholder)
terraform apply -var-file=staging.tfvars
```

The validation ensures:
1. Nonce is a valid 64-character hexadecimal string
2. Nonce is not the placeholder value `0000...0000`
3. Nonce meets security requirements before deployment

See [infra/gcp/README.md](../infra/gcp/README.md) for full deployment guide.

## Adapter Parity Testing

Phase Mirror includes comprehensive adapter parity tests to ensure all providers (AWS, GCP, Local) implement identical behavior:

```bash
# Run parity tests (local adapter only, no credentials)
pnpm test packages/mirror-dissonance/src/adapters/__tests__/adapter-parity.test.ts

# Run with cloud credentials (if available)
export AWS_ACCESS_KEY_ID=...
export GCP_PROJECT_ID=...
pnpm test adapter-parity
```

These tests verify:
- Interface conformance across all providers
- Semantic equivalence of operations
- Contract compliance for error handling
- No drift in multi-cloud abstraction

See [`packages/mirror-dissonance/src/adapters/__tests__/README.md`](../packages/mirror-dissonance/src/adapters/__tests__/README.md) for details.

## Benefits of Local-First Design

### For Contributors

✅ **Zero setup** - Clone, install, test, contribute  
✅ **Fast iteration** - No cloud latency, instant feedback  
✅ **Offline work** - Develop without internet connection  
✅ **Privacy** - No data leaves your machine  

### For CI/CD

✅ **No secrets** - Tests run without credentials  
✅ **Fast builds** - No cloud API calls  
✅ **Cost-free** - Zero cloud costs for CI  
✅ **Reliable** - No network flakiness  

### For Security

✅ **Fail-closed** - Missing cloud credentials don't break the CLI  
✅ **Audit trail** - Local files are human-readable JSON  
✅ **Privacy** - Sensitive data stays in your control  

## Troubleshooting

### CLI runs but no data persists

Check that you have write permissions:
```bash
ls -la .test-data/
```

Set a custom directory if needed:
```bash
export LOCAL_DATA_DIR=/tmp/phase-mirror-data
```

### Cloud provider errors

If you get cloud credential errors but want to use local mode:

```bash
# Force local mode
export CLOUD_PROVIDER=local
oracle analyze
```

### Testing cloud providers locally

Use emulators for development:

```bash
# AWS with LocalStack
docker run -d -p 4566:4566 localstack/localstack
export CLOUD_PROVIDER=aws
export AWS_ENDPOINT_URL=http://localhost:4566
oracle analyze

# GCP with Firestore emulator
gcloud beta emulators firestore start
export FIRESTORE_EMULATOR_HOST=localhost:8080
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=test-project
oracle analyze
```

## Related Documentation

- [Adapter Architecture](../packages/mirror-dissonance/src/adapters/README.md)
- [GCP Infrastructure](../infra/gcp/README.md)
- [Adapter Parity Tests](../packages/mirror-dissonance/src/adapters/__tests__/README.md)
- [CLI Documentation](../packages/cli/README.md)

## Support

For questions or issues:
- **GitHub Issues**: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Discussions**: https://github.com/MultiplicityFoundation/Phase-Mirror/discussions
