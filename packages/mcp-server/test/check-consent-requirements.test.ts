import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as checkConsentTool from "../src/tools/check-consent-requirements.js";
import { createMockContext } from "./test-utils.js";
import { CONSENT_RESOURCES } from "@mirror-dissonance/core/dist/src/consent-store/index.js";

describe("check_consent_requirements tool", () => {
  it("validates input schema correctly", () => {
    const validInput = {
      orgId: "test-org",
      checkType: "summary",
    };

    const result = checkConsentTool.CheckConsentRequirementsInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects invalid checkType", () => {
    const invalidInput = {
      orgId: "test-org",
      checkType: "invalid_type",
    };

    const result = checkConsentTool.CheckConsentRequirementsInputSchema.safeParse(invalidInput);
    expect(result.success).toBe(false);
  });

  it("validates single resource consent", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "validate",
      resources: ["fp_patterns"],
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.checkType).toBe("validate");
    expect(parsed.validation.checkedResources).toContain("fp_patterns");
  });

  it("validates multiple resources", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "validate",
      resources: ["fp_patterns", "fp_metrics"],
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.validation.checkedResources).toHaveLength(2);
  });

  it("returns consent summary", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "summary",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.consentSummary).toBeDefined();
    expect(parsed.consentSummary.statistics.totalResources).toBe(CONSENT_RESOURCES.length);
  });

  it("checks required consents for operation", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "required_for_operation",
      tool: "query_fp_store",
      operation: "fp_rate",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.requiredConsents.tool).toBe("query_fp_store");
    expect(parsed.requiredConsents.operation).toBe("fp_rate");
    expect(parsed.requiredConsents.requiredResources).toContain("fp_metrics");
  });

  it("handles operation with no consent required", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "required_for_operation",
      tool: "check_adr_compliance",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.requiredConsents.requiresConsent).toBe(false);
    expect(parsed.canProceed).toBe(true);
  });

  it("includes policy details when requested", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "summary",
      includePolicy: true,
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.policy).toBeDefined();
    expect(parsed.policy.version).toBeDefined();
    expect(parsed.policy.resources).toBeDefined();
  });

  it("returns error when resources missing for validate", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "validate",
      // Missing resources
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("MISSING_PARAMETER");
  });

  it("returns error when tool missing for required_for_operation", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "required_for_operation",
      // Missing tool
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(false);
    expect(parsed.code).toBe("MISSING_PARAMETER");
  });

  it("provides recommendations for missing consent", async () => {
    const context = createMockContext();

    // Use a custom context that simulates missing consent
    // (In NoOp mode all consents are granted, so we test the structure)
    const input = {
      orgId: "PhaseMirror",
      checkType: "validate",
      resources: ["fp_patterns"],
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.recommendations).toBeDefined();
    expect(Array.isArray(parsed.recommendations)).toBe(true);
  });

  it("includes compliance information", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "summary",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.compliance).toBeDefined();
    expect(parsed.compliance.gdprCompliant).toBe(true);
    expect(parsed.compliance.adr004Compliant).toBe(true);
    expect(parsed.compliance.policyVersion).toBeDefined();
  });

  it("includes resource details for required_for_operation with policy", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "required_for_operation",
      tool: "query_fp_store",
      operation: "cross_rule_comparison",
      includePolicy: true,
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.success).toBe(true);
    expect(parsed.resourceDetails).toBeDefined();
    expect(Array.isArray(parsed.resourceDetails)).toBe(true);
    if (parsed.resourceDetails && parsed.resourceDetails.length > 0) {
      expect(parsed.resourceDetails[0]).toHaveProperty('resource');
      expect(parsed.resourceDetails[0]).toHaveProperty('riskLevel');
      expect(parsed.resourceDetails[0]).toHaveProperty('dataRetention');
    }
  });

  it("generates action URLs correctly", async () => {
    const context = createMockContext();

    const input = {
      orgId: "test-org-123",
      checkType: "summary",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.consentUrl).toBeDefined();
    expect(parsed.consentUrl).toContain("test-org-123");
    expect(parsed.consentUrl).toContain("https://phasemirror.com/console/consent");
  });

  it("categorizes resources by state in summary", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "summary",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.consentSummary.resources).toBeDefined();
    expect(parsed.consentSummary.resources.granted).toBeDefined();
    expect(parsed.consentSummary.resources.pending).toBeDefined();
    expect(parsed.consentSummary.resources.expired).toBeDefined();
    expect(parsed.consentSummary.resources.revoked).toBeDefined();
    expect(parsed.consentSummary.resources.notRequested).toBeDefined();
  });

  it("calculates coverage percentage correctly", async () => {
    const context = createMockContext();

    const input = {
      orgId: "PhaseMirror",
      checkType: "summary",
    };

    const response = await checkConsentTool.execute(input, context);
    const parsed = JSON.parse(response.content[0].text!);

    expect(parsed.consentSummary.statistics.coveragePercent).toBeDefined();
    expect(typeof parsed.consentSummary.statistics.coveragePercent).toBe('number');
    expect(parsed.consentSummary.statistics.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(parsed.consentSummary.statistics.coveragePercent).toBeLessThanOrEqual(100);
  });
});
