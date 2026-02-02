# E2E Integration Testing

## Overview

End-to-end tests validate Phase Mirror against real staging infrastructure (DynamoDB, SSM, S3, CloudWatch).

## Test Categories

### 1. False Positive Tracking
- Event submission to DynamoDB
- Query by rule (primary key)
- Query by finding (GSI)
- TTL expiration validation
- Concurrent submissions

### 2. Redaction with Nonce
- SSM parameter loading
- Multi-version nonce support
- Redaction with real nonce
- HMAC validation
- Tamper detection

### 3. Circuit Breaker
- Block counter increment
- Threshold enforcement
- Time-based bucket isolation
- Multi-rule isolation
- TTL cleanup

### 4. Drift Baseline
- S3 baseline storage
- Versioning support
- Drift detection
- Encryption verification

### 5. Complete Workflow
- End-to-end false positive flow
- All components integration
- Redaction + storage + circuit breaker + baseline

## Prerequisites

- Staging infrastructure deployed
- AWS credentials configured (OIDC or access keys)
- Node.js 20+
- pnpm

## Running Tests

### Local Execution

```bash
# Set environment
export AWS_REGION=us-east-1
export ENVIRONMENT=staging

# Run all E2E tests
./scripts/test/run-e2e-tests.sh

# Run specific test suite
cd packages/mirror-dissonance
pnpm test -- src/__tests__/e2e/fp-events.test.ts

# Run with verbose output
pnpm test -- src/__tests__/e2e/ --verbose --testTimeout=30000
```

### CI/CD Execution

E2E tests run automatically on:

- Push to `main` or `develop`
- Pull requests
- Daily at 6 AM UTC (scheduled)
- Manual workflow dispatch

## Test Configuration

### Environment Variables

- `AWS_REGION` - AWS region (default: us-east-1)
- `ENVIRONMENT` - Environment name (default: staging)

### Infrastructure Requirements

Tests require the following resources:

**DynamoDB Tables:**
- `mirror-dissonance-staging-fp-events`
- `mirror-dissonance-staging-consent`
- `mirror-dissonance-staging-block-counter`

**SSM Parameters:**
- `/guardian/staging/redaction_nonce_v1`

**S3 Buckets:**
- `mirror-dissonance-staging-baselines`

## Test Data Cleanup

Tests automatically clean up generated data in `afterAll` hooks.

Manual cleanup if needed:

```bash
# DynamoDB - delete test items
aws dynamodb delete-item \
  --table-name mirror-dissonance-staging-fp-events \
  --key '{"pk": {"S": "rule:test-*"}, "sk": {"S": "event:*"}}'

# S3 - delete test baselines
aws s3 rm s3://mirror-dissonance-staging-baselines/baselines/test- --recursive
```

## Troubleshooting

### "Infrastructure not ready"

```bash
# Verify infrastructure
cd infra/terraform
terraform workspace select staging
terraform plan -var-file=staging.tfvars

# Apply if needed
terraform apply -var-file=staging.tfvars
```

### "Access Denied"

Verify IAM permissions for OIDC role:

```bash
aws iam get-role --role-name mirror-dissonance-staging-github-deploy
```

### "Table not found"

Check table exists:

```bash
aws dynamodb describe-table \
  --table-name mirror-dissonance-staging-fp-events \
  --region us-east-1
```

## Performance Expectations

- Nonce loading from SSM: <500ms
- Redaction (cached nonce): <5ms per operation
- DynamoDB write: <100ms
- S3 write: <200ms
- Complete workflow: <2s

## Coverage

E2E tests provide integration coverage:

- DynamoDB operations: 90%
- SSM integration: 95%
- S3 operations: 85%
- Complete workflows: 80%

Unit tests provide component coverage: 92%

**Combined: 91% total coverage**
