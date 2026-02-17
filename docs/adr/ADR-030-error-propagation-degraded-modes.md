# ADR-030: Error Propagation & Degraded Modes Across Tiers

**Status**: Accepted  
**Date**: 2026-02-17  
**Decision Authority**: Core Library Lead + Product (business model), approved by Governance  
**Dependencies**: ADR-029 (versioning policy)

## Context

Current implementation allows **silent failures**:
- FP store returns `[]` on DynamoDB error (users see "no findings" when truth is "store unavailable")
- Rule evaluation logs errors but doesn't propagate (analysis appears to pass when it degraded)
- Nonce loading failures lack context (generic "failed to load" without parameter name)

This violates L0's **fail-closed posture**: non-negotiable governance boundaries must never silently degrade.

## Decision

### **L0 Invariants: Always Fail-Closed (All Tiers)**

L0 violations **always** result in:
- Exit code: `1` (hard failure)
- Output: `decision: "block"` with explicit L0 violation reason
- Behavior: User workflow blocked until fixed

**Rationale**: "Non-negotiable" is not contingent on pricing tier. L0 defines the **trust floor** — schema integrity, permission boundaries, drift magnitude, nonce freshness, contraction witness. These cannot be bypassed in free or paid tiers.

### **Infrastructure Failures: Tiered Handling**

When non-L0 infrastructure is unavailable (DynamoDB down, S3 unreachable, nonce SSM parameter missing):

| **Tier** | **Exit Code** | **Output** | **Ops Impact** |
|----------|---------------|-----------|----------------|
| **Free CLI** | `2` (degraded) | `meta.degraded: true` + reason (`FP_STORE_UNAVAILABLE`) | User sees warning, decides to proceed or retry |
| **Paid SaaS** | `1` (hard fail) | `decision: "block"` + ops alert escalation | Blocks workflow + pages on-call engineer |

**Rationale**: Free tier users have self-service responsibility for infrastructure; paid tier users have SLA guarantees. Differentiation lives in **operational support**, not in governance rule enforcement.

### **Error Contract Structure**

Typed errors defined in `packages/mirror-dissonance/src/lib/errors.ts`:

```typescript
export class OracleDegradedError extends Error {
  constructor(
    public readonly reason:
      | 'FP_STORE_UNAVAILABLE'
      | 'DRIFT_BASELINE_MISSING'
      | 'NONCE_PARAMETER_MISSING'
      | 'RULE_REGISTRY_LOAD_FAILED',
    public readonly canProceed: boolean,
    public readonly evidence: Record<string, unknown>,
    public readonly tier: 'community' | 'team' | 'business' | 'enterprise'
  ) {
    super(`Oracle degraded: ${reason}`);
    this.name = 'OracleDegradedError';
  }
}

export class L0InvariantViolation extends Error {
  constructor(
    public readonly invariantId: string,
    public readonly evidence: Record<string, unknown>
  ) {
    super(`L0 invariant violated: ${invariantId}`);
    this.name = 'L0InvariantViolation';
  }
}
```

### **CLI Handler Mapping**

All CLI commands (`analyze`, `validate`, `drift`, etc.) **must** map errors to exit codes:

| Error Type | Exit Code | Behavior |
|-----------|-----------|----------|
| `L0InvariantViolation` | `1` | Hard fail, always |
| `OracleDegradedError` (canProceed: true) | `2` | Warn, allow continuation |
| `OracleDegradedError` (canProceed: false) | `1` | Hard fail + escalate |
| Unknown `Error` | `1` | Fail-closed default |

### **No Silent `[]` Returns**

All store operations (`FPStore`, `ConsentStore`, `NonceStore`) **must**:

1. Throw typed errors on failure (DynamoDB timeout, SSM unavailable)
2. Never return `[]` or `null` to mask errors
3. Include structured evidence in error (table name, operation, timestamp)

## Consequences

### Breaking Changes

- All store operations now throw on failure (no silent `[]`)
- CLI commands exit non-zero (1 or 2) on any error
- Backward compat: Existing code expecting `[]` will need error handling

### Timeline

- ADR approval: Day 1 (today)
- Implementation: Days 2-8 (parallel with coverage + drift work)
- Validation: All error paths must have integration tests

### Success Criteria

- Zero code paths where storage/rule errors return `[]` or `null`
- All CLI commands handle `OracleDegradedError` and `L0InvariantViolation`
- Integration tests validate exit codes (0 = pass, 1 = block, 2 = degraded)

## Alternatives Rejected

**Option B: Warn-only in free tier for L0 violations**  
Rejected because: L0 is **definitionally non-negotiable**. If we allow bypassing L0 in the free tier, it's not L0 — it's "L0-ish when convenient." This destroys the semantic anchor that makes Phase Mirror's governance predictable.
