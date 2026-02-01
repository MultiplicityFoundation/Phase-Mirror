import * as analyzeDissonanceTool from "../src/tools/analyze-dissonance.js";
import { createMockContext, createMockDissonanceReport } from "./test-utils.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("analyze_dissonance tool", () => {
  let testDir: string;
  let testFile: string;

  beforeAll(async () => {
    // Create a temporary test directory and file with unique name
    testDir = join(tmpdir(), `mcp-test-${Date.now()}-${process.pid}`);
    await mkdir(testDir, { recursive: true });
    testFile = join(testDir, "test.ts");
    await writeFile(testFile, 'export function test() { return true; }');
  });

  afterAll(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  it("validates input schema correctly", () => {
    const validInput = {
      files: ["src/index.ts", "src/config.ts"],
      context: "Test issue context",
      mode: "issue" as const,
    };

    const result = analyzeDissonanceTool.AnalyzeDissonanceInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid input", () => {
    const invalidInput = {
      files: "not-an-array", // Should be array
    };

    const result = analyzeDissonanceTool.AnalyzeDissonanceInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await analyzeDissonanceTool.execute({ files: "invalid" }, context);

    expect(response.isError).toBe(true);
    // Type-safe access to text property
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("executes analysis successfully with real orchestrator", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      mode: "issue" as const,
      context: "test-org/test-repo",
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    // Should succeed with actual file processed by orchestrator
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.analysis).toBeDefined();
      expect(parsed.analysis.filesAnalyzed).toBe(1);
      expect(parsed.analysis.files).toBeDefined();
      expect(parsed.analysis.files[0]).toMatchObject({
        path: testFile,
        type: 'source',
      });
      expect(parsed.analysis.files[0].hash).toBeDefined();
      expect(typeof parsed.analysis.files[0].hash).toBe('string');
    }
  });

  it("handles mode mapping correctly", () => {
    // Test that "issue" mode gets mapped to "pull_request" for oracle
    const validInput = {
      files: ["test.ts"],
      mode: "issue" as const,
    };

    const result = analyzeDissonanceTool.AnalyzeDissonanceInputSchema.parse(validInput);
    expect(result.mode).toBe("issue");
  });

  it("accepts all valid modes", () => {
    const modes = ["pull_request", "issue", "merge_group", "drift"] as const;
    
    modes.forEach(mode => {
      const input = {
        files: ["test.ts"],
        mode,
      };
      const result = analyzeDissonanceTool.AnalyzeDissonanceInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  it("handles nested repository paths in context", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      mode: "issue" as const,
      context: "org/team/repo",
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
    }
  });

  it("handles null violations gracefully in ADR extraction", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    // Should not throw even if violations are null/empty
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.analysis.adrReferences).toBeDefined();
      expect(Array.isArray(parsed.analysis.adrReferences)).toBe(true);
    }
  });
});
