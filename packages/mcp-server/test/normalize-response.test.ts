import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPServerConfig } from "../src/types/index.js";

const baseConfig: MCPServerConfig = {
  awsRegion: "us-east-1",
  logLevel: "info",
};

const baseContext = {
  config: baseConfig,
  requestId: "test-request-id",
  timestamp: new Date("2026-02-01T00:00:00Z"),
} as const;

describe("MCP governance floor", () => {
  it("clamps experimental decision:block to advisory and strips L0-only codes", () => {
    const raw = {
      success: true,
      code: "INVARIANT_VIOLATION",
      message: "Pretend L0 failure from buggy tool",
      decision: "block" as const,
      data: { some: "payload" },
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.tier).toBe("experimental");
    expect(envelope.environment).toBe("cloud");
    expect(envelope.decision).not.toBe("block");
    expect(envelope.code).not.toBe("INVARIANT_VIOLATION");
    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual(raw.data);
    expect(envelope.isError).toBe(false);
  });

  it("marks authoritative tools in local mode as degraded and non-blocking", () => {
    const raw = {
      success: true,
      code: "INVARIANT_VIOLATION",
      decision: "block" as const,
      data: { some: "payload" },
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "local",
    } as NormalizeContext);

    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("local");
    expect(envelope.degradedMode).toBe(true);
    expect(envelope.decision).not.toBe("block");
    expect(envelope.isError).toBe(false);
  });

  it("preserves tool-level success:false without flipping to true", () => {
    const raw = {
      success: false,
      code: "EXECUTION_FAILED",
      message: "Tool crashed",
      decision: "block" as const,
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    // success remains false (tool failure)
    expect(envelope.success).toBe(false);
    // but decision was clamped
    expect(envelope.decision).not.toBe("block");
  });

  it("strips CONSENT_REQUIRED code from experimental tools", () => {
    const raw = {
      success: true,
      code: "CONSENT_REQUIRED",
      message: "Consent needed",
      decision: "pass" as const,
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.code).toBeUndefined();
  });

  it("allows authoritative tools in cloud mode to emit block decisions", () => {
    const raw = {
      success: true,
      code: "INVARIANT_VIOLATION",
      decision: "block" as const,
      data: { violation: true },
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.tier).toBe("authoritative");
    expect(envelope.environment).toBe("cloud");
    expect(envelope.decision).toBe("block");
    expect(envelope.code).toBe("INVARIANT_VIOLATION");
    expect(envelope.degradedMode).toBeUndefined();
  });

  it("preserves pass/warn decisions for experimental tools", () => {
    const raw = {
      success: true,
      decision: "warn" as const,
      message: "Advisory warning",
    };

    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.decision).toBe("warn");
  });

  it("serializes timestamp to ISO string", () => {
    const raw = { success: true };
    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "experimental",
      environment: "local",
    } as NormalizeContext);

    expect(envelope.timestamp).toBe("2026-02-01T00:00:00.000Z");
  });

  it("carries through requestId from context", () => {
    const raw = { success: true };
    const envelope = normalizeResponse(raw, {
      ...baseContext,
      tier: "authoritative",
      environment: "cloud",
    } as NormalizeContext);

    expect(envelope.requestId).toBe("test-request-id");
  });
});
