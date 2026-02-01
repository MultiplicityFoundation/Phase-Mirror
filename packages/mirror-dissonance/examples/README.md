# Analysis Orchestrator Examples

This directory contains examples demonstrating how to use the Analysis Orchestrator.

## orchestrator-example.js

A complete example showing how to:
1. Initialize the orchestrator
2. Analyze files in a repository
3. Process and display results

### Running the Example

```bash
# From the mirror-dissonance package directory
node examples/orchestrator-example.js
```

### Expected Output

The example will:
- Initialize the orchestrator with default configuration
- Analyze three files: `package.json`, `tsconfig.json`, and `src/oracle.ts`
- Display artifact metadata (file type, hash, size)
- Show the Oracle's decision (allow/warn/block)
- Report any rule violations found
- Print a full summary

### Customizing the Example

You can modify the example to:
- Analyze different files
- Use different analysis modes (pull_request, merge_group, drift, calibration)
- Configure AWS services for production use
- Enable ADR extraction

### Integration Examples

The orchestrator can be integrated with:

1. **CLI Tools**: Wrap the orchestrator in a command-line interface
2. **MCP Servers**: Expose as an MCP tool for GitHub Copilot
3. **GitHub Actions**: Use in workflow steps for automated analysis
4. **Custom Applications**: Embed in your own analysis tools

### API Overview

```javascript
import { createOrchestrator } from '@mirror-dissonance/core';

// Create and initialize
const orchestrator = await createOrchestrator({
  awsRegion: 'us-east-1',         // Optional: AWS region
  fpTableName: 'fp-store',        // Optional: False positive store
  consentTableName: 'consent',    // Optional: Consent store
  blockCounterTableName: 'blocks', // Optional: Block counter
  nonceParameterName: '/nonce',   // Optional: SSM parameter
  adrPath: './docs/adr',          // Optional: ADR directory
});

// Run analysis
const result = await orchestrator.analyze({
  files: ['src/main.ts', 'package.json'],
  repository: {
    owner: 'org',
    name: 'repo',
    branch: 'main',
  },
  mode: 'pull_request',
  context: 'PR description',
  commitSha: 'abc123',
});

// Access results
console.log(result.machineDecision.outcome); // 'allow' | 'warn' | 'block'
console.log(result.artifacts);               // File artifacts with hashes
console.log(result.violations);              // Rule violations
console.log(result.report);                  // Summary statistics
```

## TypeScript Example

The `orchestrator-example.ts` file contains the same example in TypeScript with full type annotations. To run it, first compile or use `ts-node`:

```bash
# Compile and run
pnpm build
node dist/examples/orchestrator-example.js

# Or use ts-node
npx ts-node examples/orchestrator-example.ts
```

## Next Steps

After reviewing the examples, refer to:
- [CLI Analysis Flow Documentation](../docs/cli-analysis-flow.md)
- [Architecture Documentation](../../../../docs/architecture.md)
- [API Reference](../src/analysis/orchestrator.ts)
