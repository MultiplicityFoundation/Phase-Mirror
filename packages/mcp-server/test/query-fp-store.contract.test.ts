/**
 * Contract test: query_fp_store is an experimental (Tier 2) tool.
 *
 * As the first MCP-first Tier 2 tool, it ships before any core
 * library support. The governance floor must ensure:
 *   - It NEVER emits decision:"block"
 *   - It NEVER surfaces L0-only codes (CONSENT_REQUIRED is stripped)
 *   - It provides advisory-only analytics
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";

const baseContext = {
  config: { awsRegion: "us-east-1", logLevel: "info" as const },
  requestId: "fp-store-contract-test",
  timestamp: new Date("2026-02-17T00:00:00Z"),
};

describe("query_fp_store Tier 2 governance contract", () => {
  describe("CONSENT_REQUIRED code stripping", () => {
    it("strips CONSENT_REQUIRED code from experimental tool in cloud mode", () => {
      // The query_fp_store tool actually emits CONSENT_REQUIRED when consent
      // is not granted. The governance floor must strip this L0-only code.
      const raw = {
        success: false,
        code: "CONSENT_REQUIRED",
        message: "Organization 'test-org' has not granted consent for FP data access",
        isError: true as boolean | undefined,
        data: {
          error: "Consent required",
          learnMore: "https://phasemirror.com/docs/fp-store-consent",
        },
      };

      const envelope: MCPGovernanceEnvelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      // CONSENT_REQUIRED is an L0-only code — must be stripped
      expect(envelope.code).not.toBe("CONSENT_REQUIRED");
      expect(envelope.code).toBeUndefined();
      // Tool-level success stays false (tool did fail)
      expect(envelope.success).toBe(false);
      // Tier is correctly labeled
      expect(envelope.tier).toBe("experimental");
    });

    it("strips CONSENT_REQUIRED in local mode too", () => {
      const raw = {
        success: false,
        code: "CONSENT_REQUIRED",
        message: "Consent gate triggered",
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "local",
      } as NormalizeContext);

      expect(envelope.code).toBeUndefined();
      expect(envelope.tier).toBe("experimental");
    });
  });

  describe("decision clamping", () => {
    it("downgrades any block decision to warn", () => {
      const raw = {
        success: true,
        decision: "block" as const,
        data: { result: { queryType: "fp_rate", fpr: 0.15 } },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).not.toBe("block");
      expect(envelope.decision).toBe("warn");
    });

    it("allows warn decisions through", () => {
      const raw = {
        success: true,
        decision: "warn" as const,
        data: { result: { queryType: "fp_rate", fpr: 0.08 } },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("warn");
    });

    it("allows pass decisions through", () => {
      const raw = {
        success: true,
        decision: "pass" as const,
        data: {
          result: { queryType: "recent_patterns", patternsFound: 3 },
          compliance: { consentVerified: true, dataAnonymized: true },
        },
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.decision).toBe("pass");
    });
  });

  describe("successful analytics passthrough", () => {
    it("preserves analytics data in the envelope", () => {
      const analyticsData = {
        query: { type: "fp_rate", parameters: { ruleId: "MD-001", orgId: "test-org" } },
        result: {
          queryType: "fp_rate",
          ruleId: "MD-001",
          fpr: 0.042,
          confidence: "high",
          recommendation: "FPR within acceptable range",
        },
        performance: { elapsedMs: 12 },
        compliance: { consentVerified: true, dataAnonymized: true },
      };

      const raw = {
        success: true,
        decision: "pass" as const,
        data: analyticsData,
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.success).toBe(true);
      expect(envelope.tier).toBe("experimental");
      expect(envelope.data).toEqual(analyticsData);
    });
  });

  describe("error handling", () => {
    it("passes through INVALID_INPUT without stripping (not L0-only)", () => {
      const raw = {
        success: false,
        code: "INVALID_INPUT",
        message: "Invalid queryType",
        isError: true as boolean | undefined,
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      // INVALID_INPUT is not L0-only, so it's preserved
      expect(envelope.code).toBe("INVALID_INPUT");
      expect(envelope.success).toBe(false);
    });

    it("passes through EXECUTION_FAILED without stripping", () => {
      const raw = {
        success: false,
        code: "EXECUTION_FAILED",
        message: "DynamoDB timeout",
      };

      const envelope = normalizeResponse(raw, {
        ...baseContext,
        tier: "experimental",
        environment: "cloud",
      } as NormalizeContext);

      expect(envelope.code).toBe("EXECUTION_FAILED");
    });
  });
});
