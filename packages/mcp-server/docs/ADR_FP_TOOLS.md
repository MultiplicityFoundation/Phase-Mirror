# ADR Compliance & FP Store Query Tools

This document describes the two new MCP tools added to the Phase Mirror MCP server: `check_adr_compliance` and `query_fp_store`.

## check_adr_compliance

Validates code changes against Architecture Decision Records (ADRs).

### Purpose

This tool enables GitHub Copilot to proactively check if proposed code changes comply with documented architectural decisions before implementation. It helps maintain governance policies and ensures code adheres to established standards.

### Input Parameters

- **files** (required): Array of file paths to check for ADR compliance (relative to repo root)
- **adrs** (optional): Array of specific ADR IDs to check (e.g., `['ADR-001']`). If not provided, all relevant ADRs are checked.
- **adrPath** (optional): Path to ADR directory. Defaults to `docs/adr` relative to repository root.
- **context** (optional): Additional context about the changes for better analysis

### Output

Returns a compliance report with:
- `compliant`: Boolean indicating if all checks passed
- `adrsChecked`: Array of ADR IDs that were evaluated
- `violations`: Array of violations found, each with:
  - `adrId`: The ADR that was violated
  - `ruleId`: Specific rule within the ADR
  - `file`: File path where violation occurred
  - `line`: Line number (if applicable)
  - `message`: Description of the violation
  - `severity`: "high", "medium", or "low"
  - `remediation`: Suggested fix (if available)
- `suggestions`: Array of recommendations for improvement
- `timestamp`: When the check was performed

### Example Usage

```javascript
{
  "files": [
    ".github/workflows/deploy.yml",
    "src/api/handler.ts"
  ],
  "adrs": ["ADR-001", "ADR-002"],
  "context": "Adding new deployment workflow"
}
```

### How It Works

1. **ADR Parsing**: Loads and parses ADR markdown files from the specified directory
2. **File Matching**: Matches files to relevant ADRs based on file patterns and ADR tags
3. **Rule Extraction**: Extracts decision rules from ADR decision sections (MUST, MUST NOT, SHALL, etc.)
4. **Validation**: Checks each file against applicable rules
5. **Reporting**: Returns violations with severity levels and remediation guidance

### ADR Structure

ADRs are expected to follow this format:

```markdown
# ADR-###: Title

**Status:** Approved/Proposed/Deprecated  
**Date:** YYYY-MM-DD  
**Tags:** tag1, tag2

## Context
Problem description...

## Decision
Requirements and rules using MUST, MUST NOT, SHALL keywords...

## Consequences
Impact of decision...

## Compliance Checks
How to validate adherence...
```

## query_fp_store

Query the false positive store to check if findings are known false positives or retrieve false positive patterns for rule calibration.

### Purpose

This tool helps reduce noise by learning from past false positives and improving rule accuracy. It enables the system to recognize patterns that have been previously marked as false positives.

### Operations

#### 1. check_false_positive

Check if a specific finding is a known false positive.

**Input:**
- `operation`: "check_false_positive"
- `findingId`: The finding ID to check

**Output:**
```javascript
{
  "findingId": "finding-abc123",
  "isFalsePositive": true/false
}
```

#### 2. get_by_rule

Retrieve false positive records for a specific rule.

**Input:**
- `operation`: "get_by_rule"
- `ruleId`: The rule ID to query (e.g., "MD-001")
- `limit`: Maximum number of results (default: 100)

**Output:**
```javascript
{
  "ruleId": "MD-001",
  "count": 42,
  "falsePositives": [
    {
      "id": "fp-123",
      "findingId": "finding-abc",
      "ruleId": "MD-001",
      "timestamp": "2026-01-15T10:30:00Z",
      "resolvedBy": "user@example.com",
      "context": {...}
    },
    // ... more records
  ]
}
```

#### 3. get_statistics

Get general statistics about false positives (informational).

**Input:**
- `operation`: "get_statistics"

**Output:**
Informational message about statistics functionality.

### Example Usage

```javascript
// Check if a finding is a false positive
{
  "operation": "check_false_positive",
  "findingId": "sha256:abc123..."
}

// Get false positives for calibration
{
  "operation": "get_by_rule",
  "ruleId": "MD-001",
  "limit": 50
}
```

### Store Implementations

The tool supports two store implementations:

1. **DynamoDB Store**: Production implementation using AWS DynamoDB
   - Requires `FP_TABLE_NAME` environment variable
   - Stores records with TTL for automatic cleanup
   
2. **NoOp Store**: Testing/development implementation
   - Always returns no false positives
   - Used when `FP_TABLE_NAME` is not configured

### Use Cases

- **Suppression**: Automatically suppress findings that were previously marked as false positives
- **Calibration**: Analyze patterns in false positives to improve rule accuracy
- **Trend Analysis**: Track false positive rates over time
- **Quality Metrics**: Measure rule precision and recall

## Testing

Both tools include comprehensive test suites:

- `packages/mcp-server/test/check-adr-compliance.test.ts`
- `packages/mcp-server/test/query-fp-store.test.ts`

Run tests:
```bash
cd packages/mcp-server
pnpm test
```

## Implementation Details

### ADR Parser Module

Located in `packages/mirror-dissonance/src/adr/`:
- `types.ts`: Type definitions for ADR structures
- `parser.ts`: Markdown parsing and rule extraction
- `matcher.ts`: File-to-ADR matching logic
- `validator.ts`: Compliance validation rules
- `index.ts`: Module exports

### MCP Tools

Located in `packages/mcp-server/src/tools/`:
- `check-adr-compliance.ts`: ADR compliance tool implementation
- `query-fp-store.ts`: FP store query tool implementation

Both tools are registered in `packages/mcp-server/src/index.ts` and exposed via the MCP protocol.

## Future Enhancements

### ADR Compliance
- AST-based validation for code files
- YAML structure validation for workflows
- Custom validators per ADR
- Integration with analyze_dissonance findings

### FP Store Query
- Advanced statistics and trend analysis
- Pattern recognition for common false positives
- Automatic rule calibration recommendations
- Export capabilities for external analysis

## Related Documentation

- [ADR Template](../../docs/adr/ADR_TEMPLATE.md)
- [MIP Process](../../docs/adr/MIP_PROCESS.md)
- [FP Store README](../../packages/mirror-dissonance/src/fp-store/README.md)
- [MCP Server README](README.md)
