# Testing Guide

## Philosophy

Phase Mirror uses a **fail-closed** testing philosophy:

- **Critical paths require 90%+ coverage** (L0 invariants, redaction, nonce)
- **Global coverage target: 80%**
- **Integration tests use LocalStack** (no live AWS)
- **Performance benchmarks run in CI**

## Test Structure

```
packages/
  mirror-dissonance/
    src/
      __tests__/
        setup.ts              # Global test setup
        test-utils.ts         # Shared utilities
      l0-invariants/
        __tests__/
          invariants.test.ts  # Unit tests
      fp-store/
        __tests__/
          dynamodb-store.test.ts
          integration.test.ts # LocalStack tests
```

## Writing Tests

### Unit Tests

```typescript
import { checkL0Invariants } from '../index';
import { createMockL0State } from '../../__tests__/test-utils';

describe('L0 Invariants', () => {
  it('should pass with valid state', () => {
    const state = createMockL0State();
    const result = checkL0Invariants(state);
    
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toHaveLength(0);
  });
  
  it('should fail with invalid schema hash', () => {
    const state = createMockL0State({
      schemaHash: 'wrong-hash'
    });
    
    const result = checkL0Invariants(state);
    
    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain('schema_hash');
  });
});
```

### Integration Tests

```typescript
import { DynamoDBFPStore } from '../dynamodb-store';

describe('FP Store Integration', () => {
  let store: DynamoDBFPStore;
  
  beforeAll(async () => {
    // Uses LocalStack endpoint from env
    store = await FPStore.create({
      tableName: 'test-fp-events',
      endpoint: process.env.LOCALSTACK_ENDPOINT
    });
  });
  
  it('should record and retrieve events', async () => {
    const event = createMockFPEvent();
    await store.recordEvent(event);
    
    const window = await store.getWindowByCount('MD-001', 10);
    expect(window.events).toContainEqual(
      expect.objectContaining({ eventId: event.eventId })
    );
  });
});
```

## Running Tests

### Local Development

```bash
# Unit tests only (fast)
pnpm test:unit

# With coverage
pnpm test:coverage

# Watch mode
pnpm test:watch

# Specific file
pnpm test -- l0-invariants
```

### Integration Tests

Requires LocalStack:

```bash
# Start LocalStack
docker-compose -f localstack-compose.yml up -d

# Setup test infrastructure
./test-harness/localstack/setup-infra.sh

# Run integration tests
pnpm test:integration

# Teardown
./test-harness/localstack/teardown.sh
```

## Coverage Analysis

```bash
# Generate coverage report
pnpm test:coverage

# View HTML report
open coverage/lcov-report/index.html

# Check if thresholds met
pnpm coverage:enforce
```

## Performance Benchmarks

Performance tests must meet targets:

- **L0 invariants:** <100ns p99
- **FP Store queries:** <50ms p99

```typescript
it('should meet L0 performance target', () => {
  const iterations = 1000;
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    checkL0Invariants(validState);
    const end = process.hrtime.bigint();
    times.push(Number(end - start));
  }
  
  times.sort((a, b) => a - b);
  const p99 = times[Math.floor(iterations * 0.99)];
  
  expect(p99).toBeLessThan(100);
});
```

## CI Integration

Coverage is enforced in GitHub Actions:

- Tests run on every PR
- Coverage must meet 80% threshold
- PR comments show coverage delta
- Badge updates on main branch

## Troubleshooting

### "Coverage below threshold"

1. Run `pnpm test:coverage:report`
2. Check `docs/internal/coverage-gaps.md` for prioritized gaps
3. Add tests for uncovered branches/functions
4. Re-run `pnpm coverage:enforce`

### "LocalStack not running"

```bash
docker ps | grep localstack
# If not running:
docker-compose -f localstack-compose.yml up -d
```

### "Tests timing out"

Increase timeout in jest.config.cjs:

```javascript
testTimeout: 30000  // 30 seconds
```
