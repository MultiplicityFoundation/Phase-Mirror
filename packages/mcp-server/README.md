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

**Input:**

```typescript
{
  schemaVersion: string;            // Format: "version:hash" (e.g., "1.0:f7a8b9c0")
  permissionBits: number;           // 16-bit integer (0-65535), bits 12-15 must be 0
  driftMagnitude: number;           // 0.0 to 1.0, threshold: 0.3
  nonce: {
    value: string;
    issuedAt: number;               // Unix timestamp in milliseconds
  };
  contractionWitnessScore: number;  // Must be 1.0 for validation
}
```

**Output:**

```typescript
{
  success: boolean;
  validation: {
    passed: boolean;
    decision: "ALLOW" | "BLOCK";
    failedChecks: string[];         // e.g., ["schema_hash", "drift_magnitude"]
    checkResults: {
      "L0-001 (Schema Hash)": { passed: boolean, description: string },
      "L0-002 (Permission Bits)": { passed: boolean, description: string },
      "L0-003 (Drift Magnitude)": { passed: boolean, description: string },
      "L0-004 (Nonce Freshness)": { passed: boolean, description: string },
      "L0-005 (Contraction Witness)": { passed: boolean, description: string }
    };
    performance: {
      latencyNs: number;
      latencyMs: number;
      target: string;
    };
    context: Record<string, unknown>;
  };
  message: string;
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
