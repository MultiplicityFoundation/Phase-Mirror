# Integration Testing Guide

## Overview

The Phase Mirror MCP server includes a comprehensive integration testing framework that validates end-to-end functionality by spawning the actual server process and communicating via JSON-RPC over stdio.

## Test Harness

### MCPTestHarness Class

The `MCPTestHarness` class provides a full-featured test harness for integration testing:

```typescript
import { MCPTestHarness, withTestHarness } from "./test/integration/test-harness.js";
```

#### Features

- **Process Management**: Spawns and manages the MCP server process
- **JSON-RPC Communication**: Handles bidirectional communication over stdio
- **Request/Response Tracking**: Manages pending requests with timeouts
- **Protocol Support**: Implements MCP protocol initialization
- **Event Handling**: Emits events for logs, errors, and notifications
- **Automatic Cleanup**: Ensures server processes are properly terminated

#### Basic Usage

```typescript
// Using the convenience wrapper (recommended)
await withTestHarness(async (harness) => {
  await harness.initialize();
  
  const result = await harness.callTool("get_server_info", {});
  expect(result.content).toBeDefined();
}, { LOG_LEVEL: "error" }); // Optional environment variables
```

#### Manual Usage

```typescript
// Manual control for advanced scenarios
const harness = new MCPTestHarness();

try {
  await harness.start({ LOG_LEVEL: "error" });
  await harness.initialize();
  
  const result = await harness.callTool("analyze_dissonance", {
    files: ["path/to/file.ts"],
    context: "org/repo",
    mode: "pull_request"
  }, 30000); // 30 second timeout
  
  // Process result...
} finally {
  await harness.stop();
}
```

### API Reference

#### Constructor

```typescript
new MCPTestHarness(serverPath?: string)
```

- `serverPath`: Optional path to server entry point (defaults to `dist/src/index.js`)

#### Methods

##### `start(env?: Record<string, string>): Promise<void>`

Start the MCP server process with optional environment variables.

```typescript
await harness.start({
  AWS_REGION: "us-east-1",
  FP_TABLE_NAME: "test-fp-store",
  LOG_LEVEL: "error"
});
```

##### `stop(): Promise<void>`

Stop the MCP server process gracefully (SIGTERM, then SIGKILL after 5s).

##### `initialize(): Promise<any>`

Perform MCP protocol handshake.

##### `listTools(): Promise<any>`

List all available tools from the server.

```typescript
const { tools } = await harness.listTools();
console.log(tools.map(t => t.name));
```

##### `callTool(name: string, args: any, timeout?: number): Promise<any>`

Call a specific tool with arguments.

```typescript
const result = await harness.callTool(
  "analyze_dissonance",
  {
    files: ["src/index.ts"],
    context: "owner/repo",
    mode: "pull_request"
  },
  45000 // 45 second timeout
);
```

##### `request(method: string, params: any, timeout?: number): Promise<any>`

Send a raw JSON-RPC request.

```typescript
const result = await harness.request("tools/call", {
  name: "get_server_info",
  arguments: {}
});
```

#### Helper Functions

##### `createTestHarness(env?, serverPath?): Promise<MCPTestHarness>`

Create and start a test harness in one call.

##### `withTestHarness(testFn, env?, serverPath?): Promise<T>`

Run a test function with automatic harness cleanup (recommended for most tests).

## Test Suites

### Multi-Tool Workflow Tests

Location: `test/integration/multi-tool-workflow.integration.test.ts`

Tests end-to-end workflows involving multiple tools:

- **Tool Discovery**: List all available tools
- **Sequential Workflows**: Chain multiple tool calls together
- **Consent & Data Access**: Validate consent checks before data queries
- **Server Info**: Test basic server information retrieval
- **Concurrent Calls**: Handle rapid sequential tool calls
- **Error Recovery**: Recover from errors and continue operating
- **State Management**: Maintain consistent state across calls

Example test:

```typescript
it("should execute workflow: analyze -> validate -> check compliance", async () => {
  await withTestHarness(async (harness: MCPTestHarness) => {
    await harness.initialize();

    // Step 1: Analyze dissonance
    const analysis = await harness.callTool("analyze_dissonance", {
      files: [testFile],
      context: "owner/repo",
      mode: "pull_request",
    }, 45000);

    // Step 2: Validate L0 invariants
    const l0Result = await harness.callTool("validate_l0_invariants", {
      files: [testFile],
      context: "owner/repo",
    }, 30000);

    // Step 3: Check ADR compliance
    const compliance = await harness.callTool("check_adr_compliance", {
      files: [testFile],
      adrPath: "/path/to/adrs",
    }, 30000);

    // All steps should succeed
    expect(JSON.parse(analysis.content[0].text).success).toBe(true);
    expect(JSON.parse(l0Result.content[0].text).success).toBe(true);
    expect(JSON.parse(compliance.content[0].text).success).toBe(true);
  });
}, 120000);
```

### Error Handling Tests

Location: `test/integration/error-handling.integration.test.ts`

Tests various error scenarios and validates consistent error responses:

- **Invalid Tool Names**: Unknown tools return clear errors
- **Missing Parameters**: Required parameters trigger validation errors
- **Invalid Types**: Type mismatches are caught and reported
- **Invalid Enums**: Enum validation with helpful messages
- **Empty Arrays**: Graceful handling of empty but valid inputs
- **Nonexistent Files**: File errors handled appropriately
- **Timeouts**: Short timeout scenarios
- **Detailed Errors**: Validation errors include detailed context
- **Concurrent Errors**: Multiple simultaneous errors
- **Error Recovery**: Server continues after errors
- **Consistent Format**: Error format consistency across tools

Example test:

```typescript
it("should provide detailed error context", async () => {
  await withTestHarness(async (harness: MCPTestHarness) => {
    await harness.initialize();

    const result = await harness.callTool("check_consent_requirements", {
      orgId: "", // Empty - invalid
      checkType: "invalid", // Invalid enum
    }, 30000);

    const data = JSON.parse(result.content[0].text);
    expect(data.success).toBe(false);
    expect(data.code).toBeDefined();
    expect(data.details).toBeDefined();
    expect(Array.isArray(data.details)).toBe(true);
    expect(data.details.length).toBeGreaterThan(0);
  });
});
```

## Error Response Format

### Validation Errors

Tools return consistent validation error formats:

```json
{
  "success": false,
  "error": "Invalid input",
  "code": "INVALID_INPUT",
  "details": [
    {
      "code": "invalid_type",
      "expected": "array",
      "received": "undefined",
      "path": ["files"],
      "message": "Required"
    }
  ]
}
```

Or:

```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "Invalid input parameters",
  "details": [
    {
      "received": "invalid",
      "code": "invalid_enum_value",
      "options": ["validate", "summary", "required_for_operation"],
      "path": ["checkType"],
      "message": "Invalid enum value..."
    }
  ]
}
```

### Runtime Errors

```json
{
  "success": false,
  "error": "ADR compliance check failed",
  "code": "EXECUTION_FAILED",
  "message": "ENOENT: no such file or directory...",
  "timestamp": "2026-02-01T16:31:05.551Z",
  "stack": "Error: ENOENT..."
}
```

## Running Tests

### Run All Integration Tests

```bash
pnpm test test/integration/
```

### Run Specific Test Suite

```bash
pnpm test test/integration/multi-tool-workflow.integration.test.ts
```

### Run Single Test

```bash
pnpm test test/integration/multi-tool-workflow.integration.test.ts -- --testNamePattern="should list all available tools"
```

### Debug Mode

```bash
# Run with Jest debug output
pnpm test test/integration/ -- --verbose

# Run with open handles detection
pnpm test test/integration/ -- --detectOpenHandles
```

## Best Practices

### 1. Use `withTestHarness` for Cleanup

Always use the `withTestHarness` helper to ensure server processes are properly cleaned up:

```typescript
await withTestHarness(async (harness) => {
  // Test code here
}, { LOG_LEVEL: "error" });
```

### 2. Set Appropriate Timeouts

Different operations need different timeouts:

- Simple operations: 10-30 seconds
- Analysis operations: 45-60 seconds
- Multi-tool workflows: 90-120 seconds

```typescript
await harness.callTool("analyze_dissonance", args, 45000);
```

### 3. Suppress Logs in Tests

Use `LOG_LEVEL: "error"` to reduce noise:

```typescript
await harness.start({ LOG_LEVEL: "error" });
```

### 4. Handle Test File Cleanup

Use `beforeAll`/`afterAll` for test file setup and cleanup:

```typescript
let testDir: string;

beforeAll(async () => {
  testDir = join(tmpdir(), `test-${Date.now()}-${process.pid}`);
  await mkdir(testDir, { recursive: true });
  // Create test files...
});

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true });
});
```

### 5. Test Both Success and Failure Paths

Validate both successful operations and error scenarios:

```typescript
// Success path
const goodResult = await harness.callTool("get_server_info", {});
expect(JSON.parse(goodResult.content[0].text).success).toBe(true);

// Failure path
const badResult = await harness.callTool("invalid_tool", {});
expect(JSON.parse(badResult.content[0].text).success).toBe(false);
```

## Troubleshooting

### Tests Hanging

If tests hang and Jest doesn't exit:

1. Check `forceExit: true` in `jest.config.js`
2. Ensure `harness.stop()` is called (use `withTestHarness`)
3. Run with `--detectOpenHandles` to find leaks

### Server Not Starting

If server fails to start:

1. Check server path in constructor
2. Verify `dist/src/index.js` exists (run `pnpm build`)
3. Check environment variables
4. Review stderr logs emitted by harness

### Request Timeouts

If requests timeout:

1. Increase timeout parameter
2. Check server logs (remove `LOG_LEVEL: "error"`)
3. Verify tool name and parameters are correct
4. Test manually with debug script

### JSON Parse Errors

If JSON parsing fails:

1. Check `result.content[0]` exists
2. Verify `result.content[0].type === "text"`
3. Log raw response before parsing
4. Check for partial/malformed JSON in response

## Performance

Current test performance (as of Day 13):

- **Multi-tool workflow tests**: 7 tests in ~4.5 seconds
- **Error handling tests**: 11 tests in ~6.2 seconds
- **Total**: 18 tests in ~8.3 seconds

All tests complete successfully with proper cleanup and no leaks.

## Future Enhancements

Potential improvements for the integration testing framework:

1. **Coverage Reporting**: Add integration test coverage metrics
2. **Load Testing**: Test concurrent client connections
3. **Performance Benchmarks**: Track tool execution times
4. **Mock External Services**: AWS service mocks for offline testing
5. **Snapshot Testing**: Compare tool outputs against snapshots
6. **CI/CD Integration**: Automated integration test runs on PR
7. **Test Data Generators**: Utilities for creating test files/data

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Phase Mirror ADRs](../../docs/adr/)
- [Jest Documentation](https://jestjs.io/)
- [TypeScript Testing](https://www.typescriptlang.org/docs/handbook/testing.html)
