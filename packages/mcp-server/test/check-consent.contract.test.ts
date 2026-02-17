/**
 * Contract test: check_consent_requirements respects governance floor
 * in local vs cloud mode as Tier 1 authoritative tool.
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";

const baseContext = {
  config: { awsRegion: "us-east-1", logLevel: "info" as const },
  requestId: "consent-contract-test",
  timestamp: new Date("2026-02-17T00:00:00Z"),
};

describe("check_consent_requirements governance contract", () => {
  describe("local mode (authoritative + local = degraded)", () => {
    it("degrades consent block to advisory warning", () => {
      // Consent tool found missing consents and wants to block
      const raw = {
        success: true,
        decision: "block" as const,
        code: "CONSENT_REQUIRED",
        data: {
          checkType: "required_for_operation",
          canProceed: false,
          blockedReason: "Missing consent for fp_patterns",
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
      expect(envelope.decision).toBe("warn");
      expect(envelope.isError).toBe(false);
      // Code preserved — authoritative tools may carry CONSENT_REQUIRED
      expect(envelope.code).toBe("CONSENT_REQUIRED");
    });

    it("allows valid consent to pass through in local mode", () => {
      const raw = {
        success: true,
        decision: "pass" as const,
        data: {
          checkType: "validate",
          validation: { allValid: true },
          compliance: { gdprCompliant: true, adr004Compliant: true },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "local",
      } as NormalizeContext);

      expect(envelope.degradedMode).toBe(true); // always degraded in local
      expect(envelope.decision).toBe("pass");
    });
  });

  describe("cloud mode (authoritative + cloud = binding)", () => {
    it("allows consent blocking in cloud mode", () => {
      const raw = {
        success: true,
        decision: "block" as const,
        code: "CONSENT_REQUIRED",
        data: {
          checkType: "required_for_operation",
          canProceed: false,
          blockedReason: "Missing consent for fp_patterns, fp_metrics",
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("block");
      expect(envelope.code).toBe("CONSENT_REQUIRED");
      expect(envelope.degradedMode).toBeUndefined();
    });

    it("passes clean consent validation", () => {
      const raw = {
        success: true,
        decision: "pass" as const,
        data: {
          checkType: "summary",
          consentSummary: { hasAnyConsent: true },
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

  describe("decision derivation from consent results", () => {
    it("derives block from canProceed:false", () => {
      // The consent tool doesn't emit a decision field itself —
      // the server derives it from canProceed
      const raw = {
        success: true,
        decision: "block" as const,
        data: {
          checkType: "required_for_operation",
          canProceed: false,
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("block");
    });

    it("derives pass from canProceed:true", () => {
      const raw = {
        success: true,
        decision: "pass" as const,
        data: {
          checkType: "required_for_operation",
          canProceed: true,
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("pass");
    });

    it("derives warn from validation.allValid:false", () => {
      const raw = {
        success: true,
        decision: "warn" as const,
        data: {
          checkType: "validate",
          validation: { allValid: false, issues: { missingConsents: ["fp_patterns"] } },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "authoritative",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("warn");
    });
  });
});
