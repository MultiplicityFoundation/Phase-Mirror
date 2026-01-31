# Day 29-30: Integration and E2E Tests

This document describes the integration and end-to-end tests implemented for Phase 3, Days 29-30.

## Day 29: Nonce Rotation Integration Tests

### Overview
Integration tests for the nonce rotation system, testing multi-version nonce support, grace periods, fail-closed mode, and degraded mode.

### Location
- Test file: `packages/mirror-dissonance/src/__tests__/nonce-rotation.integration.test.ts`
- Implementation: `packages/mirror-dissonance/src/redaction/redactor-v3.ts`

### Prerequisites

1. **LocalStack**: Mock AWS services locally
   ```bash
   docker pull localstack/localstack:latest
   ```

2. **Dependencies**: Already included in package.json
   - `@aws-sdk/client-ssm`
   - `jest`
   - `ts-jest`

### Running Tests

#### Option 1: Using the helper script (recommended)
```bash
./scripts/run-integration-tests.sh
```

This script:
- Starts LocalStack automatically
- Waits for services to be ready
- Runs the integration tests
- Cleans up LocalStack after tests

#### Option 2: Manual setup
```bash
# Terminal 1: Start LocalStack
docker run -d --name localstack \
  -p 4566:4566 \
  -e SERVICES=ssm \
  localstack/localstack:latest

# Terminal 2: Run tests
cd packages/mirror-dissonance
pnpm test -- nonce-rotation.integration.test.ts

# Cleanup
docker stop localstack && docker rm localstack
```

### Test Scenarios

#### 1. Nonce Rotation with Grace Period
Tests the complete rotation flow from v1 to v2:
- Creates nonce v1
- Creates RedactedText using v1
- Creates nonce v2
- Loads both nonces (grace period)
- Verifies v1 text still validates
- New text uses v2
- Removes v1 from cache
- Verifies only v2 validates

#### 2. Fail-Closed Mode
Tests behavior when cache expires and SSM is unreachable:
- Loads nonce into cache
- Simulates cache expiry (61 minutes)
- Attempts to redact with expired cache
- Expects error: "cache expired"

#### 3. Degraded Mode
Tests behavior when SSM is unreachable but cache is valid:
- Loads nonce into cache
- Simulates SSM failure
- Attempts to reload nonce
- Uses cached nonce successfully
- Verifies degraded mode is logged

#### 4. Cache TTL Validation
Tests cache time-to-live behavior:
- Verifies cache is valid immediately after loading
- Verifies cache is valid after 59 minutes
- Verifies cache is invalid after 61 minutes

### Implementation Details

#### Redactor v3 Features
- **Multi-version support**: Can load and validate multiple nonce versions simultaneously
- **Grace period**: Allows validation of RedactedText created with old nonces
- **Cache management**: 1-hour TTL on cached nonces
- **Fail-closed**: Throws error if cache expired and SSM unreachable
- **Degraded mode**: Uses cache if SSM unreachable but cache is fresh

#### Cache Structure
```typescript
interface NonceCache {
  value: string;      // The nonce secret
  loadedAt: number;   // Timestamp when loaded
  version: string;    // Version identifier (v1, v2, etc.)
}
```

## Day 30: End-to-End Tests

### Overview
Complete CI/CD cycle test covering PR creation, checks, merge queue, and drift detection.

### Location
- Test file: `e2e/full-cycle.test.ts`
- Configuration: `e2e/jest.config.js`
- Documentation: `e2e/README.md`

### Prerequisites

1. **GitHub Token**: Personal access token with permissions:
   - `repo` (full control)
   - `workflow` (GitHub Actions)

2. **Test Repository**: A GitHub repository for testing
   - Default: `PhaseMirror/Phase-Mirror-Test`
   - Must have `main` branch
   - Should have workflows configured

### Running Tests

```bash
# Set GitHub token
export GITHUB_TOKEN="ghp_your_token_here"

# Optional: Configure test repository
export E2E_TEST_OWNER="PhaseMirror"
export E2E_TEST_REPO="Phase-Mirror-Test"

# Run tests
cd e2e
pnpm install
pnpm test
```

### Test Flow

1. **Create Branch**: Creates a timestamped test branch from main
2. **Create File**: Adds a test file to the branch
3. **Create PR**: Opens a pull request to main
4. **Wait for Checks**: Polls PR checks until all complete (5 min timeout)
5. **Verify Oracle**: Checks if Mirror Dissonance oracle ran (optional)
6. **Merge PR**: Merges the PR using squash merge
7. **Trigger Drift**: Manually triggers drift detection workflow
8. **Verify Drift**: Checks drift detection workflow completed
9. **Cleanup**: Closes PR (if needed) and deletes test branch

### Configuration

#### Timeouts
- Overall test: 10 minutes
- Check polling: 5 minutes
- Drift detection: 1 minute wait

#### Environment Variables
- `GITHUB_TOKEN` (required): GitHub personal access token
- `E2E_TEST_OWNER` (optional): Repository owner, default: `PhaseMirror`
- `E2E_TEST_REPO` (optional): Repository name, default: `Phase-Mirror-Test`
- `JEST_TIMEOUT` (optional): Override test timeout in milliseconds

### Cleanup

The test automatically cleans up resources in the `afterAll` hook:
- Closes PR if still open
- Deletes test branch

If a test fails mid-execution, you may need to manually clean up:
```bash
# Close PR
gh pr close <PR_NUMBER> --repo PhaseMirror/Phase-Mirror-Test

# Delete branch
gh api -X DELETE /repos/PhaseMirror/Phase-Mirror-Test/git/refs/heads/test-e2e-<timestamp>
```

## CI/CD Integration

### Integration Tests in CI

Add to `.github/workflows/ci.yml`:
```yaml
integration-tests:
  runs-on: ubuntu-latest
  services:
    localstack:
      image: localstack/localstack:latest
      ports:
        - 4566:4566
      env:
        SERVICES: ssm
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - uses: actions/setup-node@v4
    - run: pnpm install
    - run: pnpm test -- nonce-rotation.integration.test.ts
      working-directory: packages/mirror-dissonance
```

### E2E Tests in CI

Add to `.github/workflows/e2e.yml`:
```yaml
e2e-tests:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v2
    - uses: actions/setup-node@v4
    - run: pnpm install
      working-directory: e2e
    - run: pnpm test
      working-directory: e2e
      env:
        GITHUB_TOKEN: ${{ secrets.E2E_GITHUB_TOKEN }}
```

## Troubleshooting

### LocalStack Issues

**Port already in use:**
```bash
# Find and kill process on port 4566
lsof -ti:4566 | xargs kill -9

# Or use different port
docker run -p 4567:4566 ...
```

**LocalStack not ready:**
```bash
# Check LocalStack logs
docker logs localstack

# Check health endpoint
curl http://localhost:4566/_localstack/health
```

### E2E Test Issues

**Token permissions:**
- Ensure token has `repo` and `workflow` permissions
- Check token hasn't expired

**Checks not completing:**
- Verify workflows are configured in test repository
- Check workflow files for errors
- Increase timeout if needed

**Merge conflicts:**
- Ensure test repository main branch is clean
- Test may fail if previous test didn't clean up

## Best Practices

1. **Run integration tests before E2E**: Integration tests are faster
2. **Use dedicated test repository**: Never test against production
3. **Clean up manually after failures**: Check for leftover resources
4. **Monitor GitHub API rate limits**: Space out E2E test runs
5. **Keep test branches short-lived**: Delete after each test run

## Success Criteria

### Day 29: Integration Tests
- ✅ All 4 test scenarios pass
- ✅ Nonce rotation works with grace period
- ✅ Fail-closed mode throws on expired cache
- ✅ Degraded mode uses cache when SSM fails
- ✅ Cache TTL validation works correctly

### Day 30: E2E Tests
- ✅ Full cycle completes in under 10 minutes
- ✅ PR created successfully
- ✅ Checks complete
- ✅ PR merged
- ✅ Drift detection triggered (if configured)
- ✅ All resources cleaned up
