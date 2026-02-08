# ADR-007: Test Tier Boundaries and Coverage Gate

## Status

Accepted

## Date

2026-02-07

## Context

Phase 2 introduced 500+ tests across unit and integration tiers. Three
conflicting expectations emerged:

1. **Coverage gate stability** — The 80% CI gate must not flake based on
   whether Docker/LocalStack is running.
2. **Adapter test identity** — Tests that mock `client.send` at the AWS SDK
   boundary look like integration tests but behave like unit tests.
3. **Error contract verification** — Phase 0 established "adapters throw,
   callers decide" (see ADR-006 / error-propagation contract), but the test
   suite must enforce this without coupling to cloud infrastructure.

The project also carries 173 skipped legacy tests referencing classes that no
longer exist post-adapter-refactor (`DynamoDBConsentStore`, `DynamoDBFPStore`,
`ConsentStore` direct imports). These inflate the test count without
exercising code.

### Tensions surfaced

| Tension | Resolution |
|---------|------------|
| Coverage accuracy vs. infra availability | Separate tiers; gate on unit only |
| Fast feedback vs. wire-protocol correctness | Mock-adapter tests run always; LocalStack tests run optionally |
| Legacy test preservation vs. honest metrics | Triage within 14 days; delete or migrate |

## Decision

### Three test tiers

| Tier | Location pattern | Runs in CI | Counts toward coverage gate | Requires infrastructure |
|------|-----------------|-----------|----------------------------|------------------------|
| **Unit (core)** | `src/**/tests/*.test.ts` (excluding `integration`) | Always | **Yes** | None |
| **Unit (adapter mock)** | `src/adapters/**/tests/*.test.ts` | Always | **Yes** | None — mocks `client.send` |
| **Integration (LocalStack)** | `src/tests/*.integration.test.ts` | Optional CI job (`test:integration`) | **No** | Docker + LocalStack on port 4566 |

### Coverage gate scope

Measured on:

```
packages/mirror-dissonance/src/**/*.ts
```

Excluded from measurement via `collectCoverageFrom` in `jest.config.cjs`:

```
!src/tests/*integration*
!adapters/aws/**   (covered by adapter-mock tier, not excluded)
!adapters/gcp/**   (covered by adapter-mock tier, not excluded)
```

**Clarification**: Adapter mock tests (Tier 2) _do_ count toward coverage.
They exercise marshalling, key schema, and error wrapping — all deterministic
without cloud calls. Only LocalStack integration tests (Tier 3) are excluded.

### Threshold

```javascript
// jest.config.cjs
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
  // Module-specific overrides
  './packages/mirror-dissonance/src/l0-invariants/': {
    branches: 85,
    functions: 90,
    lines: 85,
    statements: 85,
  },
  './packages/mirror-dissonance/src/redaction/': {
    branches: 80,
    functions: 85,
    lines: 80,
    statements: 80,
  },
},
```

### Error contract enforcement

All adapter tests MUST assert the throw pattern, not sentinel returns:

```typescript
// CORRECT — adapter throws structured error
await expect(store.recordEvent(event)).rejects.toThrow(FPStoreError);
await expect(store.recordEvent(event)).rejects.toMatchObject({
  code: expect.any(String),
  context: expect.objectContaining({ ruleId: 'MD-001' }),
});

// INCORRECT — testing for null/empty sentinel
const result = await store.getWindowByCount('MD-001', 50);
expect(result).toEqual([]);  // ← This pattern is banned
```

Adapter unit tests must include at least one test per public method that
asserts structured error propagation on infrastructure failure.

### Legacy test disposition

The 173 skipped tests (`describe.skip`) referencing removed classes must be
triaged within 14 days of this ADR's acceptance:

| Disposition | Criteria | Action |
|-------------|----------|--------|
| **Delete** | References class that no longer exists; logic is covered by new tests | Remove file or `describe` block |
| **Migrate** | Contains unique assertion logic not covered elsewhere | Rewrite against current interfaces |
| **Keep (skipped)** | Covers future functionality not yet implemented | Add `// TODO: enable when X lands` comment |

Target: reduce skipped count from 173 to ≤ 30.

### CI configuration

```yaml
# .github/workflows/ci.yml
jobs:
  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:ci
        # Runs: jest --ci --coverage --maxWorkers=2
        # Coverage gate enforced here; fails build on <80%

  test-integration:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    services:
      localstack:
        image: localstack/localstack:latest
        ports:
          - 4566:4566
        env:
          SERVICES: ssm,dynamodb,s3
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm test:integration
        env:
          AWS_ENDPOINT: http://localhost:4566
          AWS_ACCESS_KEY_ID: test
          AWS_SECRET_ACCESS_KEY: test
          AWS_REGION: us-east-1
```

### Package.json scripts

```json
{
  "scripts": {
    "test": "jest --passWithNoTests",
    "test:watch": "jest --watch",
    "test:ci": "jest --ci --coverage --maxWorkers=2 --passWithNoTests",
    "test:coverage": "jest --coverage --passWithNoTests",
    "test:unit": "jest --testPathIgnorePattern=integration --passWithNoTests",
    "test:integration": "jest --testPathPattern=integration --no-coverage"
  }
}
```

## Consequences

### Positive

- CI coverage gate is **stable** regardless of Docker availability.
- Adapter bugs caught by integration tier may not block merge, but they
  _will_ block deployment to staging (integration tests gate the
  `deploy-staging.yml` workflow).
- Coverage number reflects **business logic confidence**, not infrastructure
  confidence.
- Error contract is enforced structurally — new adapter tests that assert
  sentinel returns will fail code review against this ADR.

### Negative

- A bug in DynamoDB wire protocol (e.g., wrong `KeyConditionExpression`)
  could merge to `main` if only caught by integration tests. Mitigation:
  integration tests run on every push to `main`, and staging deployment
  requires them to pass.
- Module-specific thresholds create maintenance burden. Mitigation: only
  apply overrides to trust-critical modules (L0, redaction); others use
  global threshold.

### Neutral

- Legacy test triage is a one-time cost (~4 hours) that produces a more
  honest test suite.

## Compliance

- **L0 invariants**: This ADR does not modify L0 behavior. L0 tests are
  in the unit tier and always run.
- **ADR-003 (Compute Tiers)**: Test tiers map to compute tiers — L0 tests
  validate ≤100ns behavior; L1 tests validate ≤1ms adapter responses.
- **ADR-006 (Error Propagation)**: This ADR enforces the throw contract
  established in ADR-006 by requiring adapter tests to assert structured
  errors.

## References

- Phase 2 status assessment (2026-02-07)
- Error propagation contract discussion (2026-02-07)
- Jest coverage configuration: `jest.config.cjs` at repo root
- LocalStack integration: `localstack-compose.yml` or CI services block
