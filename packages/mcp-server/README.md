# @phase-mirror/mcp-server

Model Context Protocol (MCP) server for Phase Mirror governance tooling. This package exposes Phase Mirror's governance capabilities as callable tools for GitHub Copilot coding agent and other AI assistants.

## Features

- **MCP Server**: Standards-compliant MCP server implementation
- **Governance Tools**: Access Phase Mirror's governance capabilities via AI tools
- **TypeScript**: Full TypeScript support with type definitions
- **Workspace Integration**: Seamlessly integrates with Phase Mirror's pnpm workspace

## Installation

```bash
# From the repository root
pnpm install

# Build the package
cd packages/mcp-server
pnpm build
```

## Development

```bash
# Watch mode for development
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Configuration

The MCP server is configured via environment variables:

- `AWS_REGION`: AWS region for DynamoDB/SSM access (default: `us-east-1`)
- `FP_TABLE_NAME`: DynamoDB table name for FP store
- `CONSENT_TABLE_NAME`: DynamoDB table name for consent store
- `NONCE_PARAMETER_NAME`: SSM parameter name for nonce
- `LOG_LEVEL`: Log level (`debug`, `info`, `warn`, `error`, default: `info`)

## Usage

### As a CLI Tool

```bash
# Run the MCP server
pnpm phase-mirror-mcp
```

### In Code

```typescript
import { MCPServerConfig } from '@phase-mirror/mcp-server';

const config: MCPServerConfig = {
  awsRegion: 'us-east-1',
  logLevel: 'info',
};
```

## Available Tools

### `get_server_info`

Get information about the Phase Mirror MCP server configuration.

**Input**: None

**Output**: Server name, version, and current configuration.

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
| `repository.owner` | `string` | ✅ | Repository owner (org or user) |
| `repository.name` | `string` | ✅ | Repository name |
| `repository.branch` | `string` | ❌ | Branch name (default: main) |
| `mode` | `enum` | ❌ | Analysis mode (default: issue) |
| `context` | `string` | ❌ | Additional context for analysis |
| `commitSha` | `string` | ❌ | Specific commit SHA |
| `includeADRs` | `boolean` | ❌ | Include ADR references (default: true) |
| `includeFPPatterns` | `boolean` | ❌ | Include FP patterns (requires consent, default: false) |

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
    repository: string;
    filesAnalyzed: number;
    
    summary: {
      totalFindings: number;
      bySeverity: { critical: number; high: number; medium: number; low: number };
      decision: "pass" | "warn" | "block";
      degradedMode: boolean;
    };
    
    findings: Array<{
      id: string;
      ruleId: string;
      severity: "critical" | "high" | "medium" | "low";
      title: string;
      description: string;
      evidence: Array<{ path: string; line: number; snippet: string }>;
      remediation: string;
    }>;
    
    adrReferences?: Record<string, string>;
    fpPatterns?: Record<string, {
      count: number;
      observedFPR: number;
      recentExamples: Array<{
        outcome: string;
        reviewedBy: string;
        ticket: string;
      }>;
    }>;
    degradedModeDetails?: {
      reason: string;
      timestamp: string;
      details: string;
    };
    recommendations: string[];
  };
}
```

#### Example Usage

**Basic Analysis**:
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [".github/workflows/deploy.yml"],
    "repository": {
      "owner": "PhaseMirror",
      "name": "Phase-Mirror"
    },
    "mode": "pull_request",
    "context": "Add deployment workflow"
  }
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "totalFindings": 1,
      "decision": "warn"
    },
    "findings": [{
      "ruleId": "MD-001",
      "severity": "medium",
      "title": "GitHub Actions permission escalation",
      "remediation": "Use principle of least privilege"
    }],
    "recommendations": [
      "Review findings and document decisions"
    ]
  }
}
```

For more examples, see [examples/analyze-dissonance-examples.md](./examples/analyze-dissonance-examples.md).

---

## Project Structure

```
packages/mcp-server/
├── src/
│   ├── index.ts        # Main server entry point
│   ├── types/          # TypeScript type definitions
│   ├── tools/          # MCP tool implementations
│   └── utils/          # Utility functions
├── test/               # Test files
├── dist/               # Build output
├── package.json
└── tsconfig.json
```

## License

Apache-2.0

## Author

Phase Mirror LLC
