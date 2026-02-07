# Phase Mirror Computation Specification

> **Status**: Living document — updated as adapter and error contracts evolve.
> **Phase**: 0+ (initialized during Phase 0, maintained through all phases)

## Error Propagation Contract

The Phase Mirror framework uses a layered error model. Infrastructure
adapters (L1) throw structured errors; business-logic services (L0) catch
those errors and decide whether to fail-closed or fail-open based on trust
invariants.

### Design Rationale

Phase 0 (Point 4) replaced the Phase -1 "silent-fail" pattern across the
FP store:

```typescript
// Phase -1 — masked failure
catch (error) {
  logger.error('DynamoDB scan failed', error);
  return [];  // Silently fail
}

// Phase 0 — structured throw
catch (error) {
  throw new FPStoreError(
    'DynamoDB scan failed',
    'SCAN_FAILED',
    { tableName, params, originalError: error }
  );
}
```

The same principle now applies to **all** adapter interfaces. Returning
`null`, `[]`, or other sentinel values from an adapter masks the root cause
and forces every caller to re-implement error handling — violating DRY and
creating inconsistent error boundaries.

---

### L1 Adapter Layer (Infrastructure)

**Philosophy**: Adapters **MUST** throw structured errors on failure.
They **MUST NOT** mask failures by returning `null`, `[]`, or other
sentinel values.

**Rationale**:

- Infrastructure failures are **not** business-logic failures.
- Masking errors prevents observability, debugging, and proper failure
  handling.
- Callers at L0 (business logic) are better positioned to decide
  fail-closed vs fail-open.

**Error Structure**:

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

**Adapter Error Types**:

| Error Class            | Adapter                     | Example Codes                                      |
| ---------------------- | --------------------------- | -------------------------------------------------- |
| `FPStoreError`         | FP event persistence        | `RECORD_FAILED`, `QUERY_FAILED`, `SCAN_FAILED`     |
| `SecretStoreError`     | Nonce / cryptographic store | `NONCE_NOT_FOUND`, `READ_FAILED`, `MALFORMED_SECRET`, `ROTATION_FAILED`, `VERSIONS_FAILED` |
| `BlockCounterError`    | Circuit breaker counters    | `INCREMENT_FAILED`, `READ_FAILED`, `CIRCUIT_CHECK_FAILED` |
| `ConsentStoreError`    | Consent record operations   | *(planned)*                                        |
| `BaselineStorageError` | Drift baseline I/O          | *(planned)*                                        |

All adapter errors extend `AdapterError` and carry:

- `message` — Human-readable description.
- `code` — Machine-readable error code for programmatic handling.
- `context` — Structured metadata (source, parameter names, original
  error, etc.) for logging and tracing.

---

### L0 Business Logic Layer

**Philosophy**: Business logic **MUST** handle adapter errors and implement
**fail-closed** or **fail-open** behavior based on trust invariants.

#### Fail-Closed (trust-critical path)

Use when the operation compromises trust invariants without the data:

```typescript
async validateNonce(nonce: string): Promise<boolean> {
  try {
    const nonceConfig = await this.secretStore.getNonce();
    return this.verifyHMAC(nonce, nonceConfig.value);
  } catch (error) {
    // Cannot verify without master nonce → fail closed
    logger.error('Nonce validation failed', { error });
    return false;
  }
}
```

#### Fail-Open (analytics / non-critical path)

Use when the operation is informational and should not block core
workflows:

```typescript
async getFPRate(ruleId: string): Promise<FPRateResult> {
  try {
    const events = await this.fpStore.getFalsePositivesByRule(ruleId);
    return this.computeRate(events);
  } catch (error) {
    // FP analytics failure shouldn't block operations
    logger.warn('FP rate computation failed', { ruleId, error });
    return { ruleId, fpr: 0, confidence: 'unavailable' };
  }
}
```

#### Fail-Open (circuit breaker / availability-critical path)

Use when infrastructure failure must not block end-user operations:

```typescript
async shouldTripCircuitBreaker(
  ruleId: string,
  orgId: string,
  threshold: number,
): Promise<boolean> {
  try {
    const count = await this.blockCounter.getCount(ruleId, orgId);
    return count >= threshold;
  } catch (error) {
    // L0 decision: counter failure is NOT a reason to block PRs
    logger.warn('Circuit breaker counter unavailable, defaulting to open', {
      ruleId,
      error: error instanceof BlockCounterError ? error.context : error,
    });
    // Fail-open: don't trip breaker on infrastructure failure
    return false;
  }
}
```

This makes the fail-open decision **explicit and observable**. The operator
sees "circuit breaker counter failed, breaker stayed open" in logs, not
"counter returned 0, breaker didn't trip."

---

### Migration from Phase -1 Patterns

**Anti-Pattern** (Phase -1):

```typescript
// Adapter returns sentinel value — masked failure
async getNonce(): Promise<NonceConfig | null> {
  try {
    return await this.load();
  } catch {
    return null;
  }
}
```

**Current Pattern** (Phase 0+):

```typescript
// Adapter throws structured error — observable failure
async getNonce(): Promise<NonceConfig> {
  try {
    return await this.load();
  } catch (error) {
    throw new SecretStoreError('Load failed', 'READ_FAILED', { error });
  }
}
```

---

### Observability Benefits

Throwing structured errors enables:

| Capability              | Sentinel (`null`) | Structured Throw |
| ----------------------- | :---------------: | :--------------: |
| Root-cause visibility   |        ❌         |       ✅         |
| Distributed tracing     |        ❌         |       ✅         |
| Circuit-breaker hooks   |        ❌         |       ✅         |
| Structured logging      |        ❌         |       ✅         |
| Metric/alert on error   |        ❌         |       ✅         |
| Caller can still return `null` | ✅          |       ✅         |

> A caller that truly wants a `null` on failure can always `catch` and
> return `null` — but the adapter should never make that decision for it.

---

### Nonce Failure Severity

Nonce failures are **more critical** than FP store failures:

- **FP store failure** → analytics may be incomplete.
- **Nonce failure** → cryptographic operations silently fail, violating
  trust invariants.

For this reason, nonce retrieval errors **always** propagate to L0 callers
with full context.

---

## Interface Contracts

### SecretStoreAdapter

```typescript
import type { NonceConfig } from '../schemas/types.js';

interface SecretStoreAdapter {
  /** @throws SecretStoreError if retrieval fails or secret is missing/malformed */
  getNonce(): Promise<NonceConfig>;

  /** @throws SecretStoreError if retrieval fails */
  getNonces(): Promise<string[]>;

  /** @throws SecretStoreError if rotation fails */
  rotateNonce(newValue: string): Promise<void>;
}
```

`NonceConfig` provides structured metadata alongside the nonce value:

```typescript
interface NonceConfig {
  value: string;     // The nonce value
  loadedAt: string;  // ISO-8601 timestamp of when the nonce was loaded
  source: string;    // Origin identifier (e.g., 'local-file', 'aws-ssm', 'gcp-secret-manager')
}
```

Callers access the raw nonce via `nonceConfig.value` and can use `source`
and `loadedAt` for tracing and diagnostics.

### BlockCounterAdapter

```typescript
interface BlockCounterAdapter {
  /** @throws BlockCounterError on infrastructure failure */
  increment(ruleId: string, orgId: string): Promise<number>;

  /**
   * @returns The current count (0 if rule has never been incremented)
   * @throws BlockCounterError on infrastructure failure
   */
  getCount(ruleId: string, orgId: string): Promise<number>;

  /** @throws BlockCounterError on infrastructure failure */
  isCircuitBroken(ruleId: string, orgId: string, threshold: number): Promise<boolean>;
}
```

**Important distinction**:
- `getCount()` returns `0` successfully → rule has never been incremented
- `getCount()` throws `BlockCounterError` → infrastructure failure
  (DynamoDB throttle, Firestore unavailable, corrupt local store)

These are two different states. The sentinel-return pattern conflates them.

### FPStoreAdapter

```typescript
interface FPStoreAdapter {
  recordEvent(event: FPEvent): Promise<void>;
  getWindowByCount(ruleId: string, count: number): Promise<FPWindow>;
  getWindowBySince(ruleId: string, since: Date): Promise<FPWindow>;
  markFalsePositive(eventId: string, reviewedBy: string): Promise<void>;
  isFalsePositive(ruleId: string, findingId: string): Promise<boolean>;
  computeWindow(ruleId: string, events: FPEvent[]): FPWindow;
}
```

---

### Special Case: Fail-Open Callers

Some adapter operations serve availability-critical paths where
infrastructure failure must not block end-user operations.

**Examples**:
- **Block counter** (circuit breaker): Counter failure shouldn't
  permanently block PRs
- **FP rate query** (analytics): Missing FP data shouldn't block code
  reviews
- **Baseline fetch** (drift detection): Missing baseline disables
  detection but doesn't fail the scan

The adapter still throws — fail-open is a **caller decision**, not an
infrastructure decision. The adapter's job is to surface the failure; the
business logic's job is to decide whether to propagate it.

**Anti-pattern** (Phase -1):

```typescript
// Adapter masks failure — caller can't distinguish 0 from error
async increment(ruleId: string): Promise<number> {
  try {
    return await this.dynamodb.updateItem(...);
  } catch {
    return 0;  // Lie to caller
  }
}
```

**Correct pattern** (Phase 0+):

```typescript
// Adapter throws, caller decides
async increment(ruleId: string, orgId: string): Promise<number> {
  try {
    return await this.dynamodb.updateItem(...);
  } catch (error) {
    throw new BlockCounterError('Increment failed', 'INCREMENT_FAILED', {
      ruleId,
      orgId,
      originalError: error,
    });
  }
}

// Caller implements fail-open
try {
  const count = await counter.increment(ruleId, orgId);
  if (count >= threshold) this.tripCircuitBreaker(ruleId);
} catch (error) {
  logger.warn('Counter unavailable, circuit remains open', { ruleId, error });
  // Don't trip breaker on infrastructure failure
}
```

### Failure Domain Decision Matrix

| Failure Domain       | Adapter Behavior            | Caller Behavior                                  | Rationale |
| -------------------- | --------------------------- | ------------------------------------------------ | --------- |
| Nonce retrieval      | Throw `SecretStoreError`    | Fail-closed: block Oracle init                   | Cryptographic material missing = insecure operation |
| FP event write       | Throw `FPStoreError`        | Fail-closed: block = safe default                | Missing FP data biases decisions toward blocking (conservative) |
| FP event read        | Throw `FPStoreError`        | Fail-open: return `fpr: 0, confidence: 'unavailable'` | Analytics failure shouldn't block merge queues |
| Consent check        | Throw `ConsentStoreError`   | Fail-closed: deny consent                        | Missing consent ≠ granted consent |
| Block counter read   | Throw `BlockCounterError`   | Fail-open: return `false` (don't trip breaker)   | Counter failure shouldn't permanently block repos |
| Block counter increment | Throw `BlockCounterError` | Fail-open: log warning, continue                 | Increment failure is observed but non-blocking |
| Baseline read        | Throw `ObjectStoreError`    | Fail-open: skip drift detection                  | Missing baseline = no comparison possible, not a security failure |

---

## Decision Record

| Date       | Decision                                       | Rationale                                                  |
| ---------- | ---------------------------------------------- | ---------------------------------------------------------- |
| 2026-02-07 | BlockCounterAdapter throws instead of returning 0 | Distinguish "never incremented" (0) from "DynamoDB throttled" (error); fail-open is a caller decision |
| 2026-02-07 | getNonce() returns NonceConfig instead of string | Structured return provides source tracing and load timestamps |
| 2026-02-07 | SecretStoreAdapter throws instead of returning `null` | Align with Phase 0 FPStore pattern; nonce failures are trust-critical |
| Phase 0.4  | FPStoreError throws instead of returning `[]`  | "Masked critical failures can lead to incorrect decisions" |
