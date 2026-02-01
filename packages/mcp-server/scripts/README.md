# MCP Server Testing Scripts

This directory contains scripts for testing the Phase Mirror MCP server.

## Available Scripts

### `test-inspector.sh`

Interactive MCP Inspector launcher with enhanced UI.

**Usage:**
```bash
./scripts/test-inspector.sh
```

**What it does:**
1. Verifies server is built (`dist/index.js` exists)
2. Runs build if needed
3. Starts MCP Inspector with formatted output
4. Opens browser at http://localhost:5173
5. Displays connection info

**Best for:**
- Manual testing of individual tools
- Visual debugging of tool responses
- Exploring server capabilities interactively

**Output:**
```
╔════════════════════════════════════════════╗
║   Phase Mirror MCP Inspector Test Suite   ║
╚════════════════════════════════════════════╝

✅ Server built successfully

Starting MCP Inspector...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Server command:
  node /path/to/dist/index.js

Browser will open at: http://localhost:5173

Press Ctrl+C to stop the inspector
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### `run-inspector-tests.js`

Automated test runner for comprehensive test suite execution.

**Usage:**
```bash
node scripts/run-inspector-tests.js
```

**What it does:**
1. Starts MCP server programmatically
2. Loads test cases from `../test-cases/inspector-test-cases.json`
3. Executes each test case via JSON-RPC
4. Validates outputs against expected results
5. Generates detailed report
6. Saves results to `../test-results/inspector-automated-results.json`
7. Cleans up server process

**Best for:**
- CI/CD integration
- Regression testing
- Quick validation after changes
- Performance benchmarking

**Output:**
```
═══════════════════════════════════════
  MCP Inspector Automated Test Suite
═══════════════════════════════════════

✓ Server started

▶ Testing tool: analyze_dissonance
────────────────────────────────────────

Running: analyze_dissonance / test_1_basic_analysis
  Description: Basic analysis with single file
  ✓ PASSED (342ms)

...

═══════════════════════════════════════
  Test Summary
═══════════════════════════════════════

Total Tests:  13
Passed:       13 (100.0%)
Failed:       0

Per-Tool Results:
  analyze_dissonance: 5/5 (100.0%)
  validate_l0_invariants: 8/8 (100.0%)

Results saved to: test-results/inspector-automated-results.json

Server stopped
```

**Features:**
- Automatic server lifecycle management
- Timeout protection (10s per test)
- Nested value validation (e.g., `analysis.filesAnalyzed`)
- Array access validation (e.g., `failures[0].invariantId`)
- Per-tool and overall statistics
- JSON report generation

**Test Case Format:**

Test cases are defined in `../test-cases/inspector-test-cases.json`:

```json
{
  "tool_name": {
    "test_identifier": {
      "description": "Human-readable description",
      "input": {
        // Tool-specific input parameters
      },
      "expected": {
        // Expected output fields and values
        "field": "value",
        "nested.field": "value",
        "array[0].field": "value"
      }
    }
  }
}
```

**Exit Codes:**
- `0`: All tests passed
- `1`: Test runner error or test failures

---

### `test-with-inspector.sh`

Simple MCP Inspector launcher (original version).

**Usage:**
```bash
./scripts/test-with-inspector.sh
```

**What it does:**
1. Runs build
2. Displays server command
3. Starts MCP Inspector

**Best for:**
- Quick inspector launch
- When you don't need the enhanced UI

**Note:** This is the original simple script. For better UX, use `test-inspector.sh` instead.

---

## Script Requirements

All scripts require:
- Node.js 18+
- Built MCP server (`pnpm build`)
- Dependencies installed (`pnpm install`)

Additional for automated testing:
- `test-cases/inspector-test-cases.json` must exist
- Write access to `test-results/` directory

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: MCP Server Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 18
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build MCP server
        run: pnpm build
        working-directory: packages/mcp-server
      
      - name: Run automated tests
        run: node scripts/run-inspector-tests.js
        working-directory: packages/mcp-server
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: packages/mcp-server/test-results/
```

## Development

### Adding New Test Cases

1. Edit `../test-cases/inspector-test-cases.json`
2. Add new test under appropriate tool section
3. Define `input` and `expected` fields
4. Run automated tests to validate

### Modifying Test Runner

The test runner (`run-inspector-tests.js`) is an ES module. Key classes:

- `MCPInspectorTestRunner`: Main test orchestration
  - `startServer()`: Spawns MCP server process
  - `executeToolCall(toolName, args)`: Makes JSON-RPC call
  - `runTest(toolName, testName, testCase)`: Executes single test
  - `validateExpectations(actual, expected)`: Validates output
  - `getNestedValue(obj, path)`: Navigates nested properties

### Debugging

Enable verbose logging:

```bash
# For test runner
DEBUG=* node scripts/run-inspector-tests.js

# For MCP server
LOG_LEVEL=debug node scripts/run-inspector-tests.js
```

View server stderr during testing:

```javascript
// In run-inspector-tests.js, add to startServer():
this.serverProcess.stderr.on('data', (data) => {
  console.error('Server stderr:', data.toString());
});
```

## Troubleshooting

### "Command not found: pnpm"
**Fix:** Install pnpm globally: `npm install -g pnpm`

### "Cannot find module '@modelcontextprotocol/inspector'"
**Fix:** The inspector is installed on-demand via `npx`. Ensure you have internet access.

### "ECONNREFUSED" in automated tests
**Cause:** Server failed to start or crashed
**Fix:** 
1. Check server builds: `pnpm build`
2. Test server manually: `node dist/index.js` (should not exit immediately)
3. Review server logs for errors

### "Test timeout (10s)"
**Cause:** Tool execution took too long
**Fix:**
1. Check file sizes in test cases
2. Monitor system resources
3. Increase timeout in test runner if needed:
   ```javascript
   const timeout = setTimeout(() => {
     reject(new Error("Tool call timeout (30s)"));
   }, 30000); // Increase from 10000
   ```

### "JSON.parse error" in test results
**Cause:** Tool returned invalid JSON
**Fix:** Test tool in MCP Inspector to see raw output

## Performance Benchmarks

Typical test execution times (on modern hardware):

| Tool | Operation | Expected Time |
|------|-----------|---------------|
| `analyze_dissonance` | Single file | 300-500ms |
| `analyze_dissonance` | Multiple files | 800-1200ms |
| `validate_l0_invariants` | Single check | 50-100ms |
| `validate_l0_invariants` | Multi-check | 150-250ms |
| **Full test suite** | 13 tests | **5-10 seconds** |

If tests run slower, investigate:
- Disk I/O bottlenecks
- CPU throttling
- Memory pressure
- Network latency (if accessing remote resources)

## Further Reading

- [Testing Guide](../docs/testing-guide.md) - Complete Day 6-7 testing procedures
- [GitHub Copilot Integration](../docs/github-copilot-integration.md) - Production setup
- [Quick Reference](../TESTING_QUICK_REFERENCE.md) - Fast command reference
- [Main README](../README.md) - MCP server overview
