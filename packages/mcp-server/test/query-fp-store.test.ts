/**
 * Tests for query_fp_store tool
 */
import * as queryFPStoreTool from "../src/tools/query-fp-store.js";
import { createMockContext } from "./test-utils.js";

describe("query_fp_store tool", () => {
  it("validates input schema correctly", () => {
    const validInput = {
      queryType: "fp_rate" as const,
      ruleId: "MD-001",
      orgId: "test-org",
    };

    const result = queryFPStoreTool.QueryFPStoreInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid query type", () => {
    const invalidInput = {
      queryType: "invalid_operation", // Not a valid query type
      orgId: "test-org",
    };

    const result = queryFPStoreTool.QueryFPStoreInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("requires orgId parameter", () => {
    const invalidInput = {
      queryType: "fp_rate" as const,
      ruleId: "MD-001",
      // Missing orgId
    };

    const result = queryFPStoreTool.QueryFPStoreInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await queryFPStoreTool.execute({ queryType: "invalid", orgId: "test" }, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("requires ruleId for fp_rate queryType", async () => {
    const context = createMockContext({
      consentTableName: undefined, // NoOp consent store will allow access
    });
    const input = {
      queryType: "fp_rate" as const,
      orgId: "test-org",
      // Missing ruleId
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("ruleId is required");
    }
  });

  it("requires ruleIds for cross_rule_comparison queryType", async () => {
    const context = createMockContext({
      consentTableName: undefined, // NoOp consent store will allow access
    });
    const input = {
      queryType: "cross_rule_comparison" as const,
      orgId: "test-org",
      // Missing ruleIds
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("ruleIds array is required");
    }
  });

  it("executes fp_rate with NoOp store", async () => {
    const context = createMockContext({
      fpTableName: undefined, // Will use NoOp store
      consentTableName: undefined, // Will use NoOp consent store
    });
    const input = {
      queryType: "fp_rate" as const,
      ruleId: "MD-001",
      orgId: "test-org",
    };

    const response = await queryFPStoreTool.execute(input, context);

    // Should succeed with NoOp store
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.query.type).toBe("fp_rate");
      expect(parsed.result.queryType).toBe("fp_rate");
      expect(parsed.result.ruleId).toBe("MD-001");
      expect(parsed.compliance.consentVerified).toBe(true);
    }
  });

  it("executes recent_patterns with NoOp store", async () => {
    const context = createMockContext({
      fpTableName: undefined,
      consentTableName: undefined,
    });
    const input = {
      queryType: "recent_patterns" as const,
      ruleId: "MD-001",
      orgId: "test-org",
      limit: 50,
      daysBack: 30,
    };

    const response = await queryFPStoreTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.query.type).toBe("recent_patterns");
      expect(parsed.result.queryType).toBe("recent_patterns");
      expect(Array.isArray(parsed.result.patterns)).toBe(true);
    }
  });
});
