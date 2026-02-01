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

### validate_l0_invariants

Validate foundation-tier L0 invariants that enforce non-negotiable governance rules. These checks run in <100ns and include: schema hash integrity, permission bits validation, drift magnitude checks, nonce freshness, and contraction witness validation.

**New flexible API**: All parameters are optional. Provide only the checks you want to perform.

**Input:**

```typescript
{
  // Optional: Filter to specific checks
  checks?: ("schema_hash" | "permission_bits" | "drift_magnitude" | "nonce_freshness" | "contraction_witness")[];
  
  // Schema hash validation (file-based)
  schemaFile?: string;
  expectedSchemaHash?: string;  // SHA-256 hash (first 8 chars)
  
  // Workflow permission validation
  workflowFiles?: string[];  // Paths to GitHub Actions workflows
  
  // Drift magnitude check
  driftCheck?: {
    currentMetric: { name: string; value: number };
    baselineMetric: { name: string; value: number };
    threshold?: number;  // Default: 0.5
  };
  
  // Nonce freshness check
  nonceValidation?: {
    nonce: string;
    timestamp: string;  // ISO 8601 format
    maxAgeSeconds?: number;  // Default: 3600
  };
  
  // Contraction witness check
  contractionCheck?: {
    previousFPR: number;
    currentFPR: number;
    witnessEventCount: number;
    minRequiredEvents?: number;  // Default: 10
  };
}
```

**Output:**

```typescript
{
  success: boolean;
  validation: {
    passed: boolean;
    decision: "ALLOW" | "BLOCK";
    checksPerformed: number;
    results: Array<{
      invariantId: string;
      invariantName: string;
      passed: boolean;
      message: string;
      evidence: Record<string, unknown>;
      latencyNs: number;
    }>;
    failedChecks: Array<{
      invariantId: string;
      invariantName: string;
      message: string;
    }>;
    performance: {
      totalLatencyMs: string;
      individualLatenciesNs: Array<{ check: string; latencyNs: number }>;
      target: string;
    };
  };
  message: string;
}
```

**Examples:**

```typescript
// Check drift magnitude only
{
  "driftCheck": {
    "currentMetric": { "name": "violations", "value": 110 },
    "baselineMetric": { "name": "violations", "value": 100 }
  }
}

// Check workflow permissions (file-based)
{
  "workflowFiles": [".github/workflows/ci.yml"]
}

// Multiple checks with filtering
{
  "checks": ["drift_magnitude", "nonce_freshness"],
  "driftCheck": { ... },
  "nonceValidation": { ... }
}
```

**Documentation:** See [L0 Invariants Reference](./docs/l0-invariants-reference.md) for detailed documentation.

## Testing

### Unit Tests

```bash
pnpm test
```

### MCP Inspector

```bash
pnpm build
npx @modelcontextprotocol/inspector node dist/index.js
```

### GitHub Copilot Testing

1. Configure MCP server in repository settings
2. Create test issue
3. Assign to @copilot
4. Monitor tool calls in Copilot session logs

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
├── docs/                     # Documentation
│   └── l0-invariants-reference.md
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
