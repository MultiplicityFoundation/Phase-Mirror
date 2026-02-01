# Phase Mirror MCP Server

Model Context Protocol server that exposes Phase Mirror governance capabilities as callable tools for GitHub Copilot coding agent.

## Installation

### Global Installation (Recommended)

```bash
npm install -g @phase-mirror/mcp-server
```

### Local Development

```bash
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror/packages/mcp-server
pnpm install
pnpm build
```

## Configuration

### GitHub Copilot Integration

Add to your repository settings → Copilot → Coding Agent → MCP Configuration:

```json
{
  "mcpServers": {
    "phase-mirror": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@phase-mirror/mcp-server"],
      "env": {
        "AWS_REGION": "COPILOT_MCP_AWS_REGION"
      }
    }
  }
}
```

### Environment Variables

All configuration uses `COPILOT_MCP_` prefix (automatically provided by GitHub):

- `COPILOT_MCP_AWS_REGION` - AWS region (default: us-east-1)
- `COPILOT_MCP_FP_TABLE_NAME` - DynamoDB FP store table
- `COPILOT_MCP_CONSENT_TABLE_NAME` - DynamoDB consent store table
- `COPILOT_MCP_NONCE_PARAMETER_NAME` - SSM parameter for nonce
- `COPILOT_MCP_LOG_LEVEL` - Logging level (default: info)

## Available Tools

### analyze_dissonance

Run Mirror Dissonance protocol to detect inconsistencies across requirements, configs, code, and runtime.

**Input:**

```typescript
{
  files: string[];        // File paths to analyze
  context?: string;       // Optional issue/PR context
  mode?: "pull_request" | "issue" | "merge_group" | "drift";
}
```

**Output:**

```typescript
{
  success: boolean;
  analysis: {
    findings: Finding[];
    summary: Summary;
    decision: MachineDecision;
    adrReferences: string[];  // e.g., ["ADR-001", "ADR-004"]
  }
}
```

### `validate_l0_invariants`

Validate Phase Mirror's foundation-tier L0 invariants (non-negotiable governance checks).

#### When to Use

- **Pre-implementation**: Validate proposed changes against foundational rules
- **CI/CD gates**: Enforce L0 checks in deployment pipeline
- **Nonce rotation**: Validate cryptographic freshness after rotation
- **FPR audits**: Verify rule improvement claims with evidence
- **Drift detection**: Ensure changes don't exceed safety thresholds

#### L0 Invariants

| ID | Invariant | Target Latency | Severity |
|----|-----------|----------------|----------|
| L0-001 | Schema Hash Integrity | <50ns | Critical |
| L0-002 | Permission Bits | <100ns | Critical |
| L0-003 | Drift Magnitude | <75ns | High |
| L0-004 | Nonce Freshness | <60ns | Critical |
| L0-005 | Contraction Witness | <100ns | Critical |

**Performance Target**: <100ns p99 for all checks combined

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `checks` | `string[]` | ❌ | Specific invariants to validate |
| `schemaFile` | `string` | ❌ | Schema file path for hash validation |
| `expectedSchemaHash` | `string` | ❌ | Expected SHA-256 hash |
| `workflowFiles` | `string[]` | ❌ | Workflow files to check permissions |
| `driftCheck` | `object` | ❌ | Current vs baseline metric comparison |
| `nonceValidation` | `object` | ❌ | Nonce freshness validation |
| `contractionCheck` | `object` | ❌ | FPR decrease evidence validation |

**At least one validation input required.**

#### Output Structure

```typescript
{
  success: boolean;
  validation: {
    allPassed: boolean;
    checksRun: number;
    passed: number;
    failed: number;
    performanceNs: number;
    withinPerformanceTarget: boolean;
    
    results: Array<{
      invariantId: string;  // e.g., "L0-002"
      passed: boolean;
      message: string;
      severity?: "critical" | "high";
      evidence?: Record<string, unknown>;
      remediation?: string;
    }>;
    
    recommendations?: string[];
    report?: string;
  };
}
```

#### Example 3: Drift Detection

**Scenario**: Weekly baseline comparison - ensure no unauthorized large changes.

**Tool Call:**

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "driftCheck": {
      "currentMetric": {
        "name": "workflow_permission_score",
        "value": 85
      },
      "baselineMetric": {
        "name": "workflow_permission_score",
        "value": 100
      },
      "threshold": 0.2
    }
  }
}
```

**Response** (drift within threshold):

```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "results": [
      {
        "invariantId": "L0-003",
        "passed": true,
        "message": "Drift within acceptable range",
        "evidence": {
          "drift": 0.15,
          "threshold": 0.2
        }
      }
    ]
  }
}
```

#### Example 4: Nonce Rotation Validation

**Scenario**: After nonce rotation, validate new nonce is fresh.

**Tool Call:**

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "nonceValidation": {
      "nonce": "prod-nonce-v2-20260201",
      "timestamp": "2026-02-01T06:00:00Z",
      "maxAgeSeconds": 3600
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "results": [
      {
        "invariantId": "L0-004",
        "passed": true,
        "message": "Nonce fresh",
        "evidence": {
          "age": 120,
          "maxAge": 3600
        }
      }
    ]
  }
}
```

#### Example 5: FPR Contraction Witness

**Scenario**: Rule improvement claims lower FPR - validate with evidence.

**Tool Call:**

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "contractionCheck": {
      "previousFPR": 0.08,
      "currentFPR": 0.03,
      "witnessEventCount": 25,
      "minRequiredEvents": 10
    }
  }
}
```

**Response** (legitimate):

```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "results": [
      {
        "invariantId": "L0-005",
        "passed": true,
        "message": "FPR decrease validated with evidence",
        "evidence": {
          "decrease": 0.05,
          "eventCount": 25,
          "reviewed": 25
        }
      }
    ]
  }
}
```

**Response** (illegitimate - insufficient evidence):

```json
{
  "success": true,
  "validation": {
    "allPassed": false,
    "results": [
      {
        "invariantId": "L0-005",
        "passed": false,
        "message": "Insufficient evidence for FPR decrease",
        "severity": "critical",
        "evidence": {
          "decrease": 0.05,
          "eventCount": 3,
          "reviewed": 3
        },
        "remediation": "Provide at least 10 reviewed FP events to justify FPR decrease"
      }
    ]
  }
}
```

#### Example 6: Multi-Check Validation

**Scenario**: Comprehensive foundation check before production deployment.

**Tool Call:**

```json
{
  "name": "validate_l0_invariants",
  "arguments": {
    "workflowFiles": [".github/workflows/deploy.yml"],
    "nonceValidation": {
      "nonce": "prod-nonce-v2",
      "timestamp": "2026-02-01T05:00:00Z"
    },
    "driftCheck": {
      "currentMetric": { "name": "security_score", "value": 95 },
      "baselineMetric": { "name": "security_score", "value": 100 }
    }
  }
}
```

**Response:**

```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "checksRun": 3,
    "passed": 3,
    "failed": 0,
    "performanceNs": 87,
    "withinPerformanceTarget": true,
    "results": [
      { "invariantId": "L0-002", "passed": true },
      { "invariantId": "L0-003", "passed": true },
      { "invariantId": "L0-004", "passed": true }
    ],
    "recommendations": [
      "✅ All L0 invariants passed. Foundation governance checks satisfied."
    ],
    "report": "L0 Invariants Validation Report\n===...==="
  }
}
```

#### Performance Expectations

All L0 validations should complete in <100ns (p99 latency).

**Typical latencies:**

- Single check: 20-50ns
- Multiple checks (3-5): 60-90ns
- Full suite: <100ns

If performance degrades:

```json
{
  "validation": {
    "performanceNs": 250,
    "withinPerformanceTarget": false,
    "recommendations": [
      "⚠️  L0 validation took 250ns (target: <100ns). Performance degradation detected."
    ]
  }
}
```

**Action**: Investigate system load, check file I/O bottlenecks.

**Documentation:** See [L0 Invariants Reference](./docs/l0-invariants-reference.md) for detailed documentation.

## Testing

### Unit Tests

```bash
pnpm test
```

### MCP Inspector Testing

#### Quick Start

```bash
cd packages/mcp-server
./scripts/test-inspector.sh
```

This opens the MCP Inspector UI in your browser for interactive testing.

#### Automated Testing

```bash
cd packages/mcp-server
node scripts/run-inspector-tests.js
```

This runs all test cases from `test-cases/inspector-test-cases.json` and generates a report.

#### Documentation

- **[Testing Guide](./docs/testing-guide.md)**: Complete testing procedures for Day 6-7
- **[Test Cases](./test-cases/inspector-test-cases.json)**: Comprehensive test scenarios
- **[Test Log Template](./test-results/inspector-test-log.md)**: Manual testing documentation

### GitHub Copilot Integration

For production integration with GitHub Copilot coding agent, see:

- **[GitHub Copilot Integration Guide](./docs/github-copilot-integration.md)**: Complete setup instructions
- **[Testing Guide - Day 7](./docs/testing-guide.md#day-7-github-copilot-integration-testing)**: End-to-end integration testing

## Development

### Project Structure

```
packages/mcp-server/
├── src/
│   ├── index.ts              # Server entry point
│   ├── tools/                # Tool implementations
│   │   ├── analyze-dissonance.ts
│   │   └── validate-l0-invariants.ts
│   ├── utils/                # Utilities
│   │   ├── config.ts
│   │   └── logger.ts
│   └── types/                # TypeScript types
├── test/                     # Unit tests
├── scripts/                  # Testing and utility scripts
│   ├── test-inspector.sh     # Start MCP Inspector
│   └── run-inspector-tests.js # Automated test runner
├── test-cases/               # Test case definitions
│   └── inspector-test-cases.json
├── test-results/             # Test result templates
│   └── inspector-test-log.md
├── docs/                     # Documentation
│   ├── l0-invariants-reference.md
│   ├── testing-guide.md
│   └── github-copilot-integration.md
├── package.json
└── tsconfig.json
```

### Adding New Tools

1. Create tool file in `src/tools/your-tool.ts`
2. Define input schema with Zod
3. Implement `execute(args, context)` function
4. Export `toolDefinition` object
5. Register in `src/index.ts`
6. Add tests in `test/your-tool.test.ts`

## License

Apache 2.0 with Managed Service Restriction

See LICENSE for details.
