import * as validateL0InvariantsTool from "../src/tools/validate-l0-invariants.js";
import { createMockContext } from "./test-utils.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("validate_l0_invariants tool (flexible API)", () => {
  let testDir: string;

  beforeEach(() => {
    // Create temp directory for test files
    testDir = join(tmpdir(), `l0-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  it("validates input schema correctly with optional fields", () => {
    const validInput = {
      checks: ["schema_hash", "drift_magnitude"],
      driftCheck: {
        currentMetric: { name: "test", value: 100 },
        baselineMetric: { name: "test", value: 90 },
      },
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid input - bad check names", () => {
    const invalidInput = {
      checks: ["invalid_check_name"],
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await validateL0InvariantsTool.execute({ checks: ["invalid"] }, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("executes drift magnitude check successfully", async () => {
    const context = createMockContext();
    const input = {
      driftCheck: {
        currentMetric: { name: "violations", value: 10 },
        baselineMetric: { name: "violations", value: 9 },
        threshold: 0.5,
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.validation).toBeDefined();
      expect(parsed.validation.checksRun).toBe(1);
      expect(parsed.validation.results[0].invariantId).toBe("L0-003");
    }
  });

  it("detects drift magnitude violation", async () => {
    const context = createMockContext();
    const input = {
      driftCheck: {
        currentMetric: { name: "violations", value: 200 },
        baselineMetric: { name: "violations", value: 100 },
        threshold: 0.5, // 50%
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(false);
      expect(parsed.validation.failed).toBe(1);
      expect(parsed.validation.results[0].passed).toBe(false);
      expect(parsed.validation.results[0].message).toContain("exceeds threshold");
    }
  });

  it("executes nonce freshness check successfully", async () => {
    const context = createMockContext();
    const now = new Date();
    const input = {
      nonceValidation: {
        nonce: "test-nonce-123",
        timestamp: now.toISOString(),
        maxAgeSeconds: 3600,
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(true);
      expect(parsed.validation.results[0].invariantId).toBe("L0-004");
      expect(parsed.validation.results[0].passed).toBe(true);
    }
  });

  it("detects expired nonce", async () => {
    const context = createMockContext();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const input = {
      nonceValidation: {
        nonce: "old-nonce",
        timestamp: twoHoursAgo.toISOString(),
        maxAgeSeconds: 3600, // 1 hour
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(false);
      expect(parsed.validation.results[0].passed).toBe(false);
      expect(parsed.validation.results[0].message).toContain("expired");
    }
  });

  it("executes contraction witness check successfully", async () => {
    const context = createMockContext();
    const input = {
      contractionCheck: {
        previousFPR: 0.15,
        currentFPR: 0.10,
        witnessEventCount: 15,
        minRequiredEvents: 10,
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(true);
      expect(parsed.validation.results[0].invariantId).toBe("L0-005");
      expect(parsed.validation.results[0].passed).toBe(true);
    }
  });

  it("detects insufficient witness events", async () => {
    const context = createMockContext();
    const input = {
      contractionCheck: {
        previousFPR: 0.15,
        currentFPR: 0.10,
        witnessEventCount: 5, // Too few
        minRequiredEvents: 10,
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(false);
      expect(parsed.validation.results[0].passed).toBe(false);
      expect(parsed.validation.results[0].message).toContain("Insufficient evidence");
    }
  });

  it("executes schema hash check with file", async () => {
    const context = createMockContext();
    const schemaFile = join(testDir, "test-schema.json");
    const schemaContent = JSON.stringify({ version: "1.0", type: "test" });
    writeFileSync(schemaFile, schemaContent);

    // Calculate expected hash (first 8 chars of SHA-256)
    const crypto = await import("crypto");
    const hash = crypto.createHash('sha256').update(schemaContent).digest('hex').substring(0, 8);

    const input = {
      schemaFile,
      expectedSchemaHash: hash,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(true);
      expect(parsed.validation.results[0].invariantId).toBe("L0-001");
      expect(parsed.validation.results[0].passed).toBe(true);
    }
  });

  it("detects schema hash mismatch", async () => {
    const context = createMockContext();
    const schemaFile = join(testDir, "test-schema-2.json");
    const schemaContent = JSON.stringify({ version: "1.0", type: "test" });
    writeFileSync(schemaFile, schemaContent);

    const input = {
      schemaFile,
      expectedSchemaHash: "wronghash",
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(false);
      expect(parsed.validation.results[0].passed).toBe(false);
      expect(parsed.validation.results[0].message).toContain("mismatch");
    }
  });

  it("executes workflow permission check", async () => {
    const context = createMockContext();
    const workflowFile = join(testDir, "test-workflow.yml");
    const workflowContent = `
name: Test
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v2
`;
    writeFileSync(workflowFile, workflowContent);

    const input = {
      workflowFiles: [workflowFile],
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(true);
      expect(parsed.validation.results[0].invariantId).toBe("L0-002");
      expect(parsed.validation.results[0].passed).toBe(true);
    }
  });

  it("detects excessive workflow permissions", async () => {
    const context = createMockContext();
    const workflowFile = join(testDir, "bad-workflow.yml");
    const workflowContent = `
name: Test
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    permissions: write-all
    steps:
      - uses: actions/checkout@v2
`;
    writeFileSync(workflowFile, workflowContent);

    const input = {
      workflowFiles: [workflowFile],
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.allPassed).toBe(false);
      expect(parsed.validation.results[0].passed).toBe(false);
      expect(parsed.validation.results[0].message).toContain("excessive permissions");
    }
  });

  it("executes multiple checks in one call", async () => {
    const context = createMockContext();
    const input = {
      driftCheck: {
        currentMetric: { name: "test", value: 10 },
        baselineMetric: { name: "test", value: 9 },
      },
      nonceValidation: {
        nonce: "test-nonce",
        timestamp: new Date().toISOString(),
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.checksRun).toBe(2);
      expect(parsed.validation.results.length).toBe(2);
    }
  });

  it("filters to requested checks only", async () => {
    const context = createMockContext();
    const input = {
      checks: ["drift_magnitude"],  // Only request drift check
      driftCheck: {
        currentMetric: { name: "test", value: 10 },
        baselineMetric: { name: "test", value: 9 },
      },
      nonceValidation: {
        nonce: "test-nonce",
        timestamp: new Date().toISOString(),
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.checksRun).toBe(1);
      expect(parsed.validation.results[0].invariantId).toBe("L0-003");
    }
  });

  it("includes performance metrics in response", async () => {
    const context = createMockContext();
    const input = {
      driftCheck: {
        currentMetric: { name: "test", value: 10 },
        baselineMetric: { name: "test", value: 9 },
      },
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.performanceNs).toBeDefined();
      expect(parsed.validation.withinPerformanceTarget).toBeDefined();
      expect(parsed.validation.performanceNs).toBeGreaterThan(0);
    }
  });
});
