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
  
  operation: z
    .enum([
      "check_single_resource",
      "check_multiple_resources",
      "get_consent_summary",
      "get_required_consent",
    ])
    .describe("Type of consent check operation to perform"),
  
  resource: z
    .enum(CONSENT_RESOURCES as [string, ...string[]])
    .optional()
    .describe("Single resource to check (required for check_single_resource)"),
  
  resources: z
    .array(z.enum(CONSENT_RESOURCES as [string, ...string[]]))
    .optional()
    .describe("Array of resources to check (required for check_multiple_resources)"),
  
  tool: z
    .string()
    .optional()
    .describe("Tool name for get_required_consent operation"),
  
  toolOperation: z
    .string()
    .optional()
    .describe("Tool operation for get_required_consent (e.g., 'fp_rate', 'recent_patterns')"),
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
      operation: {
        type: "string",
        enum: [
          "check_single_resource",
          "check_multiple_resources",
          "get_consent_summary",
          "get_required_consent",
        ],
        description: "Type of consent check operation to perform",
      },
      resource: {
        type: "string",
        enum: CONSENT_RESOURCES,
        description: "Single resource to check (required for check_single_resource)",
      },
      resources: {
        type: "array",
        items: {
          type: "string",
          enum: CONSENT_RESOURCES,
        },
        description: "Array of resources to check (required for check_multiple_resources)",
      },
      tool: {
        type: "string",
        description: "Tool name for get_required_consent operation",
      },
      toolOperation: {
        type: "string",
        description: "Tool operation for get_required_consent (e.g., 'fp_rate', 'recent_patterns')",
      },
    },
    required: ["orgId", "operation"],
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
    
    switch (input.operation) {
      case "check_single_resource":
        result = await checkSingleResource(consentStore, input);
        break;
        
      case "check_multiple_resources":
        result = await checkMultipleResources(consentStore, input);
        break;
        
      case "get_consent_summary":
        result = await getConsentSummary(consentStore, input);
        break;
        
      case "get_required_consent":
        result = await getRequiredConsent(input);
        break;
        
      default:
        throw new Error(`Unknown operation: ${input.operation}`);
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
              error: "VALIDATION_ERROR",
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
            error: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Check consent for a single resource
 */
async function checkSingleResource(
  store: IEnhancedConsentStore,
  input: CheckConsentRequirementsInput
) {
  if (!input.resource) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "resource parameter is required for check_single_resource operation",
    };
  }
  
  const result = await store.checkResourceConsent(
    input.orgId, 
    input.resource as ConsentResource
  );
  
  return {
    success: result.granted,
    code: result.granted ? "CONSENT_GRANTED" : "CONSENT_REQUIRED",
    ...result,
    consentUrl: result.granted ? undefined : "https://phasemirror.com/console/consent",
    learnMore: result.granted ? undefined : "https://phasemirror.com/docs/consent",
  };
}

/**
 * Check consent for multiple resources
 */
async function checkMultipleResources(
  store: IEnhancedConsentStore,
  input: CheckConsentRequirementsInput
) {
  if (!input.resources || input.resources.length === 0) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "resources parameter is required for check_multiple_resources operation",
    };
  }
  
  const result = await store.checkMultipleResources(
    input.orgId,
    input.resources as ConsentResource[]
  );
  
  return {
    success: result.allGranted,
    code: result.allGranted ? "CONSENT_GRANTED" : "CONSENT_REQUIRED",
    ...result,
    consentUrl: result.allGranted ? undefined : "https://phasemirror.com/console/consent",
    requiredResources: result.missingConsent,
    learnMore: result.allGranted ? undefined : "https://phasemirror.com/docs/consent",
  };
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
    return {
      success: false,
      code: "CONSENT_NOT_FOUND",
      message: `No consent record found for organization '${input.orgId}'`,
      consentUrl: "https://phasemirror.com/console/consent",
      learnMore: "https://phasemirror.com/docs/consent",
    };
  }
  
  return {
    success: true,
    code: "CONSENT_FOUND",
    summary,
    policyVersion: CURRENT_CONSENT_POLICY.version,
  };
}

/**
 * Get required consent resources for a tool operation
 */
async function getRequiredConsent(input: CheckConsentRequirementsInput) {
  if (!input.tool || !input.toolOperation) {
    return {
      success: false,
      code: "VALIDATION_ERROR",
      message: "tool and toolOperation parameters are required for get_required_consent operation",
    };
  }
  
  const requiredResources = getRequiredResources(input.tool, input.toolOperation);
  
  return {
    success: true,
    code: "REQUIREMENTS_FOUND",
    tool: input.tool,
    operation: input.toolOperation,
    requiredResources,
    policyVersion: CURRENT_CONSENT_POLICY.version,
  };
}
