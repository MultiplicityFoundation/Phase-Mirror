# Oracle Integration Day 5 - LocalStack Verification

This document provides a comprehensive guide for verifying Oracle integration using LocalStack.

## Overview

This integration test harness verifies that the Oracle properly wires together:
- DynamoDB for FP Store, Consent Store, and Block Counter
- SSM Parameter Store for nonce management
- S3 for baseline storage
- KMS for encryption simulation

## Prerequisites

- Docker installed and running
- Node.js 18+ and pnpm
- AWS CLI installed
- LocalStack CLI (optional, but recommended)

## Quick Start

### 1. Start LocalStack

```bash
cd /home/runner/work/Phase-Mirror/Phase-Mirror
docker-compose -f localstack-compose.yml up -d
```

Verify LocalStack is running:

```bash
curl http://localhost:4566/_localstack/health | jq
```

Expected output:
```json
{
  "services": {
    "dynamodb": "running",
    "ssm": "running",
    "kms": "running",
    "s3": "running"
  }
}
```

### 2. Setup Infrastructure

```bash
./test-harness/localstack/setup-infra.sh
```

This creates:
- **DynamoDB Tables:**
  - `mirror-dissonance-test-fp-events` - FP event tracking with GSI
  - `mirror-dissonance-test-consent` - Organization consent records
  - `mirror-dissonance-test-block-counter` - Circuit breaker counters

- **SSM Parameters:**
  - `/guardian/test/redaction_nonce_v1` - Primary nonce
  - `/guardian/test/redaction_nonce_v2` - Rotation test nonce

- **S3 Bucket:**
  - `mirror-dissonance-test-baselines` - Drift baseline storage

- **Test Data:**
  - 5 FP events for rule MD-001 (1 marked as false positive)
  - 1 consent record for TestOrg

### 3. Install Test Dependencies

```bash
cd test-harness/localstack
pnpm install
```

### 4. Run Integration Tests

```bash
cd test-harness/localstack
pnpm test
```

Or run specific test suites:

```bash
# Oracle integration tests
pnpm test oracle-integration.test.ts

# Nonce rotation tests
pnpm test nonce-rotation.integration.test.ts
```

### 5. Teardown

```bash
cd /home/runner/work/Phase-Mirror/Phase-Mirror
./test-harness/localstack/teardown.sh
```

## Test Coverage

### 1. Nonce Loading & Redaction
- ✅ Load nonce from SSM successfully
- ✅ Validate HMAC integrity
- ✅ Fail-closed when nonce unavailable
- ✅ Cache performance

### 2. Oracle Initialization
- ✅ Initialize with all components
- ✅ Fail when dependencies unavailable
- ✅ Support custom endpoints

### 3. FP Store Operations
- ✅ Query existing events
- ✅ Record new events
- ✅ Mark false positives
- ✅ Window-based queries

### 4. Consent Management
- ✅ Verify consent records
- ✅ Check consent validity
- ✅ Handle missing consent

### 5. Block Counter
- ✅ Increment counters with TTL
- ✅ Query current counts
- ✅ Circuit breaker behavior

### 6. End-to-End Analysis
- ✅ Full Oracle analysis pipeline
- ✅ Decision making
- ✅ Report generation

### 7. Nonce Rotation
- ✅ Multi-version nonce support
- ✅ Grace period validation
- ✅ Cache management

### 8. Performance Benchmarks
- ✅ Redaction performance (<100μs p99)
- ✅ DynamoDB query performance

## Configuration

The Oracle accepts an `endpoint` parameter for LocalStack testing:

```typescript
import { initializeOracle } from '@mirror-dissonance/core';

const oracle = await initializeOracle({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',  // LocalStack endpoint
  nonceParameterName: '/guardian/test/redaction_nonce_v1',
  fpTableName: 'mirror-dissonance-test-fp-events',
  consentTableName: 'mirror-dissonance-test-consent',
  blockCounterTableName: 'mirror-dissonance-test-block-counter'
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Oracle                           │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐  │
│  │ FP Store  │  │  Consent  │  │  Block Counter    │  │
│  │           │  │   Store   │  │                   │  │
│  └─────┬─────┘  └─────┬─────┘  └─────────┬─────────┘  │
│        │              │                   │            │
└────────┼──────────────┼───────────────────┼────────────┘
         │              │                   │
         ▼              ▼                   ▼
┌────────────────────────────────────────────────────────┐
│                   LocalStack (4566)                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │ DynamoDB │  │   SSM    │  │    S3    │  │  KMS  │ │
│  └──────────┘  └──────────┘  └──────────┘  └───────┘ │
└────────────────────────────────────────────────────────┘
```

## Troubleshooting

### LocalStack not starting

```bash
# Check Docker is running
docker ps

# Check LocalStack logs
docker logs phase-mirror-localstack

# Restart LocalStack
docker-compose -f localstack-compose.yml restart
```

### Tests failing with connection errors

```bash
# Verify LocalStack endpoint
curl http://localhost:4566/_localstack/health

# Check if tables exist
aws dynamodb list-tables --endpoint-url http://localhost:4566 --region us-east-1
```

### SSM parameter not found

```bash
# List parameters
aws ssm describe-parameters --endpoint-url http://localhost:4566 --region us-east-1

# Re-run setup script
./test-harness/localstack/setup-infra.sh
```

## Production Deployment Notes

When deploying to production:

1. **Remove endpoint parameter** - The Oracle will use default AWS endpoints
2. **Configure IAM roles** - Grant appropriate permissions to Lambda/ECS roles
3. **Enable encryption** - Use KMS for DynamoDB encryption at rest
4. **Set up alarms** - Monitor SSM parameter access and DynamoDB performance
5. **Configure TTL** - Enable TTL on DynamoDB tables for automatic cleanup
6. **Implement nonce rotation** - Establish a rotation schedule with grace periods

## Next Steps

1. Add more comprehensive FP Store operation tests
2. Implement drift detection baseline verification
3. Add stress tests for circuit breaker behavior
4. Test nonce rotation with expired cache scenarios
5. Add metrics collection during tests

## References

- [LocalStack Documentation](https://docs.localstack.cloud/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [Mirror Dissonance ADR-004](../../packages/mirror-dissonance/src/adr/004-fp-calibration-service.md)
