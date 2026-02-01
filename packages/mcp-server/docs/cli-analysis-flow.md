# CLI Analysis Flow Documentation

## Overview

This document describes how the Phase Mirror CLI analysis logic has been extracted and refactored for reuse by the MCP server and other integrations.

## Current Architecture

### CLI Package (`packages/cli`)

#### Entry Point: `src/index.ts`
- Uses Commander.js for CLI parsing
- Defines `run`, `baseline`, and `drift` commands
- Handles file I/O for output
- Provides GitHub Actions integration (Step Summary)

#### Commands
- **run**: Main analysis command with mode selection
- **baseline**: Create integrity baseline for drift detection
- **drift**: Convenience command for drift detection

### Core Analysis Package (`packages/mirror-dissonance`)

#### Analysis Orchestrator: `src/analysis/orchestrator.ts`

The orchestrator provides reusable analysis coordination:

**Key Features:**
- File artifact processing (read, categorize, hash)
- Component initialization (Oracle, FP store, consent store, block counter)
- ADR reference extraction (placeholder for future enhancement)
- Reusable by multiple interfaces (CLI, MCP server, GitHub Actions)

**Main Classes:**
- `AnalysisOrchestrator`: Core orchestration class
- `createOrchestrator()`: Factory function for easy initialization

**Configuration:**
```typescript
interface AnalysisOrchestratorConfig {
  awsRegion?: string;
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  nonceParameterName?: string;
  adrPath?: string;
}
```

**Analysis Input:**
```typescript
interface AnalysisInput {
  files: string[];
  repository: {
    owner: string;
    name: string;
    branch?: string;
  };
  mode: 'pull_request' | 'merge_group' | 'drift' | 'calibration';
  context?: string;
  commitSha?: string;
  prNumber?: number;
  author?: string;
  strict?: boolean;
  dryRun?: boolean;
  baselineFile?: string;
}
```

**Analysis Output:**
```typescript
interface AnalysisOutput extends OracleOutput {
  artifacts: FileArtifact[];
  adrReferences?: Array<{
    id: string;
    title: string;
    relevantRules: string[];
  }>;
}
```

#### Oracle: `src/oracle.ts`

The Oracle is the core evaluation engine:
- Evaluates all rules against input
- Filters false positives via FP store
- Checks circuit breaker thresholds
- Makes final machine decision (allow/block/warn)

### MCP Server Package (`packages/mcp-server`)

#### Tool: `src/tools/analyze-dissonance.ts`

The MCP tool wraps the orchestrator for use by GitHub Copilot:

**Flow:**
1. Validate input (files, context, mode)
2. Parse repository from context string
3. Initialize orchestrator with MCP config
4. Execute analysis via orchestrator
5. Format response with artifact metadata
6. Extract ADR references from violations

**Key Differences from CLI:**
- Accepts file paths via MCP protocol
- Returns structured JSON response
- No direct file I/O for output
- Includes file artifact metadata in response

## Data Flow

```
User Input (CLI/MCP)
↓
Input Validation
↓
Create Orchestrator
  ↓
  Initialize Components
    - Oracle
    - FP Store (NoOp or DynamoDB)
    - Consent Store (NoOp or DynamoDB)
    - Block Counter (In-Memory or DynamoDB)
↓
Read & Process Files
  - Read file content
  - Detect file type (workflow/config/source)
  - Generate SHA-256 hash
↓
Build Oracle Input
  - Map mode
  - Package context
↓
Oracle Evaluation
  - Evaluate all rules
  - Filter false positives
  - Check circuit breaker
  - Make decision
↓
Enhance Output
  - Add artifact metadata
  - Extract ADR references (if configured)
↓
Format Response (CLI/MCP specific)
  - CLI: Markdown summary, JSON file
  - MCP: JSON response with artifacts
```

## Component Dependencies

```
CLI (Commander.js)
  ↓
  ├─→ Orchestrator ──→ Oracle ──→ Rules
  │                      ↓
  │                   FP Store
  │                      ↓
  │                Block Counter
  │                      ↓
  │                Consent Store
  │
  └─→ File I/O (baseline.json, reports)

MCP Server (SDK)
  ↓
  └─→ Orchestrator (same as CLI)
```

## Refactoring Benefits

1. **Code Reuse**: Orchestrator eliminates duplication between CLI and MCP server
2. **Testability**: Core logic can be tested independently of CLI/MCP interfaces
3. **Maintainability**: Business logic changes in one place
4. **Extensibility**: Easy to add new interfaces (GitHub Actions, web UI, etc.)

## Future Enhancements

1. **ADR Extraction**: Implement actual ADR scanning based on rule violations
2. **DynamoDB Integration**: Wire up real FP store, consent store, and block counter
3. **Advanced File Filtering**: Support gitignore-style patterns
4. **Incremental Analysis**: Only analyze changed files in PR mode
5. **Caching**: Cache file hashes and rule evaluations for performance

## Testing

### CLI Tests
- Located in `packages/cli/test`
- Test command parsing and output formatting

### Orchestrator Tests
- Located in `packages/mirror-dissonance/src/analysis/__tests__`
- Test file processing, initialization, and analysis execution
- Mock file system for isolated testing

### MCP Server Tests
- Located in `packages/mcp-server/test`
- Test tool input validation and response formatting
- Use orchestrator with real file processing

## Migration Path

For existing CLI users:
1. CLI behavior unchanged - uses orchestrator internally
2. No breaking changes to command-line interface
3. Same output format and exit codes

For new integrations:
1. Import and use `AnalysisOrchestrator` directly
2. Configure with your environment settings
3. Call `analyze()` with input files and context
4. Process enhanced output with artifacts

## Example Usage

### CLI

```bash
# Run analysis
oracle run --mode pull_request --repo owner/repo --pr 123

# Create baseline
oracle baseline --output baseline.json

# Run drift detection
oracle drift --baseline baseline.json
```

### MCP Server (via GitHub Copilot)

```typescript
// Tool call from Copilot
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": ["src/index.ts", "src/config.json"],
    "context": "owner/repo",
    "mode": "pull_request"
  }
}
```

### Direct Orchestrator Usage

```typescript
import { createOrchestrator } from '@mirror-dissonance/core';

const orchestrator = await createOrchestrator({
  awsRegion: 'us-east-1',
});

const result = await orchestrator.analyze({
  files: ['src/index.ts'],
  repository: { owner: 'test', name: 'repo' },
  mode: 'pull_request',
});

console.log(result.machineDecision.outcome); // 'allow' | 'warn' | 'block'
console.log(result.artifacts.length); // Number of files processed
```
