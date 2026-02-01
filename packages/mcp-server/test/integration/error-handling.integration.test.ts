/**
 * Integration tests for error handling
 * Tests various error scenarios and validates consistent error responses
 */

import { withTestHarness, MCPTestHarness } from "./test-harness.js";

describe("Error handling integration tests", () => {
  it("should handle invalid tool name with clear error", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      try {
        await harness.callTool("nonexistent_tool", {}, 10000);
        fail("Should have thrown an error for unknown tool");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain("Unknown tool");
      }
    });
  }, 30000);

  it("should handle missing required parameters", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Call analyze_dissonance without required parameters
      const result = await harness.callTool(
        "analyze_dissonance",
        {
          // Missing: files, context, mode
        },
        30000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("INVALID_INPUT");
    });
  }, 30000);

  it("should handle invalid parameter types", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Call with wrong type for files parameter
      const result = await harness.callTool(
        "analyze_dissonance",
        {
          files: "not-an-array", // Should be array
          context: "test-owner/test-repo",
          mode: "pull_request",
        },
        30000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });
  }, 30000);

  it("should handle invalid enum values", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      const result = await harness.callTool(
        "analyze_dissonance",
        {
          files: ["/tmp/test.ts"],
          context: "test-owner/test-repo",
          mode: "invalid_mode", // Not a valid mode
        },
        30000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.code).toBe("INVALID_INPUT");
    });
  }, 30000);

  it("should handle empty arrays gracefully", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      const result = await harness.callTool(
        "analyze_dissonance",
        {
          files: [], // Empty but valid
          context: "test-owner/test-repo",
          mode: "pull_request",
        },
        30000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.analysis.filesAnalyzed).toBe(0);
    });
  }, 30000);

  it("should handle nonexistent files gracefully", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      const result = await harness.callTool(
        "analyze_dissonance",
        {
          files: ["/nonexistent/path/file.ts"],
          context: "test-owner/test-repo",
          mode: "pull_request",
        },
        45000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      // Should succeed but with 0 files analyzed
      expect(data.success).toBe(true);
      expect(data.analysis.filesAnalyzed).toBe(0);
    });
  }, 45000);

  it("should handle timeout scenarios", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Request with very short timeout
      try {
        await harness.callTool(
          "analyze_dissonance",
          {
            files: ["/tmp/test.ts"],
            context: "test-owner/test-repo",
            mode: "pull_request",
          },
          1 // 1ms timeout - should fail
        );
        fail("Should have timed out");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toContain("timeout");
      }
    });
  }, 30000);

  it("should provide detailed error context", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Trigger validation error with multiple issues
      const result = await harness.callTool(
        "check_consent_requirements",
        {
          orgId: "", // Empty string
          checkType: "invalid", // Invalid type
        },
        30000
      );

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(false);
      expect(data.code).toBeDefined();
      expect(data.message).toBeDefined();
      expect(data.details).toBeDefined();
      expect(Array.isArray(data.details)).toBe(true);
    });
  }, 30000);

  it("should handle concurrent errors correctly", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Fire multiple failing requests
      const promises = [
        harness.callTool("invalid_tool_1", {}, 10000).catch((e) => ({ error: e })),
        harness.callTool("invalid_tool_2", {}, 10000).catch((e) => ({ error: e })),
        harness.callTool("invalid_tool_3", {}, 10000).catch((e) => ({ error: e })),
      ];

      const results = await Promise.all(promises);

      // All should fail with errors
      results.forEach((result: any) => {
        expect(result.error).toBeDefined();
      });
    });
  }, 30000);

  it("should recover from errors and continue operating", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // First call fails
      try {
        await harness.callTool("invalid_tool", {}, 10000);
      } catch (error) {
        // Expected
      }

      // Second call should succeed
      const result = await harness.callTool("get_server_info", {}, 10000);
      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const info = JSON.parse(result.content[0].text);
      expect(info.name).toBe("Phase Mirror MCP Server");
    });
  }, 30000);

  it("should provide consistent error format across tools", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Test error format from different tools - all with invalid parameters
      const tools = [
        { name: "analyze_dissonance", args: {} }, // Missing all required
        { name: "check_adr_compliance", args: {} }, // Missing all required  
        { name: "check_consent_requirements", args: {} }, // Missing all required
      ];

      for (const tool of tools) {
        const result = await harness.callTool(tool.name, tool.args, 30000);

        expect(result.content).toBeDefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.success).toBe(false);
        // All tools should return either 'code' or 'error' field
        expect(data.code || data.error).toBeDefined();
      }
    });
  }, 90000);
});
