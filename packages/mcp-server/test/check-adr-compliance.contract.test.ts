/**
 * Contract test: check_adr_compliance respects governance floor
 * in local vs cloud mode as Tier 1 authoritative tool.
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";

const baseContext = {
  config: { awsRegion: "us-east-1", logLevel: "info" as const },
  requestId: "adr-contract-test",
  timestamp: new Date("2026-02-17T00:00:00Z"),
};

describe("check_adr_compliance governance contract", () => {
  describe("local mode (authoritative + local = degraded)", () => {
    it("degrades ADR compliance violations to advisory warnings", () => {
      // Simulate ADR tool finding non-compliance and wanting to warn
      const raw = {
        success: true,
        decision: "warn" as const,
        data: {
          compliance: {
            compliant: false,
            filesChecked: 3,
            adrsChecked: 2,
            violations: [
              { adrId: "ADR-001", file: "src/index.ts", severity: "high" },
            ],
            violationSummary: { total: 1, high: 1, medium: 0, low: 0 },
          },
        },
      };

      const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "local",
      } as NormalizeContext);

      expect(envelope.tier).toBe("authoritative");
      expect(envelope.environment).toBe("local");
      expect(envelope.degradedMode).toBe(true);
      expect(envelope.decision).toBe("warn"); // warn stays warn
      expect(envelope.isError).toBe(false);
      expect(envelope.success).toBe(true);
    });

    it("downgrades ADR block decision to warn in local mode", () => {
      const raw = {
        success: true,
        decision: "block" as const,
        code: "INVARIANT_VIOLATION",
        data: {
          compliance: { compliant: false, violations: [{ adrId: "ADR-003" }] },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "local",
      } as NormalizeContext);

      expect(envelope.degradedMode).toBe(true);
      expect(envelope.decision).toBe("warn");
      // Code preserved (authoritative can still carry L0 codes, just can't block)
      expect(envelope.code).toBe("INVARIANT_VIOLATION");
    });
  });

  describe("cloud mode (authoritative + cloud = binding)", () => {
    it("allows ADR compliance blocking in cloud mode", () => {
      const raw = {
        success: true,
        decision: "block" as const,
        data: {
          compliance: { compliant: false, violations: [{ adrId: "ADR-005" }] },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.tier).toBe("authoritative");
      expect(envelope.environment).toBe("cloud");
      expect(envelope.decision).toBe("block");
      expect(envelope.degradedMode).toBeUndefined();
    });

    it("passes through clean compliance results", () => {
      const raw = {
        success: true,
        decision: "pass" as const,
        data: {
          compliance: { compliant: true, violations: [] },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("pass");
      expect(envelope.success).toBe(true);
    });
  });

  describe("envelope metadata", () => {
    it("includes requestId and ISO timestamp", () => {
      const raw = { success: true, data: { compliance: { compliant: true } } };
      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.requestId).toBe("adr-contract-test");
      expect(envelope.timestamp).toBe("2026-02-17T00:00:00.000Z");
    });
  });
});
