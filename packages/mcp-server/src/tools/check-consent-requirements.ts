/**
 * check_consent_requirements MCP tool
 * 
 * Verify organization consent status before accessing sensitive governance data
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { 
  createEnhancedConsentStore,
  IEnhancedConsentStore,
  ConsentResource,
  CONSENT_RESOURCES,
  getRequiredResources,
  CURRENT_CONSENT_POLICY,
} from "@mirror-dissonance/core/dist/src/consent-store/index.js";

/**
 * Input schema for check_consent_requirements tool
 */
export const CheckConsentRequirementsInputSchema = z.object({
  orgId: z
    .string()
    .describe("Organization ID to check consent for"),
  
  checkType: z
    .enum([
      "validate",
      "summary",
      "required_for_operation",
    ])
    .describe("Type of consent check operation to perform"),
  
  resources: z
    .array(z.enum(CONSENT_RESOURCES as unknown as [string, ...string[]]))
    .optional()
    .describe("Array of resources to validate (required for 'validate' checkType)"),
  
  tool: z
    .string()
    .optional()
    .describe("Tool name for required_for_operation checkType"),
  
  operation: z
    .string()
    .optional()
    .describe("Tool operation for required_for_operation (e.g., 'fp_rate', 'cross_rule_comparison')"),
  
  includePolicy: z
    .boolean()
    .optional()
    .describe("Include full policy details in response"),
});

export type CheckConsentRequirementsInput = z.infer<typeof CheckConsentRequirementsInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "check_consent_requirements",
  description:
    "Verify organization consent status for governance data access per ADR-004. " +
    "This tool ensures compliance with GDPR and EU AI Act by checking granular " +
    "resource-level consent before accessing sensitive governance data like FP patterns, " +
    "metrics, cross-org benchmarks, and audit logs. Use this tool before calling " +
    "other governance tools to ensure proper authorization.",
  inputSchema: {
    type: "object",
    properties: {
      orgId: {
        type: "string",
        description: "Organization ID to check consent for",
      },
      checkType: {
        type: "string",
        enum: [
          "validate",
          "summary",
          "required_for_operation",
        ],
        description: "Type of consent check operation to perform",
      },
      resources: {
        type: "array",
        items: {
          type: "string",
          enum: CONSENT_RESOURCES,
        },
        description: "Array of resources to validate (required for 'validate' checkType)",
      },
      tool: {
        type: "string",
        description: "Tool name for required_for_operation checkType",
      },
      operation: {
        type: "string",
        description: "Tool operation for required_for_operation (e.g., 'fp_rate', 'cross_rule_comparison')",
      },
      includePolicy: {
        type: "boolean",
        description: "Include full policy details in response",
      },
    },
    required: ["orgId", "checkType"],
  },
};

/**
 * Execute check_consent_requirements tool
 */
export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = CheckConsentRequirementsInputSchema.parse(args);
    
    // Create consent store
    const consentStore = createEnhancedConsentStore();
    
    // Execute operation based on type
    let result: any;
    
    switch (input.checkType) {
      case "validate":
        result = await validateConsent(consentStore, input);
        break;
        
      case "summary":
        result = await getConsentSummary(consentStore, input);
        break;
        
      case "required_for_operation":
        result = await getRequiredForOperation(consentStore, input);
        break;
        
      default:
        throw new Error(`Unknown checkType: ${input.checkType}`);
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              code: "VALIDATION_ERROR",
              message: "Invalid input parameters",
              details: error.errors,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
    
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Validate consent for resources
 */
async function validateConsent(
  store: IEnhancedConsentStore,
  input: CheckConsentRequirementsInput
) {
  if (!input.resources || input.resources.length === 0) {
    return {
      success: false,
      code: "MISSING_PARAMETER",
      message: "resources parameter is required for 'validate' checkType",
    };
  }
  
  const result = await store.checkMultipleResources(
    input.orgId,
    input.resources as ConsentResource[]
  );
  
  const resourceResults: any = {};
  const issues = {
    missingConsents: [] as string[],
    expiredConsents: [] as string[],
    needsReconsent: [] as string[],
  };
  
  for (const [resource, checkResult] of Object.entries(result.results)) {
    resourceResults[resource] = {
      valid: checkResult.granted,
      state: checkResult.state,
      grantedAt: checkResult.grantedAt?.toISOString(),
      expiresAt: checkResult.expiresAt?.toISOString(),
      version: checkResult.version,
      reason: checkResult.reason,
      currentPolicyVersion: CURRENT_CONSENT_POLICY.version,
    };
    
    if (!checkResult.granted) {
      if (checkResult.state === 'expired') {
        issues.expiredConsents.push(resource);
      } else if (checkResult.state === 'not_requested') {
        issues.missingConsents.push(resource);
      } else if (checkResult.version && checkResult.version !== CURRENT_CONSENT_POLICY.version) {
        issues.needsReconsent.push(resource);
      }
    }
  }
  
  const allValid = result.allGranted;
  const actionRequired = !allValid;
  
  let summary = allValid 
    ? "✅ All required consents are valid."
    : `❌ Consent issues found. Missing consent for: ${result.missingConsent.join(', ')}.`;
  
  const recommendations: string[] = [];
  if (allValid) {
    recommendations.push("✅ All required consents are valid. You may proceed with the operation.");
  } else {
    if (issues.missingConsents.length > 0) {
      recommendations.push(`Grant consent for: ${issues.missingConsents.join(', ')} to access these features.`);
    }
    if (issues.expiredConsents.length > 0) {
      recommendations.push(`Renew expired consent for: ${issues.expiredConsents.join(', ')}.`);
    }
    if (issues.needsReconsent.length > 0) {
      recommendations.push(`Update consent to current policy version for: ${issues.needsReconsent.join(', ')}.`);
    }
    const actionUrl = `https://phasemirror.com/console/consent?org=${input.orgId}&action=grant&resources=${result.missingConsent.join(',')}`;
    recommendations.push(`Visit ${actionUrl} to manage consent.`);
  }
  
  const response: any = {
    success: true,
    checkType: "validate",
    orgId: input.orgId,
    validation: {
      allValid,
      checkedResources: input.resources,
      summary,
      resourceResults,
      issues,
      actionRequired,
    },
    recommendations,
    compliance: {
      gdprCompliant: true,
      adr004Compliant: true,
      policyVersion: CURRENT_CONSENT_POLICY.version,
    },
  };
  
  if (actionRequired) {
    response.validation.actionUrl = `https://phasemirror.com/console/consent?org=${input.orgId}&action=grant&resources=${result.missingConsent.join(',')}`;
  }
  
  return response;
}

/**
 * Get full consent summary for organization
 */
async function getConsentSummary(
  store: IEnhancedConsentStore,
  input: CheckConsentRequirementsInput
) {
  const summary = await store.getConsentSummary(input.orgId);
  
  if (!summary) {
    // Return default summary for organizations without consent records
    const allResources = CONSENT_RESOURCES as readonly string[];
    const response: any = {
      success: true,
      checkType: "summary",
      orgId: input.orgId,
      consentSummary: {
        hasAnyConsent: false,
        policyVersion: CURRENT_CONSENT_POLICY.version,
        currentPolicyVersion: CURRENT_CONSENT_POLICY.version,
        needsReconsent: false,
        resources: {
          granted: [],
          pending: [],
          expired: [],
          revoked: [],
          notRequested: [...allResources],
        },
        statistics: {
          totalResources: allResources.length,
          grantedCount: 0,
          pendingCount: 0,
          expiredCount: 0,
          revokedCount: 0,
          notRequestedCount: allResources.length,
          coveragePercent: 0,
        },
      },
      recommendations: [
        "No consents have been granted yet.",
        "Grant consents to enable governance capabilities.",
      ],
      consentUrl: `https://phasemirror.com/console/consent?org=${input.orgId}`,
      compliance: {
        gdprCompliant: true,
        adr004Compliant: true,
        policyVersion: CURRENT_CONSENT_POLICY.version,
      },
    };
    
    if (input.includePolicy) {
      response.policy = CURRENT_CONSENT_POLICY;
    }
    
    return response;
  }
  
  // Build resources categorized by state
  const categorized = {
    granted: [] as string[],
    pending: [] as string[],
    expired: [] as string[],
    revoked: [] as string[],
    notRequested: [] as string[],
  };
  
  for (const resource of CONSENT_RESOURCES) {
    const status = summary.resources[resource];
    if (status) {
      if (status.state === 'granted') {
        // Check expiration
        if (status.expiresAt && new Date(status.expiresAt) < new Date()) {
          categorized.expired.push(resource);
        } else {
          categorized.granted.push(resource);
        }
      } else if (status.state === 'expired') {
        categorized.expired.push(resource);
      } else if (status.state === 'revoked') {
        categorized.revoked.push(resource);
      } else if (status.state === 'pending') {
        categorized.pending.push(resource);
      } else {
        categorized.notRequested.push(resource);
      }
    } else {
      categorized.notRequested.push(resource);
    }
  }
  
  const totalResources = CONSENT_RESOURCES.length;
  const grantedCount = categorized.granted.length;
  const coveragePercent = Math.round((grantedCount / totalResources) * 100);
  
  const needsReconsent = summary.consentVersion !== CURRENT_CONSENT_POLICY.version;
  
  const recommendations: string[] = [];
  if (categorized.expired.length > 0) {
    recommendations.push(`${categorized.expired.length} consent(s) have expired. Renew to restore access.`);
  }
  if (categorized.notRequested.length > 0) {
    recommendations.push(`${categorized.notRequested.length} resource(s) not yet consented: ${categorized.notRequested.join(', ')}.`);
  }
  if (needsReconsent) {
    recommendations.push(`Consent policy has been updated. Re-consent required.`);
  }
  recommendations.push(`Consent coverage is ${coveragePercent}%. ${coveragePercent < 100 ? 'Consider granting more consents for full governance capabilities.' : 'Full coverage achieved.'}`);
  
  const response: any = {
    success: true,
    checkType: "summary",
    orgId: input.orgId,
    consentSummary: {
      hasAnyConsent: grantedCount > 0,
      policyVersion: summary.consentVersion,
      currentPolicyVersion: CURRENT_CONSENT_POLICY.version,
      needsReconsent,
      resources: categorized,
      statistics: {
        totalResources,
        grantedCount,
        pendingCount: categorized.pending.length,
        expiredCount: categorized.expired.length,
        revokedCount: categorized.revoked.length,
        notRequestedCount: categorized.notRequested.length,
        coveragePercent,
      },
    },
    recommendations,
    consentUrl: `https://phasemirror.com/console/consent?org=${input.orgId}`,
    compliance: {
      gdprCompliant: true,
      adr004Compliant: true,
      policyVersion: CURRENT_CONSENT_POLICY.version,
    },
  };
  
  if (input.includePolicy) {
    response.policy = CURRENT_CONSENT_POLICY;
  }
  
  return response;
}

/**
 * Get required consent resources for a tool operation
 */
async function getRequiredForOperation(
  store: IEnhancedConsentStore,
  input: CheckConsentRequirementsInput
) {
  if (!input.tool) {
    return {
      success: false,
      code: "MISSING_PARAMETER",
      message: "tool parameter is required for 'required_for_operation' checkType",
    };
  }
  
  const requiredResources = input.operation 
    ? getRequiredResources(input.tool, input.operation)
    : [];
  
  const requiresConsent = requiredResources.length > 0;
  
  const resourceDescriptions: any = {};
  for (const resource of requiredResources) {
    const policyResource = CURRENT_CONSENT_POLICY.resources[resource as ConsentResource];
    if (policyResource) {
      resourceDescriptions[resource] = policyResource.description;
    }
  }
  
  const response: any = {
    success: true,
    checkType: "required_for_operation",
    orgId: input.orgId,
    requiredConsents: {
      tool: input.tool,
      operation: input.operation || null,
      requiredResources,
      resourceDescriptions,
      requiresConsent,
    },
  };
  
  // Check current status if consent is required
  if (requiresConsent) {
    const checkResult = await store.checkMultipleResources(
      input.orgId,
      requiredResources as ConsentResource[]
    );
    
    const allGranted = checkResult.allGranted;
    const summary = allGranted 
      ? "✅ All required consents are valid."
      : `❌ Consent issues found. Missing consent for: ${checkResult.missingConsent.join(', ')}.`;
    
    response.currentStatus = {
      allGranted,
      summary,
      missingConsents: checkResult.missingConsent,
    };
    
    if (!allGranted) {
      response.currentStatus.actionUrl = `https://phasemirror.com/console/consent?org=${input.orgId}&action=grant&resources=${checkResult.missingConsent.join(',')}`;
    }
    
    response.canProceed = allGranted;
    if (!allGranted) {
      response.blockedReason = `Missing consent for: ${checkResult.missingConsent.join(', ')}`;
    }
    
    const recommendations: string[] = [];
    if (!allGranted) {
      recommendations.push(`Grant consent for required resources before using ${input.tool}`);
      recommendations.push(`Visit ${response.currentStatus.actionUrl} to manage consent`);
    }
    response.recommendations = recommendations;
    
    // Add resource details if includePolicy is true
    if (input.includePolicy) {
      response.resourceDetails = requiredResources.map((resource: string) => {
        const policyResource = CURRENT_CONSENT_POLICY.resources[resource as ConsentResource];
        return {
          resource,
          description: policyResource?.description || '',
          riskLevel: policyResource?.riskLevel || 'unknown',
          dataRetention: policyResource?.dataRetention || 'N/A',
          requiredFor: policyResource?.requiredFor || [],
          gdprLawfulBasis: 'consent',
        };
      });
    }
  } else {
    response.currentStatus = null;
    response.canProceed = true;
  }
  
  return response;
}
