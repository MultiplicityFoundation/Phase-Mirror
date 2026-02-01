# CLI Analysis Flow Documentation

## Current CLI Architecture (packages/cli)

### Entry Point: `src/index.ts`
- Uses Commander.js for CLI parsing
- Defines `run`, `baseline`, and `drift` commands
- Handles file input, output format, mode selection
- Dynamically imports Oracle from mirror-dissonance package

### Analysis Command: `run`
Key responsibilities:
- Parse CLI options (mode, strict, dry-run, baseline, repo, pr, commit, branch, author, output)
- Build input context from options and environment variables
- Call Oracle's `analyze()` method
- Generate markdown summary for GitHub Actions
- Exit with appropriate code based on decision outcome

### Core Dependencies
- `@mirror-dissonance/core` - Core library
  - `Oracle` class - Main evaluation engine
  - `analyze()` function - Convenience wrapper
  - Rule registry and evaluation
  - False positive filtering
  - Circuit breaker checks
  - Policy-based decision making

### Data Flow
```
CLI Input (mode, options, context)
↓
Build OracleInput
↓
Oracle.analyze(input)
↓
Rule Evaluation (MD-001 through MD-005)
↓
FP Store Filtering
↓
Circuit Breaker Check
↓
Policy Decision (allow/warn/block)
↓
Generate Summary & Report
↓
Output to stdout/file/GitHub
```

## Refactoring Strategy for Orchestrator

### Current State
The CLI directly uses the Oracle class, which is designed for the current simple input model. The Oracle:
- Takes a single `OracleInput` object with mode and context
- Does not process file artifacts directly
- Evaluates rules based on context metadata
- Returns a single `OracleOutput` with violations and decision

### What Already Works
1. **Oracle class** - Core evaluation engine with FP filtering and circuit breaker
2. **Rule registry** - MD-001 through MD-005 rules
3. **Policy decision** - allow/warn/block logic
4. **Report generation** - JSON and markdown output

### What's Missing for MCP Tool Integration
1. **File artifact processing** - Oracle doesn't currently process file contents
2. **Artifact categorization** - No distinction between workflows, configs, source files
3. **ADR extraction** - No support for Architecture Decision Record references
4. **Reusable orchestration** - CLI-specific logic mixed with core logic

### Orchestrator Design

The orchestrator will:
1. **Build artifacts from file paths** - Read files, detect types, create structured artifacts
2. **Enrich context** - Add file-based evidence to analysis context
3. **Coordinate components** - Initialize Oracle, FP store, consent store, block counter
4. **Extract ADR references** - Find relevant governance documents
5. **Return enriched reports** - Include file-level findings with ADR citations

### Implementation Phases

#### Phase 1: Create Orchestrator Structure (Current)
- Define `AnalysisOrchestrator` class
- Define `AnalysisInput` and configuration interfaces
- Implement artifact building from file paths
- Implement file type detection
- Add content hashing for fingerprinting

#### Phase 2: Integrate with Oracle (Future)
- Extend Oracle to accept artifact-based context
- Update rules to analyze file contents
- Add evidence paths to violations

#### Phase 3: ADR Integration (Future)
- Implement ADR discovery and parsing
- Link violations to relevant ADRs
- Add governance context to reports

### Usage Example

```typescript
import { AnalysisOrchestrator } from '@mirror-dissonance/core/analysis';

// Initialize orchestrator
const orchestrator = new AnalysisOrchestrator({
  awsRegion: 'us-east-1',
  fpTableName: 'phase-mirror-fp-store',
  consentTableName: 'phase-mirror-consent',
  blockCounterTableName: 'phase-mirror-blocks',
  nonceParameterName: '/phase-mirror/nonce',
  rulesPath: './rules',
  adrPath: './docs/adr',
});

await orchestrator.initialize();

// Run analysis
const report = await orchestrator.analyze({
  files: ['src/main.ts', 'package.json', '.github/workflows/ci.yml'],
  repository: {
    owner: 'PhaseMirror',
    name: 'Phase-Mirror',
    branch: 'main',
  },
  mode: 'pull_request',
  context: 'Implement new feature X',
  commitSha: 'abc123',
});

console.log(report);
```

## Notes

- The orchestrator is designed to be CLI-independent and reusable
- It can be used by MCP server, GitHub Actions, or any integration
- The current Oracle implementation is preserved for backward compatibility
- Future versions will enhance Oracle to support artifact-based analysis
