# L0 Invariants Reference

## Overview

L0 invariants are **foundation-tier validation checks** that:
- Run in <100ns (p99 latency target)
- Are **always-on** (cannot be disabled)
- Enforce non-negotiable governance rules
- Fail-closed (validation failure = block)

Source: `packages/mirror-dissonance/src/l0-invariants/`

---

## validate_l0_invariants MCP Tool

The `validate_l0_invariants` MCP tool exposes Phase Mirror's L0 invariants validation to GitHub Copilot agents, enabling code generation time enforcement of foundation-tier governance rules.

### Usage

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "schemaVersion": "1.0:f7a8b9c0",
    "permissionBits": 4095,
    "driftMagnitude": 0.15,
    "nonce": {
      "value": "nonce-value",
      "issuedAt": 1706745600000
    },
    "contractionWitnessScore": 1.0
  }
}
```

### Response Format

```json
{
  "success": true,
  "timestamp": "2026-02-01T07:48:00.000Z",
  "requestId": "req-123",
  "validation": {
    "passed": true,
    "decision": "ALLOW",
    "failedChecks": [],
    "checkResults": {
      "L0-001 (Schema Hash)": {
        "passed": true,
        "description": "Schema version and hash integrity"
      },
      "L0-002 (Permission Bits)": {
        "passed": true,
        "description": "GitHub Actions permissions follow least privilege"
      },
      "L0-003 (Drift Magnitude)": {
        "passed": true,
        "description": "Changes within safety thresholds"
      },
      "L0-004 (Nonce Freshness)": {
        "passed": true,
        "description": "Cryptographic nonce is fresh and valid"
      },
      "L0-005 (Contraction Witness)": {
        "passed": true,
        "description": "State coherence validated"
      }
    },
    "performance": {
      "latencyNs": 103904,
      "latencyMs": 0,
      "target": "p99 < 100ns"
    },
    "context": {}
  },
  "message": "All L0 invariants passed - state transition is valid"
}
```

---

## L0-001: Schema Hash Integrity

**Purpose**: Ensure configuration and report schemas haven't been tampered with.

**Validation Logic**:
- Parses `schemaVersion` in format `"version:hash"`
- Compares against expected values: `1.0:f7a8b9c0`
- Both version and hash must match exactly

**Use Cases**:
- Detect unauthorized schema modifications
- Prevent report tampering
- Ensure config integrity

**Failure Impact**: BLOCK (critical security violation)

**Example**:
```json
{
  "schemaVersion": "1.0:f7a8b9c0"  // Valid
}
```

---

## L0-002: Permission Bits

**Purpose**: Validate GitHub Actions permissions follow principle of least privilege.

**Validation Logic**:
- Checks permission bitfield (16-bit integer, 0-65535)
- Reserved bits 12-15 must be 0
- Bits 0-11 represent defined permissions

**Use Cases**:
- Prevent GitHub Actions permission escalation
- Enforce least privilege principle
- Detect excessive scopes

**Failure Impact**: BLOCK (ADR-001, ADR-003 violation)

**Example**:
```json
{
  "permissionBits": 4095  // 0b0000111111111111 (valid - no reserved bits)
}
```

---

## L0-003: Drift Magnitude

**Purpose**: Ensure changes don't exceed safety thresholds compared to baseline.

**Validation Logic**:
- Drift must be in range [0.0, 0.3)
- Values >= 0.3 indicate dangerous drift
- Negative values are invalid

**Use Cases**:
- Detect sudden config changes
- Prevent accidental large-scale modifications
- Enforce gradual change policy

**Failure Impact**: WARN → manual review required

**Example**:
```json
{
  "driftMagnitude": 0.15  // Valid - below 0.3 threshold
}
```

---

## L0-004: Nonce Freshness

**Purpose**: Validate cryptographic nonces are recent and haven't expired.

**Validation Logic**:
- Nonce age = current time - `issuedAt`
- Age must be positive (not from future)
- Age must be < 3600000ms (1 hour)

**Use Cases**:
- Prevent replay attacks with stale nonces
- Enforce nonce rotation policy (ADR-005)
- Validate HMAC signatures

**Failure Impact**: BLOCK (security violation)

**Example**:
```json
{
  "nonce": {
    "value": "unique-nonce-value",
    "issuedAt": 1706745600000  // Unix timestamp in milliseconds
  }
}
```

---

## L0-005: Contraction Witness

**Purpose**: Validate state coherence is maintained.

**Validation Logic**:
- Score must be exactly 1.0
- Represents perfect state coherence
- Any value other than 1.0 indicates incoherence

**Use Cases**:
- Ensure legitimate state transitions
- Validate system coherence
- Detect anomalous states

**Failure Impact**: BLOCK (governance violation)

**Example**:
```json
{
  "contractionWitnessScore": 1.0  // Must be exactly 1.0
}
```

---

## Performance Targets

| Invariant | Target Latency (p99) | Typical Latency |
|-----------|---------------------|-----------------|
| Schema Hash | <50ns | 12ns |
| Permission Bits | <100ns | 45ns |
| Drift Magnitude | <75ns | 38ns |
| Nonce Freshness | <60ns | 22ns |
| Contraction Witness | <100ns | 67ns |
| **Overall L0 Suite** | **<100ns p99** | **All invariants combined** |

Source: `docs/benchmarks/L0_BENCHMARK_REPORT.md`

---

## Integration with Oracle

L0 invariants run **before** rule evaluation:

```
Input Artifacts
  ↓
L0 Invariants Check (fail-closed) ← validate_l0_invariants tool
  ↓ (all pass)
Rule Registry Evaluation
  ↓
FP Store Filtering
  ↓
Circuit Breaker
  ↓
Report Generation
```

If any L0 invariant fails → immediate BLOCK, no further processing.

---

## Configuration

L0 invariants have **no user configuration** - they are always enabled.

Thresholds are hardcoded:
- **Drift magnitude**: 0.3 (30%)
- **Nonce max age**: 3600000ms (1 hour)
- **Contraction witness**: 1.0 (exact)

**Rationale** (ADR-003): Foundation checks must be consistent and predictable.

---

## Error Handling

### Invalid Input

```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": [
    {
      "path": ["permissionBits"],
      "message": "Number must be greater than or equal to 0"
    }
  ]
}
```

### Execution Failure

```json
{
  "success": false,
  "error": "L0 validation execution failed",
  "code": "EXECUTION_FAILED",
  "message": "Error message here",
  "timestamp": "2026-02-01T07:48:00.000Z"
}
```

---

## Examples

### Example 1: All Checks Pass

```javascript
const input = {
  schemaVersion: "1.0:f7a8b9c0",
  permissionBits: 4095,  // 0b0000111111111111
  driftMagnitude: 0.15,
  nonce: {
    value: "nonce-" + Date.now(),
    issuedAt: Date.now()
  },
  contractionWitnessScore: 1.0
};

// Result: decision = "ALLOW", passed = true
```

### Example 2: Schema Hash Failure

```javascript
const input = {
  schemaVersion: "1.0:wronghash",  // ❌ Invalid hash
  permissionBits: 4095,
  driftMagnitude: 0.15,
  nonce: {
    value: "nonce-" + Date.now(),
    issuedAt: Date.now()
  },
  contractionWitnessScore: 1.0
};

// Result: decision = "BLOCK", failedChecks = ["schema_hash"]
```

### Example 3: Multiple Failures

```javascript
const input = {
  schemaVersion: "1.0:wronghash",  // ❌ Fail 1
  permissionBits: 65535,           // ❌ Fail 2 (reserved bits set)
  driftMagnitude: 0.5,             // ❌ Fail 3 (above threshold)
  nonce: {
    value: "old",
    issuedAt: Date.now() - 7200000 // ❌ Fail 4 (2 hours old)
  },
  contractionWitnessScore: 0.8     // ❌ Fail 5 (not 1.0)
};

// Result: decision = "BLOCK", failedChecks = [all 5 checks]
```

---

## Testing

Run the L0 invariants tests:

```bash
cd packages/mcp-server
pnpm test validate-l0-invariants
```

The validate-l0-invariants test suite includes 14 test cases covering:
- Input validation
- Individual invariant checks
- Multiple failure scenarios
- Performance metrics
- Error handling

All tests in the mcp-server package (24 total) should pass.

---

## Related Documentation

- [ADR-003: Hierarchical PMD Compute](../../docs/adr/ADR-003-hierarchical-pmd-compute.md)
- [ADR-005: Nonce Rotation & Fail-Closed Availability](../../docs/adr/ADR-005-nonce-rotation.md)
- [L0 Benchmark Report](../../docs/benchmarks/L0_BENCHMARK_REPORT.md)
- [L0 Invariants Implementation](../mirror-dissonance/src/l0-invariants/)
