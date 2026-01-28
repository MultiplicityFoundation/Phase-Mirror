# L0 Invariants

Foundation-tier validation for Phase Mirror state transitions.

## Overview

L0 invariants are always-on, low-cost checks that run on every state transition. They catch critical failures (schema corruption, permission violations, nonce expiry) before expensive L1 checks run.

**Design Principle:** L0 checks should be so cheap that running them is always better than not running them.

## The Five Checks

| Check | Purpose | Cost Target |
|-------|---------|-------------|
| **Schema Hash** | Detect configuration corruption | <10ns |
| **Permission Bits** | Prevent unauthorized capability elevation | <1ns |
| **Drift Magnitude** | Catch gradual system degradation | <1ns |
| **Nonce Freshness** | Prevent replay attacks | <1ns |
| **Contraction Witness** | Validate state coherence | <1ns |

**Total Target:** <100ns p99 latency

## Usage

```typescript
import { checkL0Invariants, createValidState, State } from './index.js';

// Create a state to validate
const state: State = {
  schemaVersion: '1.0:f7a8b9c0',
  permissionBits: 0b0000111111111111,
  driftMagnitude: 0.15,
  nonce: {
    value: 'nonce-abc123',
    issuedAt: Date.now(),
  },
  contractionWitnessScore: 1.0,
};

// Run L0 checks
const result = checkL0Invariants(state);

if (!result.passed) {
  console.error('L0 violation detected:', result.failedChecks);
  console.error('Context:', result.context);
  throw new InvariantViolationError(
    'Foundation check failed',
    result.failedChecks,
    result.context
  );
}

console.log('L0 checks passed in', result.latencyNs, 'nanoseconds');
```

## Integration with State Machine

L0 checks should be called at exactly one place: the state transition function.

```typescript
async function applyStateTransition(newState: State) {
  // First: Verify foundation
  const l0Result = checkL0Invariants(newState);
  if (!l0Result.passed) {
    logger.error('L0 violation', { failedChecks: l0Result.failedChecks });
    throw new InvariantViolationError('Foundation check failed', 
                                      l0Result.failedChecks, 
                                      l0Result.context);
  }
  
  // Only if foundation is solid, proceed to application logic
  await applyToDatabase(newState);
  await publishEvent('state_transition', newState);
}
```

This ensures:
1. Every state is validated
2. Violations are caught before persistence
3. Errors are logged with full context

## Testing

Run unit tests:
```bash
# Tests are excluded from build
# Run with a test framework like Jest or Vitest (not yet configured)
```

Run benchmark:
```bash
node packages/mirror-dissonance/src/l0-invariants/__tests__/benchmark-standalone.cjs
```

Expected output:
```
L0 INVARIANTS BENCHMARK RESULTS
Iterations: 100,000
P99: ~1,300ns (target: <100ns)
```

See [docs/benchmarks/L0_BENCHMARK_REPORT.md](/docs/benchmarks/L0_BENCHMARK_REPORT.md) for detailed results and analysis.

## Design Decisions

### Why These Five Checks?

**Schema Hash:** Detects configuration corruption (wrong version, missing fields, type mismatches). Configuration bugs are silent and catastrophic - catch them immediately.

**Permission Bits:** Prevents privilege escalation. Reserved bits (12-15) are for future use. If they're set, it's either a bug or an attack.

**Drift Magnitude:** Measures divergence from expected behavior. Drift > 0.3 means something is wrong (miscalibration, rule rot, or attack). Escalate to L1.

**Nonce Freshness:** Prevents replay attacks. Nonces expire after 1 hour (see ADR-005). Expired nonces are rejected immediately.

**Contraction Witness:** Validates state coherence. If the cached witness is invalid (score ≠ 1.0), the state might be incoherent. Escalate to L1 for deep check.

### Why Fail-Closed?

L0 violations **halt execution**. We don't log-and-continue because:
- Silent failures are invisible until exploited
- Foundation violations indicate serious problems (corruption, attack, misconfiguration)
- Better to fail loudly and investigate than to proceed with bad state

### Why No Allocations?

Allocations trigger garbage collection, which adds latency variability. L0 checks use:
- Stack-only operations (no `new`, no array/object construction)
- Primitive types (numbers, booleans)
- Inline comparisons (no function calls)

This keeps latency predictable and low.

## Performance Targets

| Metric | Target | Actual (Node.js) | Status |
|--------|--------|------------------|--------|
| Mean   | <50ns  | ~400ns           | ⚠️ Above target |
| P99    | <100ns | ~1,300ns         | ⚠️ Above target |
| P999   | <500ns | ~3,600ns         | ⚠️ Above target |

**Analysis:** JavaScript/Node.js overhead (JIT, timing, V8) prevents hitting sub-100ns targets. This is acceptable for MVP. For production scale, consider Rust/WASM port.

See [docs/benchmarks/L0_BENCHMARK_REPORT.md](/docs/benchmarks/L0_BENCHMARK_REPORT.md) for full analysis.

## References

- **ADR-003:** [Hierarchical PMD Compute (L0/L1/L2)](/docs/adr/ADR-003-hierarchical-pmd-compute.md)
- **ADR-005:** [Nonce Rotation & Fail-Closed Availability](/docs/adr/ADR-005-nonce-rotation-fail-closed-availability.md)
- **Benchmark Report:** [docs/benchmarks/L0_BENCHMARK_REPORT.md](/docs/benchmarks/L0_BENCHMARK_REPORT.md)

## Future Work

- [ ] Add L0 integration to oracle.ts
- [ ] Add L0 metrics (pass rate, failure distribution)
- [ ] Set up CI benchmark tracking (detect regressions)
- [ ] Consider Rust/WASM port for <100ns p99
- [ ] Add L1 escalation logic
