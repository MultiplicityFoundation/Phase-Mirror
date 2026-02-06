# Phase 2: Achieve 80% Unit Test Coverage

## Summary
This PR establishes comprehensive unit test coverage across the Mirror Dissonance core library, achieving the 80% threshold for branches, functions, lines, and statements.

## Phase 2 Checklist

Each commit adds test coverage for one module, incrementally building toward 80% coverage.

### Test Infrastructure (Commit 1)
- [ ] **Set up Jest configuration**: Configure Jest with TypeScript, coverage thresholds, test utilities, and mocking helpers

### Core Module Tests (Commits 2-5)
- [ ] **Add L0 invariants unit tests**: Test each invariant rule, edge cases, error conditions
- [ ] **Add FP store unit tests**: Test persistence operations, mock DynamoDB interactions, error handling scenarios  
- [ ] **Add consent store unit tests**: Test consent management, nonce validation logic, state transitions
- [ ] **Add redactor unit tests**: Test all redaction patterns, ensure no false positives/negatives

## Coverage Targets

Starting point (current):
```
Statements   : 0% 
Branches     : 0%
Functions    : 0%
Lines        : 0%
```

After Phase 2:
```
Statements   : 80% (minimum)
Branches     : 80% (minimum)
Functions    : 80% (minimum)
Lines        : 80% (minimum)
```

## Test Categories

### L0 Invariants Tests (`commit 2`)
- [ ] Rule MD-001: PMD file structural requirements
- [ ] Rule MD-002: Computational integrity scoring
- [ ] Rule MD-003: Trust plane validation
- [ ] Edge case: Empty input
- [ ] Edge case: Malformed PMD structure
- [ ] Error handling: Invalid rule configuration

### FP Store Tests (`commit 3`)
- [ ] `recordFalsePositive()`: Success, duplicate detection
- [ ] `getFalsePositivesForFinding()`: Query by finding ID
- [ ] `getRecentEvents()`: Time window filtering
- [ ] Error propagation: DynamoDB errors with context
- [ ] Nonce validation: Valid and expired nonces
- [ ] Edge case: Empty table

### Consent Store Tests (`commit 4`)
- [ ] `getConsentStatus()`: Verification state queries
- [ ] `recordConsent()`: Consent recording logic
- [ ] `validateNonce()`: Nonce validation rules
- [ ] State transitions: Pending → Verified → Trusted
- [ ] Error handling: SSM parameter failures
- [ ] Edge case: Invalid GitHub identity

### Redactor Tests (`commit 5`)
- [ ] Pattern matching: API keys, tokens, secrets
- [ ] PII redaction: Emails, IP addresses, names
- [ ] AWS credentials: Access keys, secret keys
- [ ] No false positives: Code samples, URLs, hex values
- [ ] Custom patterns: Organization-specific secrets
- [ ] Performance: Large text processing

## Testing Strategy

### Mocking
```typescript
// Mock DynamoDB for isolated unit tests
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({
    send: jest.fn()
  }))
}));
```

### Test Utilities (Commit 1)
```typescript
// test-utils/factories.ts
export const createMockFPEvent = (overrides?: Partial<FalsePositiveEvent>) => {...}
export const createMockFinding = (overrides?: Partial<Finding>) => {...}
export const createMockPMD = (overrides?: Partial<PMD>) => {...}
```

### Snapshot Testing
```typescript
// For complex object structures
expect(pmdResult).toMatchSnapshot();
```

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (tests pass, coverage increases)
- [ ] Coverage increases monotonically (never decreases between commits)
- [ ] All commits follow Conventional Commits format

## Coverage Report

After each commit, coverage is reported:

| Commit | Statements | Branches | Functions | Lines | Modules Covered |
|--------|-----------|----------|-----------|-------|-----------------|
| 1      | 5%        | 5%       | 5%        | 5%    | Test infrastructure |
| 2      | 25%       | 20%      | 25%       | 25%   | + L0 invariants |
| 3      | 50%       | 45%      | 50%       | 50%   | + FP store |
| 4      | 65%       | 60%      | 65%       | 65%   | + Consent store |
| 5      | 81%       | 82%      | 80%       | 81%   | + Redactor |

## Testing Tools
- **Framework**: Jest 29.x
- **TypeScript**: ts-jest for TypeScript support  
- **Mocking**: jest.mock() for AWS SDK, file system
- **Coverage**: Istanbul built into Jest
- **Assertions**: expect() with custom matchers

## Related Documentation
- `docs/TESTING.md` - Testing philosophy and guidelines
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview
- `jest.config.cjs` - Jest configuration with thresholds

## Review Notes
This PR adds only tests, not production code. Each commit focuses on one module's test coverage. Reviewers can verify:
1. Tests are comprehensive (happy path, edge cases, errors)
2. Mocks are appropriate (unit isolation)
3. Coverage increases with each commit
4. Tests are maintainable and well-documented

## Breaking Changes
- [ ] None (tests only)

## Performance Impact
- [ ] None (tests run in CI, not production)
- [ ] Test suite runs in <60 seconds

## CI Integration
- [ ] Coverage reported to Codecov
- [ ] PR comments show coverage delta
- [ ] Build fails if coverage drops below 80%
- [ ] Test results uploaded as artifacts

---
**Phase**: 2 (Unit Test Coverage)  
**Branch**: `test/unit-coverage`  
**Target**: `main`  
**Depends On**: Phase 1 (`refactor/adapter-layer`)
