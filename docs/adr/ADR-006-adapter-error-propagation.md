# ADR-006: Adapter Error Propagation Contract

**Status:** Approved
**Date:** 2026-02-07
**Decision Authority:** Lead Architect
**Supersedes:** None
**Superseded by:** None
**Related:** ADR-005 (Nonce Rotation & Fail-Closed Availability)

---

## Context

Phase -1 adapters masked infrastructure failures by returning sentinel
values (`null`, `[]`, `0`) from their public methods. This created three
problems:

1. **Lost observability** — DynamoDB throttling, Secret Manager outages,
   and Firestore contention errors were swallowed silently.
2. **Conflated states** — callers could not distinguish "rule was never
   incremented" (valid 0) from "DynamoDB call failed" (error).
3. **Inconsistent error boundaries** — every caller re-implemented ad-hoc
   null-checks and fallback logic.

Phase 0 corrected this for `FPStoreError` (Point 0.4). This ADR
formalizes the pattern across **all** adapter interfaces and documents the
caller-side fail-closed vs fail-open contract.

---

## Decision

### L1 Adapter Layer: Always Throw Structured Errors

All adapter implementations **MUST** throw a typed error extending
`AdapterError` on infrastructure failure. They **MUST NOT** mask failures
by returning sentinel values.

```typescript
class AdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public context: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}
```

Error subclasses:

| Error Class          | Adapter                    | Codes |
|----------------------|----------------------------|-------|
| `SecretStoreError`   | Nonce / crypto material    | `NONCE_NOT_FOUND`, `READ_FAILED`, `MALFORMED_SECRET`, `ROTATION_FAILED`, `VERSIONS_FAILED` |
| `BlockCounterError`  | Circuit breaker counters   | `INCREMENT_FAILED`, `READ_FAILED`, `CIRCUIT_CHECK_FAILED` |
| `FPStoreError`       | FP event persistence       | `RECORD_FAILED`, `QUERY_FAILED`, `SCAN_FAILED` |
| `ConsentStoreError`  | Consent record operations  | *(planned)* |
| `BaselineStorageError` | Drift baseline I/O       | *(planned)* |

### L0 Business Logic Layer: Choose Fail-Closed or Fail-Open

Callers catch `AdapterError` subclasses and implement one of two policies:

**Fail-Closed** — use when the operation compromises trust invariants
without the data:

- Nonce retrieval → block Oracle initialization
- Consent check → deny consent (missing consent ≠ granted consent)
- FP event write → block = safe default

**Fail-Open** — use when infrastructure failure should not block
end-user operations:

- Block counter read → don't trip circuit breaker
- Block counter increment → log warning, continue
- FP rate query → return `fpr: 0, confidence: 'unavailable'`
- Baseline fetch → skip drift detection

### Special Case: Block Counter Fail-Open

The block counter's **business purpose** is fail-open (don't let counter
failures block PRs), but its **infrastructure contract** is
throw-on-failure (don't mask DynamoDB throttling).

The two layers serve different masters:

- **L1 (adapter):** Serves observability — expose all failure modes
- **L0 (circuit breaker logic):** Serves availability — degrade
  gracefully when counters fail

```typescript
// L1: Adapter throws
async getCount(ruleId: string, orgId: string): Promise<number> {
  try {
    return await this.dynamodb.getItem(...);
  } catch (error) {
    throw new BlockCounterError('Read failed', 'READ_FAILED', {
      ruleId, orgId, originalError: error,
    });
  }
}

// L0: Caller fails open
async shouldTripCircuitBreaker(ruleId: string, threshold: number): Promise<boolean> {
  try {
    const count = await this.blockCounter.getCount(ruleId, orgId);
    return count >= threshold;
  } catch (error) {
    logger.warn('Counter unavailable, circuit remains open', { ruleId, error });
    return false; // Fail-open
  }
}
```

This makes the fail-open decision **explicit and observable**. The
operator sees "circuit breaker counter failed, breaker stayed open" in
logs, not "counter returned 0, breaker didn't trip."

### Failure Modes Resolved

| Failure Mode          | Phase -1 Consequence        | Phase 0+ Consequence         |
|-----------------------|-----------------------------|------------------------------|
| Counter read fails    | `0` returned, invisible     | `BlockCounterError` thrown, logged, breaker stays open |
| Counter increment fails | Counter stuck at 0        | `BlockCounterError` thrown, increment retry possible |
| Counter in degraded state (throttling) | Silent undercounting | Explicit error with retry/backoff |
| Nonce not found       | `null` returned, crash later | `SecretStoreError` thrown, Oracle init blocked |

---

## Consequences

### Positive

- Infrastructure failures are observable across all adapters
- Callers make explicit fail-closed/fail-open decisions
- Circuit breaker counter failures no longer silently prevent breaker
  trips
- Structured error context enables distributed tracing, alerting, and
  retry logic
- Future adapters (`ConsentStoreError`, `BaselineStorageError`) follow
  the same pattern

### Negative

- Additional try/catch boilerplate in L0 callers
- Callers must be aware of which adapters throw which errors
- Testing requires error injection for failure paths

### Neutral

- No change to happy-path behavior — only failure handling is affected
- Error classes are lightweight (extend `Error` with `code` + `context`)

---

## Alternatives Considered

### 1. Return `Result<T, E>` instead of throwing

Pros: Explicit in type system, forces caller to handle errors.
Cons: Heavy API change, incompatible with existing adapter contract,
TypeScript `Result` requires library or custom type.

Rejected: throwing is idiomatic for Node.js infrastructure code and
aligns with how AWS SDK, GCP client libraries, and Firestore already
signal errors.

### 2. Keep sentinel returns, add health-check sideband

Pros: No caller changes needed.
Cons: Health checks are eventually consistent — throttled but working
DynamoDB returns stale 0s for minutes before health check catches up.
Root cause masking remains.

Rejected: health checks supplement but do not replace error propagation.

---

## Implementation

### Files Changed

- `packages/mirror-dissonance/src/adapters/errors.ts` — `BlockCounterError` class
- `packages/mirror-dissonance/src/adapters/types.ts` — JSDoc throws annotations
- `packages/mirror-dissonance/src/adapters/local/index.ts` — wrapped in try/catch
- `packages/mirror-dissonance/src/adapters/aws/block-counter.ts` — `BlockCounterError` wrapping
- `packages/mirror-dissonance/src/adapters/gcp/index.ts` — `BlockCounterError` wrapping
- `packages/mirror-dissonance/src/oracle.ts` — fail-open circuit breaker + increment

### Tests

- `packages/mirror-dissonance/src/adapters/__tests__/block-counter-errors.test.ts`
  - 14 tests validating error propagation, inheritance, context, and L0 patterns
- `packages/mirror-dissonance/src/adapters/__tests__/adapter-parity.test.ts`
  - Existing parity tests continue to pass

---

## References

- [SPEC-COMPUTE.md](../SPEC-COMPUTE.md) §Error Propagation Contract
- [ADR-005](ADR-005-nonce-rotation-fail-closed-availability.md) — Nonce fail-closed precedent
- Phase 0 Point 4 — FPStoreError introduction
