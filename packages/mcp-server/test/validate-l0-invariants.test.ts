import * as validateL0InvariantsTool from "../src/tools/validate-l0-invariants.js";
import { createMockContext } from "./test-utils.js";

describe("validate_l0_invariants tool", () => {
  it("validates input schema correctly", () => {
    const validInput = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-123",
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid input - missing required fields", () => {
    const invalidInput = {
      schemaVersion: "1.0:f7a8b9c0",
      // Missing other required fields
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("rejects invalid permissionBits (negative)", () => {
    const invalidInput = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: -1, // Invalid: negative
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce",
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("rejects invalid driftMagnitude (out of range)", () => {
    const invalidInput = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 1.5, // Invalid: > 1.0
      nonce: {
        value: "test-nonce",
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const result = validateL0InvariantsTool.ValidateL0InvariantsInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("returns error response for invalid input", async () => {
    const context = createMockContext();
    const response = await validateL0InvariantsTool.execute({ schemaVersion: "invalid" }, context);

    expect(response.isError).toBe(true);
    const content = response.content[0];
    if ('text' in content) {
      expect(content.text).toContain("INVALID_INPUT");
    }
  });

  it("executes validation successfully with valid state", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111, // Valid: no reserved bits
      driftMagnitude: 0.15, // Valid: below threshold
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(), // Fresh nonce
      },
      contractionWitnessScore: 1.0, // Perfect coherence
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.validation).toBeDefined();
      expect(parsed.validation.passed).toBe(true);
      expect(parsed.validation.decision).toBe("ALLOW");
      expect(parsed.validation.failedChecks).toHaveLength(0);
      expect(parsed.validation.checkResults).toBeDefined();
      expect(parsed.validation.performance).toBeDefined();
      expect(parsed.validation.performance.latencyNs).toBeDefined();
    }
  });

  it("detects schema hash failure", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:wronghash", // Invalid hash
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.success).toBe(true);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.decision).toBe("BLOCK");
      expect(parsed.validation.failedChecks).toContain("schema_hash");
      expect(parsed.message).toContain("BLOCKED");
    }
  });

  it("detects permission bits failure", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b1111111111111111, // Invalid: reserved bits set
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.failedChecks).toContain("permission_bits");
    }
  });

  it("detects drift magnitude failure", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.5, // Invalid: above threshold (0.3)
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.failedChecks).toContain("drift_magnitude");
    }
  });

  it("detects nonce freshness failure", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "old-nonce",
        issuedAt: Date.now() - (2 * 60 * 60 * 1000), // 2 hours ago (expired)
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.failedChecks).toContain("nonce_freshness");
    }
  });

  it("detects contraction witness failure", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 0.8, // Invalid: must be 1.0
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.failedChecks).toContain("contraction_witness");
    }
  });

  it("detects multiple failures", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:wronghash", // Fail 1
      permissionBits: 0b1111111111111111, // Fail 2
      driftMagnitude: 0.5, // Fail 3
      nonce: {
        value: "old-nonce",
        issuedAt: Date.now() - (2 * 60 * 60 * 1000), // Fail 4
      },
      contractionWitnessScore: 0.5, // Fail 5
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    expect(response.isError).toBeUndefined();
    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.passed).toBe(false);
      expect(parsed.validation.failedChecks.length).toBeGreaterThan(1);
    }
  });

  it("includes performance metrics in response", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.performance).toBeDefined();
      expect(parsed.validation.performance.latencyNs).toBeGreaterThan(0);
      expect(parsed.validation.performance.target).toBe("p99 < 100ns");
    }
  });

  it("includes detailed check results in response", async () => {
    const context = createMockContext();
    const input = {
      schemaVersion: "1.0:f7a8b9c0",
      permissionBits: 0b0000111111111111,
      driftMagnitude: 0.15,
      nonce: {
        value: "test-nonce-" + Date.now(),
        issuedAt: Date.now(),
      },
      contractionWitnessScore: 1.0,
    };

    const response = await validateL0InvariantsTool.execute(input, context);

    const content = response.content[0];
    if ('text' in content) {
      const parsed = JSON.parse(content.text);
      expect(parsed.validation.checkResults).toBeDefined();
      expect(parsed.validation.checkResults["L0-001 (Schema Hash)"]).toBeDefined();
      expect(parsed.validation.checkResults["L0-002 (Permission Bits)"]).toBeDefined();
      expect(parsed.validation.checkResults["L0-003 (Drift Magnitude)"]).toBeDefined();
      expect(parsed.validation.checkResults["L0-004 (Nonce Freshness)"]).toBeDefined();
      expect(parsed.validation.checkResults["L0-005 (Contraction Witness)"]).toBeDefined();
    }
  });
});
