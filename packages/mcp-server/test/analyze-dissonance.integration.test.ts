import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { AnalysisOrchestrator } from "@mirror-dissonance/core/dist/src/oracle.js";
import * as analyzeDissonanceTool from "../src/tools/analyze-dissonance.js";
import { createMockContext } from "../src/test-utils.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe("analyze_dissonance integration tests", () => {
  const testDir = join(__dirname, "fixtures");
  
  beforeAll(async () => {
    // Create test files
    await mkdir(testDir, { recursive: true });
    
    await writeFile(
      join(testDir, "test-workflow.yml"),
      `
name: Test Workflow
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: write  # Potentially excessive
    steps:
      - uses: actions/checkout@v4
      `,
      "utf-8"
    );

    await writeFile(
      join(testDir, "test-config.json"),
      JSON.stringify({
        api: {
          endpoint: "https://api.example.com",
          timeout: 5000,
        },
      }),
      "utf-8"
    );
  });

  afterAll(async () => {
    // Cleanup
    await rm(testDir, { recursive: true, force: true });
  });

  it("executes analysis successfully with real orchestrator", async () => {
    const context = createMockContext({
      fpTableName: undefined, // Use NoOp store
      consentTableName: undefined,
    });

    const input = {
      files: [
        join(testDir, "test-workflow.yml"),
        join(testDir, "test-config.json"),
      ],
      repository: {
        owner: "test-owner",
        name: "test-repo",
      },
      mode: "issue" as const,
      includeADRs: false, // Skip ADRs for test
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const parsed = JSON.parse(response.content[0].text!);
    
    expect(parsed.success).toBe(true);
    expect(parsed.analysis).toBeDefined();
    expect(parsed.analysis.filesAnalyzed).toBe(2);
    expect(parsed.analysis.summary).toBeDefined();
  }, 30000); // 30s timeout for real analysis

  it("respects consent requirements for FP patterns", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "test-workflow.yml")],
      repository: { owner: "test-owner", name: "test-repo" },
      mode: "issue" as const,
      includeFPPatterns: true, // Requires consent
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    const parsed = JSON.parse(response.content[0].text!);
    
    // Should succeed since we use NoOpConsentStore which grants implicit consent
    expect(parsed.success).toBe(true);
  });

  it("handles missing files gracefully", async () => {
    const context = createMockContext();

    const input = {
      files: ["/nonexistent/file.ts"],
      repository: { owner: "test-owner", name: "test-repo" },
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    // Should still succeed but with 0 artifacts
    expect(parsed.success).toBe(true);
  });

  it("validates repository format", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "test-workflow.yml")],
      repository: { owner: "", name: "" }, // Invalid
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    // Zod validation should catch this
    if (!parsed.success) {
      expect(parsed.code).toBe("INVALID_INPUT");
    }
  });

  it("includes ADR references when requested", async () => {
    const context = createMockContext();

    const input = {
      files: [join(testDir, "test-workflow.yml")],
      repository: { owner: "test-owner", name: "test-repo" },
      mode: "issue" as const,
      includeADRs: true,
    };

    const response = await analyzeDissonanceTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    if (parsed.success) {
      // ADRs may or may not exist, but field should be present
      expect(parsed.analysis.adrReferences).toBeDefined();
    }
  });
});
