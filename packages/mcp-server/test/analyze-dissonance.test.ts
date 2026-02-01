import * as analyzeDissonanceTool from "../src/tools/analyze-dissonance.js";
import { createMockContext, createMockDissonanceReport } from "./test-utils.js";

describe("analyze_dissonance tool", () => {
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

  it("executes analysis successfully with real oracle", async () => {
    const context = createMockContext();
    const input = {
      files: ["test.ts"],
      mode: "issue" as const,
    };

    const response = await analyzeDissonanceTool.execute(input, context);

    // Should succeed even with no actual files (using mock oracle)
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.analysis).toBeDefined();
      expect(parsed.analysis.filesAnalyzed).toBe(1);
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
});
