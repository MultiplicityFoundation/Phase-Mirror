/**
 * Contract test: validate_l0_invariants respects governance floor
 * in local vs cloud mode.
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";

const baseConfig = {
  awsRegion: "us-east-1",
  logLevel: "info" as const,
};

const baseContext = {
  config: baseConfig,
  requestId: "l0-contract-test",
  timestamp: new Date("2026-02-01T00:00:00Z"),
};

describe("validate_l0_invariants contract", () => {
  it("respects governance floor in local mode — degrades and does not block", () => {
    // Simulate an L0 tool that found violations and wants to block
    const raw = {
      success: true,
      decision: "block" as const,
      data: {
        validation: {
          allPassed: false,
          checksRun: 1,
          passed: 0,
          failed: 1,
          results: [
            { check: "drift-magnitude", passed: false, message: "Drift exceeds threshold" },
          ],
        },
      },
    };

    const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "local",
    } as NormalizeContext);

    // In local mode, authoritative tools are degraded and non-blocking
    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("local");
    expect(envelope.degradedMode).toBe(true);
    expect(envelope.decision).not.toBe("block");
    expect(envelope.decision).toBe("warn");
    expect(envelope.isError).toBe(false);
    // Data is still available for advisory consumption
    expect(envelope.data).toBeDefined();
  });

  it("allows authoritative block in cloud mode", () => {
    const raw = {
      success: true,
      decision: "block" as const,
      code: "INVARIANT_VIOLATION",
      data: {
        validation: {
          allPassed: false,
          checksRun: 1,
          passed: 0,
          failed: 1,
        },
      },
    };

    const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "cloud",
    } as NormalizeContext);

    // Cloud mode: authoritative tools can block
    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("cloud");
    expect(envelope.decision).toBe("block");
    expect(envelope.code).toBe("INVARIANT_VIOLATION");
    expect(envelope.degradedMode).toBeUndefined();
  });

  it("passes through clean validation results in cloud mode", () => {
    const raw = {
      success: true,
      decision: "pass" as const,
      data: {
        validation: {
          allPassed: true,
          checksRun: 5,
          passed: 5,
          failed: 0,
        },
      },
    };

    const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.success).toBe(true);
    expect(envelope.decision).toBe("pass");
    expect(envelope.degradedMode).toBeUndefined();
  });

  it("carries through execution errors with proper envelope", () => {
    const raw = {
      success: false,
      code: "EXECUTION_FAILED",
      message: "L0 validator threw an error",
      isError: true,
    };

    const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "local",
    } as NormalizeContext);

    expect(envelope.success).toBe(false);
    expect(envelope.code).toBe("EXECUTION_FAILED");
    expect(envelope.isError).toBe(true);
    expect(envelope.degradedMode).toBe(true);
    expect(envelope.tier).toBe("authoritative");
  });
});
