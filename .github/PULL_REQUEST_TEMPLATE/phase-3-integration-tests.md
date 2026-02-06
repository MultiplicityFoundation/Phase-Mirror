# Phase 3: Add Integration Test Suite

## Summary
This PR implements end-to-end integration testing using LocalStack for AWS service emulation, covering complete workflows including nonce rotation and false positive management.

## Phase 3 Checklist

Each commit builds on the previous to create a comprehensive integration test suite.

### Infrastructure (Commit 1)
- [ ] **Set up LocalStack test environment**: Configure DynamoDB, SSM, S3 emulation with docker-compose, setup/teardown scripts

### Workflow Tests (Commits 2-3)
- [ ] **Add nonce rotation integration test**: Test full nonce lifecycle, SSM parameter updates, rotation workflow
- [ ] **Add FP workflow integration test**: Test complete false positive flow, multi-component interaction, state transitions

## Test Coverage

### Nonce Rotation Test (Commit 2)
```typescript
describe('Nonce Rotation Integration', () => {
  it('should rotate nonce successfully', async () => {
    // 1. Initialize with nonce in SSM
    // 2. Trigger rotation
    // 3. Verify old nonce marked as rotated
    // 4. Verify new nonce is active
    // 5. Verify consent records reference correct nonce
  });
  
  it('should handle rotation failures gracefully', async () => {
    // Test rollback on failure
  });
});
```

### False Positive Workflow Test (Commit 3)
```typescript
describe('FP Workflow Integration', () => {
  it('should complete full FP lifecycle', async () => {
    // 1. Oracle detects violation
    // 2. User files FP claim with nonce
    // 3. System validates nonce
    // 4. FP recorded in DynamoDB
    // 5. Duplicate detection works
    // 6. Recent events query works
    // 7. Trust score updated
  });
  
  it('should reject invalid nonce', async () => {
    // Test expired/invalid nonce handling
  });
});
```

## LocalStack Setup

### Services Emulated
- **DynamoDB**: FP store, consent store tables
- **SSM**: Nonce parameter storage
- **S3**: Baseline storage for drift detection

### Docker Compose
```yaml
services:
  localstack:
    image: localstack/localstack:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=dynamodb,ssm,s3
      - DEBUG=1
    volumes:
      - "./localstack-data:/var/lib/localstack"
```

### Initialization Scripts
```bash
# scripts/setup-localstack.sh
- Create DynamoDB tables
- Initialize SSM parameters
- Upload S3 baselines
- Verify services ready
```

## Testing
- [ ] LocalStack containers start successfully
- [ ] All integration tests pass
- [ ] Tests clean up resources after completion
- [ ] Build succeeds after each commit
- [ ] Tests run in <5 minutes

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (tests pass, build succeeds)
- [ ] No scope creep (pure integration tests, no new features)
- [ ] All commits follow Conventional Commits format

## CI Integration

### GitHub Actions Workflow
```yaml
name: Integration Tests
on: [push, pull_request]
jobs:
  integration:
    runs-on: ubuntu-latest
    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
    steps:
      - name: Setup
        run: ./scripts/setup-localstack.sh
      - name: Run Tests
        run: pnpm test:integration
```

## Configuration

### Environment Variables
```bash
# Test-specific config
LOCALSTACK_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_REGION=us-east-1
DYNAMODB_TABLE_PREFIX=test_
SSM_PARAMETER_PREFIX=/test/
```

## Related Documentation
- `docs/INTEGRATION_TESTS.md` - Integration testing guide
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview
- `localstack-compose.yml` - LocalStack configuration

## Review Notes
This PR adds integration tests that verify multi-component workflows. Unlike unit tests that mock dependencies, these tests use LocalStack to emulate real AWS services, providing confidence that components work together correctly.

Each commit:
1. Sets up infrastructure → 2. Tests nonce rotation → 3. Tests FP workflow

## Breaking Changes
- [ ] None (tests only)

## Performance Impact
- [ ] None (tests run in CI, not production)
- [ ] Integration test suite runs in <5 minutes

## Benefits
- **End-to-End Validation**: Tests full workflows, not isolated components
- **Environment Parity**: LocalStack closely matches AWS behavior
- **Fast Feedback**: No need for real AWS resources in development
- **Cost Savings**: No AWS charges for testing

---
**Phase**: 3 (Integration Tests)  
**Branch**: `test/integration`  
**Target**: `main`  
**Depends On**: Phase 2 (`test/unit-coverage`)
