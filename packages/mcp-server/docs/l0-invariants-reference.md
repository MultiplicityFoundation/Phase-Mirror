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

**New in v2**: The tool now supports a flexible API with optional, selective checking of individual invariants, file-based validation, and configurable thresholds.

### Usage - Flexible API

The tool accepts multiple optional parameters and checks only what you provide:

#### Example 1: Drift Magnitude Check

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "driftCheck": {
      "currentMetric": { "name": "violations", "value": 120 },
      "baselineMetric": { "name": "violations", "value": 100 },
      "threshold": 0.5
    }
  }
}
```

#### Example 2: Schema Hash Validation (File-Based)

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "schemaFile": "./schemas/dissonance-report.schema.json",
    "expectedSchemaHash": "f7a8b9c0"
  }
}
```

#### Example 3: Workflow Permission Check

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "workflowFiles": [
      ".github/workflows/ci.yml",
      ".github/workflows/deploy.yml"
    ]
  }
}
```

#### Example 4: Multiple Checks with Selective Filtering

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "checks": ["drift_magnitude", "nonce_freshness"],
    "driftCheck": {
      "currentMetric": { "name": "violations", "value": 120 },
      "baselineMetric": { "name": "violations", "value": 100 }
    },
    "nonceValidation": {
      "nonce": "nonce-abc123",
      "timestamp": "2026-02-01T08:00:00.000Z",
      "maxAgeSeconds": 3600
    }
  }
}
```

### Response Format

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-123",
  "validation": {
    "passed": true,
    "decision": "ALLOW",
    "checksPerformed": 2,
    "results": [
      {
        "invariantId": "L0-003",
        "invariantName": "drift_magnitude",
        "passed": true,
        "message": "Drift 20.0% within acceptable range",
        "evidence": {
          "drift": 0.2,
          "threshold": 0.5,
          "current": { "name": "violations", "value": 120 },
          "baseline": { "name": "violations", "value": 100 }
        },
        "latencyNs": 45320
      },
      {
        "invariantId": "L0-004",
        "invariantName": "nonce_freshness",
        "passed": true,
        "message": "Nonce fresh (age: 120.5s)",
        "evidence": {
          "age": 120.5,
          "maxAge": 3600
        },
        "latencyNs": 28910
      }
    ],
    "failedChecks": [],
    "performance": {
      "totalLatencyMs": "1.245",
      "individualLatenciesNs": [
        { "check": "drift_magnitude", "latencyNs": 45320 },
        { "check": "nonce_freshness", "latencyNs": 28910 }
      ],
      "target": "p99 < 100ns per check"
    }
  },
  "message": "All 2 L0 invariant checks passed"
}
```

### Input Parameters

All parameters are **optional**. Provide only the checks you want to perform:

| Parameter | Type | Description |
|-----------|------|-------------|
| `checks` | `string[]` | Optional filter to only run specific checks: `schema_hash`, `permission_bits`, `drift_magnitude`, `nonce_freshness`, `contraction_witness` |
| `schemaFile` | `string` | Path to schema file for hash validation |
| `expectedSchemaHash` | `string` | Expected SHA-256 hash (first 8 chars) |
| `workflowFiles` | `string[]` | GitHub Actions workflow files to check |
| `driftCheck` | `object` | Drift magnitude comparison parameters |
| `nonceValidation` | `object` | Nonce freshness check parameters |
| `contractionCheck` | `object` | FPR contraction witness parameters |

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

The flexible API allows configurable thresholds per check:

- **Drift magnitude threshold**: Configurable (default: 0.5 = 50%)
- **Nonce max age**: Configurable (default: 3600s = 1 hour)
- **Contraction witness min events**: Configurable (default: 10 events)

**Example with custom thresholds**:
```json
{
  "driftCheck": {
    "currentMetric": { "name": "violations", "value": 120 },
    "baselineMetric": { "name": "violations", "value": 100 },
    "threshold": 0.3
  },
  "nonceValidation": {
    "nonce": "nonce-abc",
    "timestamp": "2026-02-01T08:00:00Z",
    "maxAgeSeconds": 7200
  },
  "contractionCheck": {
    "previousFPR": 0.15,
    "currentFPR": 0.10,
    "witnessEventCount": 20,
    "minRequiredEvents": 15
  }
}
```

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

### Example 1: Drift Magnitude Check Only

```javascript
const input = {
  driftCheck: {
    currentMetric: { name: "violations", value: 110 },
    baselineMetric: { name: "violations", value: 100 },
    threshold: 0.5
  }
};

// Result: decision = "ALLOW", checksPerformed = 1, drift = 10%
```

### Example 2: Workflow Permission Check (File-Based)

```javascript
const input = {
  workflowFiles: [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml"
  ]
};

// Checks each workflow file for excessive permissions
// Result: decision = "ALLOW" or "BLOCK" based on permissions found
```

### Example 3: Multiple Checks with Selective Filter

```javascript
const input = {
  checks: ["drift_magnitude", "nonce_freshness"],  // Only run these two
  driftCheck: {
    currentMetric: { name: "violations", value: 150 },
    baselineMetric: { name: "violations", value: 100 },
    threshold: 0.3  // 30% threshold
  },
  nonceValidation: {
    nonce: "nonce-abc123",
    timestamp: new Date().toISOString(),
    maxAgeSeconds: 3600
  },
  // This would be ignored due to checks filter:
  contractionCheck: {
    previousFPR: 0.15,
    currentFPR: 0.10,
    witnessEventCount: 5
  }
};

// Result: Only drift_magnitude and nonce_freshness are checked
// checksPerformed = 2
```

### Example 4: Schema Hash with File

```javascript
const input = {
  schemaFile: "./schemas/dissonance-report.schema.json",
  expectedSchemaHash: "f7a8b9c0"  // First 8 chars of SHA-256
};

// Reads the file, computes hash, compares
// Result: decision = "ALLOW" or "BLOCK" based on hash match
```

### Example 5: Contraction Witness Check

```javascript
const input = {
  contractionCheck: {
    previousFPR: 0.20,
    currentFPR: 0.12,  // FPR decreased by 8%
    witnessEventCount: 15,  // Need evidence for decrease
    minRequiredEvents: 10
  }
};

// Validates that FPR decrease has sufficient reviewed evidence
// Result: decision = "ALLOW" (sufficient events)
```

---

## Testing

Run the L0 invariants tests:

```bash
cd packages/mcp-server
pnpm test validate-l0-invariants
```

The validate-l0-invariants test suite includes 16 test cases covering:
- Input validation
- Individual invariant checks (all 5 types)
- File-based schema and workflow validation
- Multiple failure scenarios
- Performance metrics
- Selective check filtering
- Error handling

All tests in the mcp-server package (24 total) should pass.

---

## Related Documentation

- [ADR-003: Hierarchical PMD Compute](../../docs/adr/ADR-003-hierarchical-pmd-compute.md)
- [ADR-005: Nonce Rotation & Fail-Closed Availability](../../docs/adr/ADR-005-nonce-rotation.md)
- [L0 Benchmark Report](../../docs/benchmarks/L0_BENCHMARK_REPORT.md)
- [L0 Invariants Implementation](../mirror-dissonance/src/l0-invariants/)
