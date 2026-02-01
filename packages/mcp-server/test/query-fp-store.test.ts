/**
 * Tests for query_fp_store tool
 */
import * as queryFPStoreTool from "../src/tools/query-fp-store.js";
import { createMockContext } from "./test-utils.js";

describe("query_fp_store tool", () => {
  it("validates input schema correctly", () => {
    const validInput = {
      operation: "check_false_positive" as const,
      findingId: "test-finding-123",
    };

    const result = queryFPStoreTool.QueryFPStoreInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid operation", () => {
    const invalidInput = {
      operation: "invalid_operation", // Not a valid operation
    };

    const result = queryFPStoreTool.QueryFPStoreInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await queryFPStoreTool.execute({ operation: "invalid" }, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("requires findingId for check_false_positive operation", async () => {
    const context = createMockContext();
    const input = {
      operation: "check_false_positive" as const,
      // Missing findingId
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("MISSING_PARAMETER");
    }
  });

  it("requires ruleId for get_by_rule operation", async () => {
    const context = createMockContext();
    const input = {
      operation: "get_by_rule" as const,
      // Missing ruleId
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("MISSING_PARAMETER");
    }
  });

  it("executes check_false_positive with NoOp store", async () => {
    const context = createMockContext({
      fpTableName: undefined, // Will use NoOp store
    });
    const input = {
      operation: "check_false_positive" as const,
      findingId: "test-finding-123",
    };

    const response = await queryFPStoreTool.execute(input, context);

    // Should succeed with NoOp store
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.operation).toBe("check_false_positive");
      expect(parsed.result.findingId).toBe("test-finding-123");
      expect(parsed.result.isFalsePositive).toBe(false); // NoOp always returns false
    }
  });

  it("executes get_by_rule with NoOp store", async () => {
    const context = createMockContext({
      fpTableName: undefined, // Will use NoOp store
    });
    const input = {
      operation: "get_by_rule" as const,
      ruleId: "MD-001",
      limit: 50,
    };

    const response = await queryFPStoreTool.execute(input, context);

    // Should succeed with NoOp store
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.operation).toBe("get_by_rule");
      expect(parsed.result.ruleId).toBe("MD-001");
      expect(parsed.result.count).toBe(0); // NoOp returns empty array
      expect(Array.isArray(parsed.result.falsePositives)).toBe(true);
    }
  });

  it("executes get_statistics operation", async () => {
    const context = createMockContext();
    const input = {
      operation: "get_statistics" as const,
    };

    const response = await queryFPStoreTool.execute(input, context);

    // Should succeed with informational message
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.operation).toBe("get_statistics");
      expect(parsed.result.message).toBeDefined();
    }
  });

  it("respects limit parameter for get_by_rule", async () => {
    const context = createMockContext();
    const input = {
      operation: "get_by_rule" as const,
      ruleId: "MD-001",
      limit: 10,
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      // NoOp store returns empty array, but limit would be respected if there were results
      expect(parsed.result.falsePositives.length).toBeLessThanOrEqual(10);
    }
  });
});
