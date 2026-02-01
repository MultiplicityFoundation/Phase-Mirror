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

Phase Mirror provides **5 production-ready MCP tools** for governance automation:

1. **analyze_dissonance** - Detect governance violations before implementation
2. **validate_l0_invariants** - Validate foundation-tier governance constraints
3. **check_adr_compliance** - Check compliance with architectural decisions
4. **query_fp_store** - Query and manage false positives
5. **check_consent_requirements** - Verify consent for sensitive data access

---

### `analyze_dissonance`

Run Phase Mirror's Mirror Dissonance protocol to detect governance violations before code implementation.

#### When to Use

- **Before implementing features**: Check if approach violates governance rules
- **During PR review**: Validate changes meet organizational constraints
- **Drift detection**: Compare current state to approved baseline
- **Planning**: Understand architectural constraints from ADRs

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | `string[]` | ✅ | File paths to analyze (relative to repo root) |
| `context` | `string` | ❌ | Optional issue description or PR context (format: "owner/repo") |
| `mode` | `enum` | ❌ | Analysis mode (default: "issue") |

#### Analysis Modes

| Mode | Purpose | Use Case |
|------|---------|----------|
| `issue` | Planning phase | Developer assigned to implement issue |
| `pull_request` | PR validation | Validate PR changes meet governance |
| `merge_group` | Merge queue | Final check before merge to main |
| `drift` | Baseline comparison | Detect unauthorized changes |

#### Output Structure

```typescript
{
  success: boolean;
  timestamp: string;
  requestId: string;
  analysis: {
    mode: string;
    filesAnalyzed: number;
    files: Array<{
      path: string;
      type: "workflow" | "config" | "source";
      hash: string;  // SHA-256
    }>;
    
    findings: Array<{
      ruleId: string;
      severity: "critical" | "high" | "medium" | "low";
      message: string;
      context: Record<string, unknown>;
    }>;
    
    summary: string;
    
    decision: {
      outcome: "allow" | "warn" | "block";
      reasons: string[];
      metadata: {
        timestamp: string;
        mode: string;
        rulesEvaluated: string[];
      };
    };
    
    report: {
      rulesChecked: number;
      violationsFound: number;
      criticalIssues: number;
    };
    
    degradedMode: boolean;
    adrReferences: string[];  // e.g., ["ADR-001", "ADR-004"]
  };
}
```

#### Example Usage

**Basic Analysis:**
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": ["src/auth/jwt.ts", ".github/workflows/deploy.yml"],
    "context": "acme-corp/api-gateway",
    "mode": "issue"
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

### `check_adr_compliance`

Validate code changes against Architecture Decision Records (ADRs).

#### When to Use

- **Pre-implementation**: Check if proposed changes comply with architectural decisions
- **PR validation**: Ensure changes adhere to documented governance policies
- **Policy enforcement**: Proactively enforce architectural standards
- **Refactoring**: Verify refactors maintain compliance with ADRs

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `files` | `string[]` | ✅ | File paths to check for ADR compliance |
| `adrs` | `string[]` | ❌ | Specific ADR IDs to check (e.g., `["ADR-001"]`) |
| `adrPath` | `string` | ❌ | Path to ADR directory (default: `docs/adr`) |
| `context` | `string` | ❌ | Optional context about the changes |

#### Output Structure

```typescript
{
  success: boolean;
  timestamp: string;
  requestId: string;
  compliance: {
    compliant: boolean;
    adrsChecked: string[];  // e.g., ["ADR-001", "ADR-002"]
    
    violations: Array<{
      adrId: string;        // e.g., "ADR-001"
      ruleId: string;       // e.g., "ADR-001-R2"
      file: string;
      line?: number;
      message: string;
      severity: "high" | "medium" | "low";
      remediation?: string;
    }>;
    
    suggestions: string[];
    timestamp: string;
  };
}
```

#### Example Usage

**Check workflow files against ADR-001:**
```json
{
  "name": "check_adr_compliance",
  "arguments": {
    "files": [".github/workflows/deploy.yml"],
    "adrs": ["ADR-001"],
    "context": "Adding deployment workflow"
  }
}
```

**Response** (compliant):
```json
{
  "success": true,
  "compliance": {
    "compliant": true,
    "adrsChecked": ["ADR-001"],
    "violations": [],
    "suggestions": []
  }
}
```

**Documentation:** See [ADR & FP Tools Reference](./docs/ADR_FP_TOOLS.md) for detailed documentation.

### `query_fp_store`

Query the false positive store to check if findings are known false positives or retrieve patterns for rule calibration.

#### When to Use

- **Suppression**: Check if a finding is already marked as a false positive
- **Calibration**: Analyze false positive patterns to improve rules
- **Trend analysis**: Track false positive rates over time
- **Quality metrics**: Measure rule precision and recall

#### Operations

| Operation | Description | Required Parameters |
|-----------|-------------|---------------------|
| `check_false_positive` | Check if a finding is a known FP | `findingId` |
| `get_by_rule` | Get FPs for a specific rule | `ruleId` |
| `get_statistics` | Get general statistics | None |

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operation` | `enum` | ✅ | Operation type (see above) |
| `findingId` | `string` | Conditional | Finding ID (for `check_false_positive`) |
| `ruleId` | `string` | Conditional | Rule ID (for `get_by_rule`) |
| `limit` | `number` | ❌ | Max results (default: 100) |

#### Output Structure

**For `check_false_positive`:**
```typescript
{
  success: boolean;
  operation: "check_false_positive";
  result: {
    findingId: string;
    isFalsePositive: boolean;
  };
}
```

**For `get_by_rule`:**
```typescript
{
  success: boolean;
  operation: "get_by_rule";
  result: {
    ruleId: string;
    count: number;
    falsePositives: Array<{
      id: string;
      findingId: string;
      ruleId: string;
      timestamp: string;
      resolvedBy: string;
      context: Record<string, unknown>;
    }>;
  };
}
```

#### Example Usage

**Check if finding is a false positive:**
```json
{
  "name": "query_fp_store",
  "arguments": {
    "operation": "check_false_positive",
    "findingId": "sha256:abc123..."
  }
}
```

**Get false positives for rule calibration:**
```json
{
  "name": "query_fp_store",
  "arguments": {
    "operation": "get_by_rule",
    "ruleId": "MD-001",
    "limit": 50
  }
}
```

**Documentation:** See [ADR & FP Tools Reference](./docs/ADR_FP_TOOLS.md) for detailed documentation.

---

### `check_consent_requirements`

Verify organization consent status before accessing sensitive governance data, ensuring compliance with ADR-004, GDPR, and EU AI Act requirements.

#### When to Use

- **Before query_fp_store**: Check consent for FP patterns/metrics access
- **Before sensitive operations**: Verify authorization for cross-org benchmarks
- **Consent management**: Get overview of organization consent status
- **Compliance checking**: Ensure GDPR Article 7 compliance

#### Check Types

| Check Type | Description | Required Parameters |
|-----------|-------------|---------------------|
| `validate` | Validate consent for specific resources | `resources` |
| `summary` | Get full consent profile for organization | None |
| `required_for_operation` | Check requirements for a tool operation | `tool`, optionally `operation` |

#### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `orgId` | `string` | ✅ | Organization ID to check |
| `checkType` | `enum` | ✅ | Type of check (see above) |
| `resources` | `string[]` | Conditional | Resources to validate (for `validate`) |
| `tool` | `string` | Conditional | Tool name (for `required_for_operation`) |
| `operation` | `string` | ❌ | Tool operation (for `required_for_operation`) |
| `includePolicy` | `boolean` | ❌ | Include full policy details |

#### Consent Resources

| Resource | Risk Level | Description |
|----------|------------|-------------|
| `fp_patterns` | Medium | Access to false positive patterns |
| `fp_metrics` | Low | Access to FP rate metrics |
| `cross_org_benchmarks` | High | Compare against anonymized org data |
| `rule_calibration` | Medium | Access to rule tuning recommendations |
| `audit_logs` | High | Access to governance audit logs |
| `drift_baselines` | Low | Access to historical drift baselines |

#### Output Structure

**For `validate`:**
```typescript
{
  success: boolean;
  checkType: "validate";
  orgId: string;
  validation: {
    allValid: boolean;
    checkedResources: string[];
    summary: string;
    resourceResults: Record<string, {
      valid: boolean;
      state: "granted" | "expired" | "revoked" | "pending" | "not_requested";
      grantedAt?: string;
      expiresAt?: string;
      version?: string;
      reason?: string;
    }>;
    issues: {
      missingConsents: string[];
      expiredConsents: string[];
      needsReconsent: string[];
    };
    actionRequired: boolean;
    actionUrl?: string;
  };
  recommendations: string[];
  compliance: {
    gdprCompliant: boolean;
    adr004Compliant: boolean;
    policyVersion: string;
  };
}
```

**For `summary`:**
```typescript
{
  success: boolean;
  checkType: "summary";
  orgId: string;
  consentSummary: {
    hasAnyConsent: boolean;
    policyVersion: string;
    currentPolicyVersion: string;
    needsReconsent: boolean;
    resources: {
      granted: string[];
      pending: string[];
      expired: string[];
      revoked: string[];
      notRequested: string[];
    };
    statistics: {
      totalResources: number;
      grantedCount: number;
      pendingCount: number;
      expiredCount: number;
      revokedCount: number;
      notRequestedCount: number;
      coveragePercent: number;
    };
  };
  recommendations: string[];
  consentUrl: string;
  compliance: {...};
}
```

**For `required_for_operation`:**
```typescript
{
  success: boolean;
  checkType: "required_for_operation";
  orgId: string;
  requiredConsents: {
    tool: string;
    operation: string | null;
    requiredResources: string[];
    resourceDescriptions: Record<string, string>;
    requiresConsent: boolean;
  };
  currentStatus?: {
    allGranted: boolean;
    summary: string;
    missingConsents: string[];
    actionUrl?: string;
  };
  canProceed: boolean;
  blockedReason?: string;
  recommendations?: string[];
  resourceDetails?: Array<{...}>; // When includePolicy=true
}
```

#### Example Usage

**Validate consent before querying FP store:**
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "validate",
    "resources": ["fp_patterns", "fp_metrics"]
  }
}
```

**Get organization consent summary:**
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "summary",
    "includePolicy": true
  }
}
```

**Check requirements for an operation:**
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "required_for_operation",
    "tool": "query_fp_store",
    "operation": "cross_rule_comparison"
  }
}
```

**Documentation:** See [Consent Requirements Usage](./docs/check-consent-requirements-usage.md) and [Examples](./examples/check-consent-requirements-examples.md).

---

## Testing

### Unit Tests

Run all unit tests:
```bash
pnpm test
```

### MCP Inspector Testing

#### Quick Start
Run specific test file:
```bash
pnpm test analyze-dissonance.test.ts
```

### Integration Tests

Run integration tests with real orchestrator:
```bash
pnpm test analyze-dissonance.integration.test.ts
```

### Test with Real Repository

Use the provided script to test with actual repository files:
```bash
./scripts/test-real-analysis.sh
```

### MCP Inspector

Interactive testing with MCP Inspector:
```bash
cd packages/mcp-server
./scripts/test-inspector.sh
```

This opens the MCP Inspector UI in your browser for interactive testing.

#### Automated Testing

```bash
cd packages/mcp-server
node scripts/run-inspector-tests.js
pnpm build
npx @modelcontextprotocol/inspector node dist/src/index.js
```

Open browser to http://localhost:5173 and test tool calls interactively.

### Manual Testing

Test tool list:
```bash
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/src/index.js
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
1. Configure MCP server in repository settings
2. Create test issue
3. Assign to @copilot with instructions to use analyze_dissonance
4. Monitor tool calls in Copilot session logs

### Test Coverage

- **Unit Tests**: 28 tests covering schema validation, mode handling, error cases
- **Integration Tests**: 8 tests with real file processing and orchestrator
- **Total**: 36 tests, 100% passing

See [Test Scenarios](./test/scenarios/README.md) for comprehensive test documentation.

---

## Documentation

- [Usage Examples](./examples/analyze-dissonance-examples.md) - Real-world usage scenarios
- [Test Scenarios](./test/scenarios/README.md) - Comprehensive test cases
- [CLI Analysis Flow](./docs/cli-analysis-flow.md) - Architecture documentation
- [L0 Invariants Reference](./docs/l0-invariants-reference.md) - Foundation checks
- [Implementation Summary](./docs/IMPLEMENTATION_SUMMARY.md) - Development history

---

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
