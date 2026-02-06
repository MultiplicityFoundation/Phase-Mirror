# E2E Tests & Performance Benchmarks — Infrastructure Guide

This guide covers how to provision the infrastructure needed to run the full E2E
test suite and performance benchmarks that require real (or emulated) AWS services.

---

## Quick Reference

| Test Suite | Location | Requirements | Typical Duration |
|---|---|---|---|
| Core unit tests | `packages/mirror-dissonance/src/` | None (mocked) | ~15 s |
| MCP unit tests | `packages/mcp-server/test/` | None (mocked) | ~5 s |
| Core E2E tests | `packages/mirror-dissonance/src/__tests__/e2e/` | DynamoDB, SSM, S3 | ~2 min |
| Integration tests | `packages/mirror-dissonance/src/__tests__/integration/` | SSM (LocalStack) | ~1 min |
| Full-cycle E2E | `e2e/full-cycle.test.ts` | GitHub API token + test repo | ~10 min |
| Benchmarks (quick) | `packages/mirror-dissonance/src/__tests__/benchmarks/` | DynamoDB, SSM, S3 | ~3 min |
| Benchmarks (load) | `benchmarks/load.bench.ts` | DynamoDB, SSM, S3 | ~5+ min |

---

## Option A: LocalStack (Recommended for Development)

LocalStack emulates DynamoDB, SSM, S3, and KMS locally. This is the fastest way
to run E2E tests and benchmarks without incurring AWS costs.

### 1. Start LocalStack

```bash
# From the repo root — uses the included compose file
docker compose -f localstack-compose.yml up -d

# Verify it's running
curl -s http://localhost:4566/_localstack/health | jq .
```

The compose file (`localstack-compose.yml`) starts LocalStack with:
- **DynamoDB** on port 4566
- **SSM** on port 4566
- **KMS** on port 4566
- **S3** on port 4566

### 2. Provision Resources

Create the DynamoDB tables, SSM parameters, and S3 buckets that the tests expect:

```bash
export AWS_DEFAULT_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export LOCALSTACK_ENDPOINT=http://localhost:4566

# ── DynamoDB Tables ──────────────────────────────────────────

# FP Events table
aws --endpoint-url=$LOCALSTACK_ENDPOINT dynamodb create-table \
  --table-name mirror-dissonance-staging-fp-events \
  --attribute-definitions \
    AttributeName=pk,AttributeType=S \
    AttributeName=sk,AttributeType=S \
    AttributeName=gsi1pk,AttributeType=S \
    AttributeName=gsi1sk,AttributeType=S \
  --key-schema \
    AttributeName=pk,KeyType=HASH \
    AttributeName=sk,KeyType=RANGE \
  --global-secondary-indexes \
    '[{"IndexName":"gsi1","KeySchema":[{"AttributeName":"gsi1pk","KeyType":"HASH"},{"AttributeName":"gsi1sk","KeyType":"RANGE"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST

# Consent table
aws --endpoint-url=$LOCALSTACK_ENDPOINT dynamodb create-table \
  --table-name mirror-dissonance-staging-consent \
  --attribute-definitions \
    AttributeName=orgId,AttributeType=S \
  --key-schema \
    AttributeName=orgId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Block Counter table
aws --endpoint-url=$LOCALSTACK_ENDPOINT dynamodb create-table \
  --table-name mirror-dissonance-staging-block-counter \
  --attribute-definitions \
    AttributeName=bucketKey,AttributeType=S \
  --key-schema \
    AttributeName=bucketKey,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# ── SSM Parameters ───────────────────────────────────────────

# Generate a test nonce (64 hex chars = 32 bytes)
NONCE=$(openssl rand -hex 32)

aws --endpoint-url=$LOCALSTACK_ENDPOINT ssm put-parameter \
  --name /guardian/staging/redaction_nonce_v1 \
  --type SecureString \
  --value "$NONCE"

# ── S3 Bucket ────────────────────────────────────────────────

aws --endpoint-url=$LOCALSTACK_ENDPOINT s3 mb \
  s3://mirror-dissonance-staging-baselines
```

### 3. Run the Tests

```bash
# Set environment for LocalStack
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_ENDPOINT_URL=http://localhost:4566
export LOCALSTACK_ENDPOINT=http://localhost:4566
export ENVIRONMENT=staging

# ── Core E2E Tests ───────────────────────────────────────────
cd packages/mirror-dissonance
NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/e2e' --forceExit

# ── Integration Tests (nonce rotation) ───────────────────────
NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/integration' --forceExit

# ── Benchmarks (quick — excludes load tests) ─────────────────
NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/benchmarks' \
  --testPathIgnorePatterns='load.bench' --forceExit

# ── Benchmarks (full — includes 5-min load test) ─────────────
RUN_LOAD_TESTS=true NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/benchmarks' \
  --testTimeout=600000 --forceExit
```

### 4. Tear Down

```bash
docker compose -f localstack-compose.yml down -v
```

---

## Option B: Real AWS (Staging Environment)

Use Terraform to provision identical resources in a real AWS account. This is
required for accurate benchmark numbers and for validating IAM/OIDC flows.

### 1. Prerequisites

- AWS CLI configured with credentials (`aws sts get-caller-identity`)
- Terraform ≥ 1.5 installed
- An S3 bucket for Terraform state (see `scripts/bootstrap-terraform-backend.sh`)

### 2. Deploy Infrastructure

```bash
cd infra/terraform

# Initialize
terraform init

# Plan (review first!)
terraform plan -var="environment=staging"

# Apply
terraform apply -var="environment=staging"
```

This creates:
- 3 DynamoDB tables (`fp-events`, `consent`, `block-counter`)
- SSM parameter (`/guardian/staging/redaction_nonce_v1`)
- S3 bucket (`mirror-dissonance-staging-baselines`)
- KMS key for encryption
- CloudWatch alarms
- IAM roles for GitHub Actions OIDC

### 3. Run Tests

```bash
export AWS_REGION=us-east-1
export ENVIRONMENT=staging
# AWS credentials from your CLI profile — no ENDPOINT_URL needed

cd packages/mirror-dissonance

# E2E
NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/e2e' --forceExit

# Benchmarks
NODE_OPTIONS='--experimental-vm-modules' \
  npx jest --testPathPattern='src/__tests__/benchmarks' --forceExit
```

### 4. Tear Down (Optional)

```bash
cd infra/terraform
terraform destroy -var="environment=staging"
```

---

## Option C: Full-Cycle E2E (GitHub API)

The `e2e/full-cycle.test.ts` test creates a real PR on a test repository, waits
for CI checks, and validates the merge queue flow.

### Prerequisites

- `GITHUB_TOKEN` — a PAT with `repo` scope
- `E2E_TEST_REPO` — name of the test repo (default: `Phase-Mirror-Test`)
- `E2E_TEST_OWNER` — GitHub org/user (default: `PhaseMirror`)
- The test repo must have GitHub Actions workflows configured

```bash
export GITHUB_TOKEN=ghp_...
export E2E_TEST_REPO=Phase-Mirror-Test
export E2E_TEST_OWNER=MultiplicityFoundation

cd e2e
npx jest full-cycle.test.ts --testTimeout=600000
```

---

## Performance Targets

These targets apply when running against real AWS (not LocalStack, which has
different latency characteristics):

| Operation | Target Avg | Target p95 |
|---|---|---|
| SSM Nonce Load | <500 ms | <750 ms |
| Cached Nonce Retrieval | <0.1 ms | — |
| Single Redaction | <5 ms | <10 ms |
| Multi-Pattern Redaction | <10 ms | — |
| Large Text (10 KB) | <50 ms | — |
| HMAC Validation | <1 ms | — |
| DynamoDB Write | <100 ms | <200 ms |
| DynamoDB Batch (25 items) | <500 ms | — |
| DynamoDB Query | <50 ms | — |
| Complete FP Workflow | <500 ms | <750 ms |
| Sustained Throughput | >10 ops/s | — |
| Burst Throughput | >20 ops/s | — |

---

## CI Integration

### GitHub Actions

Add E2E/benchmark jobs to your CI workflow. They should run on a schedule
(nightly) or on release branches — not on every PR push:

```yaml
# .github/workflows/e2e.yml
name: E2E & Benchmarks
on:
  schedule:
    - cron: '0 3 * * *'   # nightly at 3 AM UTC
  workflow_dispatch:        # manual trigger

jobs:
  e2e-localstack:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
        env:
          SERVICES: dynamodb,ssm,kms,s3
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @mirror-dissonance/core build
      - name: Provision LocalStack resources
        run: |
          export AWS_DEFAULT_REGION=us-east-1
          export AWS_ACCESS_KEY_ID=test
          export AWS_SECRET_ACCESS_KEY=test
          export EP=http://localhost:4566
          # Tables
          aws --endpoint-url=$EP dynamodb create-table \
            --table-name mirror-dissonance-staging-fp-events \
            --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
            --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
            --billing-mode PAY_PER_REQUEST
          aws --endpoint-url=$EP dynamodb create-table \
            --table-name mirror-dissonance-staging-consent \
            --attribute-definitions AttributeName=orgId,AttributeType=S \
            --key-schema AttributeName=orgId,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST
          aws --endpoint-url=$EP dynamodb create-table \
            --table-name mirror-dissonance-staging-block-counter \
            --attribute-definitions AttributeName=bucketKey,AttributeType=S \
            --key-schema AttributeName=bucketKey,KeyType=HASH \
            --billing-mode PAY_PER_REQUEST
          # SSM
          aws --endpoint-url=$EP ssm put-parameter \
            --name /guardian/staging/redaction_nonce_v1 \
            --type SecureString --value "$(openssl rand -hex 32)"
          # S3
          aws --endpoint-url=$EP s3 mb s3://mirror-dissonance-staging-baselines
      - name: Run E2E tests
        env:
          AWS_REGION: us-east-1
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_ENDPOINT_URL: http://localhost:4566
          LOCALSTACK_ENDPOINT: http://localhost:4566
          ENVIRONMENT: staging
          NODE_OPTIONS: '--experimental-vm-modules'
        run: |
          cd packages/mirror-dissonance
          npx jest --testPathPattern='src/__tests__/(e2e|integration)' --forceExit
      - name: Run benchmarks
        env:
          AWS_REGION: us-east-1
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_ENDPOINT_URL: http://localhost:4566
          ENVIRONMENT: staging
          NODE_OPTIONS: '--experimental-vm-modules'
        run: |
          cd packages/mirror-dissonance
          npx jest --testPathPattern='src/__tests__/benchmarks' \
            --testPathIgnorePatterns='load.bench' --forceExit
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Infrastructure not ready for E2E tests` | Tables/params not created | Run the provisioning commands above |
| `ECONNREFUSED 127.0.0.1:4566` | LocalStack not running | `docker compose -f localstack-compose.yml up -d` |
| `ResourceNotFoundException` | Wrong table name or environment | Check `ENVIRONMENT` matches table names |
| `ParameterNotFound` | SSM nonce not created | Run the `ssm put-parameter` command |
| Benchmarks show >1 s latency | LocalStack has higher latency than real AWS | Expected — use real AWS for accurate numbers |
| `Exceeded timeout of 30000 ms` | Slow network or cold LocalStack | Increase `--testTimeout` or wait for LocalStack warmup |
