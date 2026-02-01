# Phase Mirror MCP Server Testing Guide

This guide covers testing the Phase Mirror MCP server using both MCP Inspector (local validation) and GitHub Copilot coding agent (production integration).

## Table of Contents

1. [Day 6: MCP Inspector Testing](#day-6-mcp-inspector-testing)
2. [Day 7: GitHub Copilot Integration Testing](#day-7-github-copilot-integration-testing)
3. [Troubleshooting](#troubleshooting)

---

## Day 6: MCP Inspector Testing

MCP Inspector provides a browser-based UI for testing MCP servers locally before production deployment.

### Prerequisites

- MCP server built successfully (`pnpm build`)
- Node.js 18+ installed
- All dependencies installed

### Quick Start

The fastest way to start testing:

```bash
cd packages/mcp-server
./scripts/test-inspector.sh
```

This will:
1. Verify the server is built
2. Start MCP Inspector
3. Open browser at http://localhost:5173

### Manual Testing with MCP Inspector

#### Step 1: Start MCP Inspector

```bash
cd packages/mcp-server
pnpm build
npx @modelcontextprotocol/inspector node dist/index.js
```

#### Step 2: Verify Server Connection

In the MCP Inspector UI:

1. Check server status (top-left corner):
   - Should show: ✓ **Connected** with green indicator
   - Server name: `phase-mirror-mcp`
   - Version: `0.1.0`

2. View server capabilities:
   - Click "Server Info" tab
   - Should show: `capabilities: { tools: {} }`

3. List available tools:
   - Click "Tools" tab
   - Click "List Tools" button
   - Should display:
     - ✓ `analyze_dissonance`
     - ✓ `validate_l0_invariants`
     - ✓ `get_server_info`

#### Step 3: Run Test Cases

Test cases are defined in `test-cases/inspector-test-cases.json`. For each test:

1. Select the tool in Inspector UI
2. Copy the input JSON from the test case
3. Paste into the Inspector input panel
4. Click "Execute"
5. Validate the output against expected results
6. Document results in `test-results/inspector-test-log.md`

#### Example: Test `analyze_dissonance` - Basic Analysis

**Input:**
```json
{
  "files": ["../../README.md"],
  "mode": "issue"
}
```

**Expected Output:**
```json
{
  "success": true,
  "analysis": {
    "filesAnalyzed": 1,
    "summary": { ... }
  }
}
```

#### Example: Test `validate_l0_invariants` - Nonce Freshness

**Input:**
```json
{
  "nonceValidation": {
    "nonce": "test-nonce-abc123",
    "timestamp": "2026-02-01T06:00:00Z",
    "maxAgeSeconds": 3600
  }
}
```

**Expected Output:**
```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "results": [
      {
        "invariantId": "L0-004",
        "passed": true,
        "message": "Nonce fresh"
      }
    ]
  }
}
```

### Automated Testing

For faster test execution, use the automated test runner:

```bash
cd packages/mcp-server
node scripts/run-inspector-tests.js
```

This will:
1. Start the MCP server
2. Execute all test cases from `test-cases/inspector-test-cases.json`
3. Validate outputs against expected results
4. Generate a summary report
5. Save detailed results to `test-results/inspector-automated-results.json`

**Expected Output:**
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
```

### Test Coverage

The test suite covers:

#### `analyze_dissonance` Tests (5)
1. **Basic Analysis**: Single file analysis
2. **Workflow Analysis**: GitHub Actions workflow file
3. **Multiple Files**: Batch analysis
4. **Invalid Input**: Empty files array (error handling)
5. **Missing File**: Nonexistent file path (error handling)

#### `validate_l0_invariants` Tests (8)
1. **Permission Check**: GitHub Actions permissions (L0-002)
2. **Nonce Freshness (Valid)**: Fresh nonce validation
3. **Nonce Freshness (Expired)**: Expired nonce detection (L0-004)
4. **Drift Within Threshold**: Acceptable drift range
5. **Drift Exceeds Threshold**: Excessive drift detection (L0-003)
6. **Contraction Legitimate**: Valid FPR decrease with evidence
7. **Contraction Illegitimate**: Invalid FPR decrease (L0-005)
8. **Multi-Check**: Multiple invariants in single call

### Performance Validation

Monitor performance during testing:

| Tool | Target | Acceptable Range |
|------|--------|------------------|
| `validate_l0_invariants` | <100ns | <150ns |
| `analyze_dissonance` | <2000ms | <3000ms |

If performance exceeds acceptable range:
1. Check system load
2. Review file I/O operations
3. Profile the tool execution
4. Document in `test-results/inspector-test-log.md`

---

## Day 7: GitHub Copilot Integration Testing

After MCP Inspector validation, test the server with GitHub Copilot in a real repository.

### Prerequisites

- Day 6 testing completed successfully
- GitHub repository with Copilot enabled
- MCP server configured in repository settings (see [GitHub Copilot Integration Guide](./github-copilot-integration.md))

### Integration Test Plan

#### Test 1: Server Discovery

**Objective**: Verify Copilot can discover Phase Mirror tools.

**Steps:**
1. Create a test issue in the repository
2. Assign to `@copilot`
3. In the issue description, write:
   ```
   @copilot What Phase Mirror tools are available?
   ```

**Expected Result:**
Copilot should list:
- `analyze_dissonance`
- `validate_l0_invariants`
- Brief description of each tool

#### Test 2: Analyze Dissonance Tool

**Objective**: Verify `analyze_dissonance` works end-to-end.

**Steps:**
1. Create a test issue
2. Assign to `@copilot`
3. Request:
   ```
   @copilot Please analyze these files for dissonance:
   - packages/mcp-server/src/index.ts
   - packages/mcp-server/package.json
   
   Use the analyze_dissonance tool in issue mode.
   ```

**Expected Result:**
- Copilot calls `analyze_dissonance` with correct arguments
- Returns analysis with findings
- Provides actionable recommendations

**Validation:**
- Check Copilot session logs for tool call
- Verify tool response was parsed correctly
- Confirm recommendations are relevant

#### Test 3: Validate L0 Invariants Tool

**Objective**: Verify `validate_l0_invariants` works end-to-end.

**Steps:**
1. Create a test issue
2. Assign to `@copilot`
3. Request:
   ```
   @copilot Check if .github/workflows/ci.yml has excessive permissions.
   Use the validate_l0_invariants tool.
   ```

**Expected Result:**
- Copilot calls `validate_l0_invariants` with `workflowFiles`
- Returns L0-002 validation result
- Reports pass/fail status

#### Test 4: Multi-Step Workflow

**Objective**: Verify Copilot can chain tool calls.

**Steps:**
1. Create a test PR with code changes
2. Assign to `@copilot`
3. Request:
   ```
   @copilot Please review this PR:
   1. First, analyze the changed files for dissonance
   2. Then, validate L0 invariants
   3. Summarize any issues found
   ```

**Expected Result:**
- Copilot calls both tools in sequence
- Synthesizes results from both analyses
- Provides unified recommendations

#### Test 5: Error Handling

**Objective**: Verify graceful error handling.

**Steps:**
1. Create a test issue
2. Request analysis of a nonexistent file:
   ```
   @copilot Analyze /nonexistent/file.ts for dissonance
   ```

**Expected Result:**
- Tool returns error gracefully
- Copilot explains the error to the user
- Suggests corrective action

### Monitoring Tool Usage

#### View Copilot Session Logs

GitHub provides logs for Copilot sessions:

1. Navigate to repository → Settings → Copilot → Sessions
2. Find your test session
3. Expand "Tool Calls" section
4. Verify tool calls match expectations

#### Check MCP Server Logs

If `LOG_LEVEL` is set to `debug`:

1. Go to repository → Settings → Environments → copilot
2. View environment logs
3. Look for MCP server startup and tool execution logs

### Success Criteria

Day 7 testing is successful if:

- ✅ Copilot can discover all Phase Mirror tools
- ✅ `analyze_dissonance` executes correctly
- ✅ `validate_l0_invariants` executes correctly
- ✅ Tool responses are parsed and used by Copilot
- ✅ Errors are handled gracefully
- ✅ Performance is acceptable (<3s response time)

---

## Troubleshooting

### MCP Inspector Issues

#### Connection Refused

**Symptom:** Inspector shows "Connection refused" or "Server not responding"

**Causes:**
- Server not running
- Server crashed during startup
- Port conflict

**Fix:**
1. Verify server is built: `ls -l dist/index.js`
2. Check for errors in terminal where inspector was started
3. Try rebuilding: `pnpm clean && pnpm build`
4. Check if port 5173 is already in use

#### No Tools Listed

**Symptom:** Tools tab is empty or shows no tools

**Causes:**
- Tool registration failed
- Server initialization error

**Fix:**
1. Check `src/index.ts` for tool registration
2. Verify tool exports: `ls -l src/tools/`
3. Check server logs for errors
4. Rebuild and restart inspector

#### Tool Call Timeout

**Symptom:** Tool execution exceeds 10s timeout

**Causes:**
- File I/O bottleneck
- Large file analysis
- External dependency issue

**Fix:**
1. Check file sizes being analyzed
2. Monitor system resources
3. Profile tool execution
4. Increase timeout in test runner if needed

### GitHub Copilot Integration Issues

#### MCP Server Not Found

**Symptom:** Copilot cannot find Phase Mirror tools

**Causes:**
- Package not published (if using npm)
- Incorrect path (if using local)
- Configuration syntax error

**Fix:**
1. Verify MCP configuration in repository settings
2. Check for JSON syntax errors
3. For npm: Verify package is published
4. For local: Verify absolute path is correct
5. Check server logs for startup errors

#### Permission Denied

**Symptom:** Tool calls fail with permission/auth errors

**Causes:**
- AWS credentials missing or invalid
- Environment secrets not set
- IAM permissions insufficient

**Fix:**
1. Verify all `COPILOT_MCP_*` secrets are set
2. Check AWS credentials validity
3. Review IAM permissions for DynamoDB/SSM access
4. Test credentials manually with AWS CLI

#### Firewall Blocking

**Symptom:** Tool calls timeout when accessing AWS resources

**Causes:**
- GitHub firewall blocking AWS endpoints
- Network connectivity issue

**Fix:**
1. Enable firewall in Copilot settings
2. Add AWS endpoints to allowlist:
   - `dynamodb.[region].amazonaws.com`
   - `ssm.[region].amazonaws.com`
3. Verify region matches configuration

#### Tool Response Parsing Error

**Symptom:** Copilot receives response but cannot parse it

**Causes:**
- Tool output format changed
- Response too large
- JSON serialization issue

**Fix:**
1. Test tool in MCP Inspector to verify output format
2. Check for oversized responses
3. Verify JSON is valid
4. Review Copilot session logs for parsing errors

---

## Reporting Issues

When reporting testing issues, include:

1. **Test type**: MCP Inspector or GitHub Copilot
2. **Tool name**: Which tool was being tested
3. **Input**: Exact input parameters used
4. **Expected output**: What should have happened
5. **Actual output**: What actually happened
6. **Logs**: Relevant error messages or logs
7. **Environment**: Node version, OS, etc.

Create issues at: https://github.com/PhaseMirror/Phase-Mirror/issues

---

## Next Steps

After successful testing:

1. ✅ Document any environment-specific configurations
2. ✅ Create runbook for common issues
3. ✅ Set up monitoring for production usage
4. ✅ Train team on using MCP tools with Copilot
