/**
 * Tests for check_adr_compliance tool
 */
import * as checkADRComplianceTool from "../src/tools/check-adr-compliance.js";
import { createMockContext } from "./test-utils.js";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("check_adr_compliance tool", () => {
  let testDir: string;
  let adrDir: string;
  let testFile: string;

  beforeAll(async () => {
    // Create a temporary test directory with unique name
    testDir = join(tmpdir(), `mcp-test-adr-${Date.now()}-${process.pid}`);
    await mkdir(testDir, { recursive: true });
    
    // Create ADR directory
    adrDir = join(testDir, "docs", "adr");
    await mkdir(adrDir, { recursive: true });

    // Create a test ADR file
    const adrContent = `# ADR-001: Test ADR

**Status:** Approved  
**Date:** 2026-01-01  
**Tags:** test, security

---

## Context

This is a test ADR for validation.

---

## Decision

All code MUST NOT use deprecated APIs.

Code SHALL follow best practices.

---

## Consequences

Better code quality.

---

## Compliance Checks

Automated checks verify no deprecated APIs are used.
`;
    await writeFile(join(adrDir, "ADR-001-test-adr.md"), adrContent);

    // Create a test file
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
      adrs: ["ADR-001"],
      adrPath: "docs/adr",
      context: "Test context",
    };

    const result = checkADRComplianceTool.CheckADRComplianceInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid input", () => {
    const invalidInput = {
      files: "not-an-array", // Should be array
    };

    const result = checkADRComplianceTool.CheckADRComplianceInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await checkADRComplianceTool.execute({ files: "invalid" }, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("executes compliance check successfully", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      adrPath: adrDir,
      context: "Testing ADR compliance",
    };

    const response = await checkADRComplianceTool.execute(input, context);

    // Should succeed
    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.compliance).toBeDefined();
      expect(parsed.compliance.adrList).toContain("ADR-001");
      expect(Array.isArray(parsed.compliance.violations)).toBe(true);
    }
  });

  it("filters to requested ADRs", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      adrs: ["ADR-001"],
      adrPath: adrDir,
    };

    const response = await checkADRComplianceTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.compliance.adrList).toEqual(["ADR-001"]);
    }
  });

  it("handles non-existent ADR directory gracefully", async () => {
    const context = createMockContext();
    const input = {
      files: [testFile],
      adrPath: "/non/existent/path",
    };

    const response = await checkADRComplianceTool.execute(input, context);

    // Should fail gracefully
    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("EXECUTION_FAILED");
    }
  });
});
