# Week 2: Testing Infrastructure & Critical Fixes

This document describes the testing infrastructure and critical fixes implemented for Phase 2 modules.

## Test Infrastructure (Days 8-10)

### Coverage Targets

| Module | Priority | Target Coverage | Status |
|--------|----------|----------------|--------|
| FP Store | CRITICAL | 85% | ✅ Achieved |
| Consent Store | CRITICAL | 85% | ✅ Tests Created |
| Nonce | CRITICAL | 90% | ⚠️ Integration only |
| Redaction | CRITICAL | 90% | ⚠️ Integration only |
| Block Counter | HIGH | 80% | ✅ Tests Created |
| L0 Invariants | HIGH | 80% | ✅ 100% Complete |
| Anonymizer | MEDIUM | 75% | ✅ Tests Created |
| Calibration Store | - | - | ✅ Tests Created |
| Ingest Handler | - | - | ✅ Tests Created |

### Test Files Created

#### 1. Consent Store Tests
**File:** `packages/mirror-dissonance/src/consent-store/__tests__/consent-store.test.ts`
**Lines:** 245

Tests:
- ✅ checkConsent() with explicit/implicit/none consent types
- ✅ Consent expiration validation
- ✅ recordConsent() with all fields
- ✅ hasValidConsent() checks
- ✅ Error handling for DynamoDB failures
- ✅ NoOpConsentStore implementation
- ✅ Factory function (createConsentStore)

Mock Strategy:
- Mocks `@aws-sdk/client-dynamodb` DynamoDBClient
- Mocks `@aws-sdk/lib-dynamodb` GetCommand and PutCommand
- Tests both success and error paths

#### 2. Block Counter Tests
**File:** `packages/mirror-dissonance/src/block-counter/__tests__/block-counter.test.ts`
**Lines:** 188

Tests:
- ✅ DynamoDB atomic increment with ADD operation
- ✅ TTL field setting on increment
- ✅ Counter retrieval with GetItemCommand
- ✅ InMemoryBlockCounter for testing
- ✅ TTL expiry and counter reset
- ✅ Multiple independent counter keys

Mock Strategy:
- Mocks DynamoDBClient, UpdateItemCommand, GetItemCommand
- Mocks marshall/unmarshall utilities
- Tests expiry with setTimeout

#### 3. Anonymizer Tests
**File:** `packages/mirror-dissonance/src/anonymizer/__tests__/anonymizer.test.ts`
**Lines:** 254

Tests:
- ✅ Salt loading from SSM Parameter Store
- ✅ Salt format validation (64 hex chars)
- ✅ HMAC-SHA256 anonymization
- ✅ Consistent hashing for same input
- ✅ Different hashes for different inputs
- ✅ Salt rotation month tracking
- ✅ Empty/invalid orgId validation
- ✅ Max length validation (255 chars)
- ✅ Auto-load salt on first use
- ✅ NoOpAnonymizer with test salt

Mock Strategy:
- Mocks `@aws-sdk/client-ssm` GetParameterCommand
- Uses real crypto.createHmac (no mock needed)
- Tests error paths for SSM failures

#### 4. Calibration Store Tests
**File:** `packages/mirror-dissonance/src/calibration-store/__tests__/calibration-store.test.ts`
**Lines:** 286

Tests:
- ✅ k-Anonymity enforcement (k≥10)
- ✅ aggregateFPsByRule() with sufficient orgs
- ✅ Rejection when k-anonymity not met
- ✅ False positive counting
- ✅ getRuleFPRate() with date ranges
- ✅ getAllRuleFPRates() filtering
- ✅ Empty result handling
- ✅ NoOpCalibrationStore implementation

Mock Strategy:
- Mocks DynamoDBDocumentClient
- Mocks QueryCommand and ScanCommand
- Generates test data with varying org counts

#### 5. Ingest Handler Tests
**File:** `packages/mirror-dissonance/src/ingest-handler/__tests__/ingest-handler.test.ts`
**Lines:** 286

Tests:
- ✅ Consent validation before ingestion
- ✅ Event rejection without consent
- ✅ Anonymization of orgId
- ✅ Timestamp randomization
- ✅ Unique event ID generation
- ✅ Consent type inclusion in stored event
- ✅ Batch processing (ingestBatch)
- ✅ Mixed success/failure in batch
- ✅ Error handling
- ✅ Invalid timestamp rejection

Mock Strategy:
- Mocks consent store, anonymizer, and FP store
- Uses jest.fn() for method mocking
- Validates call order and parameters

## Running Tests

### Prerequisites
```bash
# Install dependencies (from repository root)
pnpm install --frozen-lockfile
```

### Run All Tests
```bash
cd packages/mirror-dissonance
pnpm test
```

### Run with Coverage
```bash
cd packages/mirror-dissonance
pnpm test:coverage

# View HTML report
open coverage/lcov-report/index.html
```

### Run Specific Test File
```bash
cd packages/mirror-dissonance
pnpm test consent-store
pnpm test block-counter
pnpm test anonymizer
pnpm test calibration-store
pnpm test ingest-handler
```

## Critical Fixes (Days 11-12)

### Issue #2: Drift Baseline Loading

**Status:** ✅ Already Implemented

The drift detection workflow (`.github/workflows/drift-detection.yml`) includes:
- Baseline download from S3 with error handling
- Conditional baseline creation if not found
- Proper AWS OIDC authentication
- Issue creation on drift violations
- Artifact uploads for reports

Key features:
```yaml
- name: Download baseline from S3
  id: baseline
  run: |
    if aws s3 cp "s3://${BASELINE_BUCKET}/${BASELINE_KEY}" baseline.json; then
      echo "exists=true" >> $GITHUB_OUTPUT
    else
      echo "exists=false" >> $GITHUB_OUTPUT
    fi

- name: Run drift detection
  if: steps.baseline.outputs.exists == 'true'
  run: |
    pnpm --filter @mirror-dissonance/cli run start -- run \
      --mode drift \
      --baseline baseline.json \
      --output drift-report.json
```

### Issue #4: CLI Path Resolution

**Status:** ✅ Fixed

**File:** `packages/cli/src/index.ts`

Changes made:
1. **ESM-Compatible Path Resolution**
   ```typescript
   import { fileURLToPath } from 'url';
   import { dirname } from 'path';
   
   const __filename = fileURLToPath(import.meta.url);
   const __dirname = dirname(__filename);
   ```

2. **Added Dedicated Drift Command**
   ```typescript
   program
     .command('drift')
     .description('Run drift detection against baseline')
     .option('--baseline <file>', 'Baseline file for comparison')
     .option('--output <file>', 'Output file for drift report')
   ```

3. **Path Existence Validation**
   ```typescript
   const oraclePath = path.join(__dirname, '../../mirror-dissonance/dist/src/oracle.js');
   
   if (!fs.existsSync(oraclePath)) {
     console.error('Please run "pnpm build" in packages/mirror-dissonance first');
     process.exit(1);
   }
   ```

4. **Proper Error Handling**
   - Checks for missing build artifacts
   - Provides helpful error messages
   - Uses path.resolve() for output files

### Using the CLI

#### Create Baseline
```bash
cd packages/cli
pnpm start baseline --output baseline.json
```

#### Run Drift Detection
```bash
# Using the new drift command
pnpm start drift --baseline baseline.json --output drift-report.json

# Or using the run command
pnpm start run --mode drift --baseline baseline.json --output drift-report.json
```

#### Run Oracle Analysis
```bash
pnpm start run --mode pull_request --pr 123 --strict
```

## Test Patterns

### Mocking AWS SDK

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('MyStore', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBDocumentClient.from as jest.Mock) = jest.fn().mockReturnValue({
      send: mockSend,
    });
  });

  it('should retrieve data', async () => {
    mockSend.mockResolvedValue({
      Item: { id: '123', data: 'test' },
    });

    // Test your code...
  });
});
```

### Testing Error Paths

```typescript
it('should handle errors gracefully', async () => {
  mockSend.mockRejectedValue(new Error('Service unavailable'));

  const result = await store.getData('id');
  
  expect(result).toBeNull(); // or appropriate fallback
  // Verify error was logged, etc.
});
```

### Testing TTL Expiry

```typescript
it('should reset counter after TTL', async () => {
  await counter.increment('key', 1); // 1 second TTL
  
  await new Promise(resolve => setTimeout(resolve, 1100));
  
  const result = await counter.get('key');
  expect(result).toBe(0);
});
```

## Coverage Goals Achievement

To meet the 80-85% coverage targets:

1. **Run coverage report:**
   ```bash
   pnpm test:coverage
   ```

2. **Check coverage by module:**
   ```bash
   # View detailed report
   cat coverage/lcov-report/index.html
   ```

3. **Focus on critical paths:**
   - All public methods
   - Error handling paths
   - Edge cases (null, undefined, empty)
   - Validation logic

4. **Acceptable to skip:**
   - Console.log statements
   - Unreachable error paths
   - Type guards that TypeScript ensures

## CI Integration

Tests run automatically in CI:
- On pull requests
- On pushes to main
- In merge queue

Configuration: `.github/workflows/ci.yml`

```yaml
- name: Run tests
  run: pnpm test

- name: Check coverage
  run: pnpm test:coverage
```

## Next Steps

1. **For new modules:** Follow the patterns established in these test files
2. **For existing modules:** Add tests following same mock strategies
3. **Coverage monitoring:** Set up coverage thresholds in jest.config.js
4. **Integration tests:** Consider adding integration tests for full workflows

## References

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [AWS SDK v3 Mocking](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/unit-testing.html)
