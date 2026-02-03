/**
 * Integration tests for multi-tool workflows
 * Tests end-to-end scenarios involving multiple MCP tools
 */

import { withTestHarness, MCPTestHarness } from "./test-harness.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join, resolve, dirname } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("Multi-tool workflow integration tests", () => {
  let testDir: string;

  beforeAll(async () => {
    // Create test files
    testDir = join(tmpdir(), `mcp-workflow-test-${Date.now()}-${process.pid}`);
    await mkdir(testDir, { recursive: true });

    // Create test workflow file
    const workflowsDir = join(testDir, ".github", "workflows");
    await mkdir(workflowsDir, { recursive: true });
    await writeFile(
      join(workflowsDir, "ci.yml"),
      `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`,
      "utf-8"
    );

    // Create test source file
    await writeFile(
      join(testDir, "index.ts"),
      `export function process(data: any): void {
  console.log(data);
}`,
      "utf-8"
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should list all available tools", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      // Initialize protocol
      await harness.initialize();

      // List tools
      const result = await harness.listTools();

      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);

      // Check expected tools are present
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain("get_server_info");
      expect(toolNames).toContain("analyze_dissonance");
      expect(toolNames).toContain("validate_l0_invariants");
      expect(toolNames).toContain("check_adr_compliance");
      expect(toolNames).toContain("query_fp_store");
      expect(toolNames).toContain("check_consent_requirements");
    });
  }, 30000);

  it("should execute workflow: analyze -> validate -> check compliance", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Step 1: Analyze dissonance
      const analysisResult = await harness.callTool(
        "analyze_dissonance",
        {
          files: [join(testDir, ".github", "workflows", "ci.yml")],
          context: "test-owner/test-repo",
          mode: "pull_request",
        },
        45000
      );

      expect(analysisResult.content).toBeDefined();
      expect(analysisResult.content[0]).toHaveProperty("type", "text");
      const analysisData = JSON.parse(analysisResult.content[0].text);
      expect(analysisData.success).toBe(true);

      // Step 2: Validate L0 invariants
      const l0Result = await harness.callTool(
        "validate_l0_invariants",
        {
          files: [join(testDir, ".github", "workflows", "ci.yml")],
          context: "test-owner/test-repo",
        },
        30000
      );

      expect(l0Result.content).toBeDefined();
      expect(l0Result.content[0]).toHaveProperty("type", "text");
      const l0Data = JSON.parse(l0Result.content[0].text);
      expect(l0Data.success).toBe(true);

      // Step 3: Check ADR compliance
      const complianceResult = await harness.callTool(
        "check_adr_compliance",
        {
          files: [join(testDir, ".github", "workflows", "ci.yml")],
          context: "test-owner/test-repo",
          adrPath: resolve(__dirname, "../../../../docs/adr"),
        },
        30000
      );

      expect(complianceResult.content).toBeDefined();
      expect(complianceResult.content[0]).toHaveProperty("type", "text");
      const complianceData = JSON.parse(complianceResult.content[0].text);
      expect(complianceData.success).toBe(true);
    });
  }, 120000);

  it("should handle consent check before data access workflow", async () => {
    await withTestHarness(
      async (harness: MCPTestHarness) => {
        await harness.initialize();

        // Step 1: Check consent requirements
        const consentResult = await harness.callTool(
          "check_consent_requirements",
          {
            orgId: "test-org",
            checkType: "summary",
            includePolicy: true,
          },
          30000
        );

        expect(consentResult.content).toBeDefined();
        expect(consentResult.content[0]).toHaveProperty("type", "text");
        const consentData = JSON.parse(consentResult.content[0].text);
        expect(consentData.success).toBe(true);

        // Step 2: Query FP store (should work with NoOp store in test)
        const fpResult = await harness.callTool(
          "query_fp_store",
          {
            queryType: "fp_rate",
            ruleId: "MD-001",
            orgId: "test-org",
          },
          30000
        );

        expect(fpResult.content).toBeDefined();
        expect(fpResult.content[0]).toHaveProperty("type", "text");
        const fpData = JSON.parse(fpResult.content[0].text);
        expect(fpData.success).toBe(true);
      },
      {
        // Use NoOp stores for testing (empty strings trigger NoOp stores)
        LOG_LEVEL: "error",
      }
    );
  }, 90000);

  it("should get server info", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      const result = await harness.callTool("get_server_info", {}, 10000);

      expect(result.content).toBeDefined();
      expect(result.content[0]).toHaveProperty("type", "text");
      const serverInfo = JSON.parse(result.content[0].text);
      expect(serverInfo.name).toBe("Phase Mirror MCP Server");
      expect(serverInfo.version).toBe("0.1.0");
      expect(serverInfo.config).toBeDefined();
    });
  }, 30000);

  it("should handle rapid sequential tool calls", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Fire multiple requests in quick succession
      const promises = [
        harness.callTool("get_server_info", {}, 10000),
        harness.callTool("get_server_info", {}, 10000),
        harness.callTool("get_server_info", {}, 10000),
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.content).toBeDefined();
        expect(result.content[0]).toHaveProperty("type", "text");
      });
    });
  }, 30000);

  it("should handle tool call errors gracefully", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // Call with invalid arguments
      try {
        await harness.callTool(
          "analyze_dissonance",
          {
            files: [], // Empty files array
            // Missing required context
            mode: "invalid_mode",
          },
          30000
        );
        fail("Should have thrown an error");
      } catch (error: any) {
        expect(error).toBeDefined();
        expect(error.message).toBeTruthy();
      }
    });
  }, 30000);

  it("should maintain state across multiple calls", async () => {
    await withTestHarness(async (harness: MCPTestHarness) => {
      await harness.initialize();

      // First call
      const result1 = await harness.callTool("get_server_info", {}, 10000);
      const info1 = JSON.parse(result1.content[0].text);

      // Second call
      const result2 = await harness.callTool("get_server_info", {}, 10000);
      const info2 = JSON.parse(result2.content[0].text);

      // Server info should be consistent
      expect(info1.version).toBe(info2.version);
      expect(info1.name).toBe(info2.name);
    });
  }, 30000);
});
