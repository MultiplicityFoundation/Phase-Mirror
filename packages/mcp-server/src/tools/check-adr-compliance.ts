/**
 * check_adr_compliance MCP tool
 * 
 * Validates code changes against Architecture Decision Records (ADRs)
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { join } from "path";
import { 
  createADRParser, 
  createADRMatcher, 
  createADRValidator,
  ADRComplianceResult 
} from "@mirror-dissonance/core/dist/src/adr/index.js";

/**
 * Input schema for check_adr_compliance tool
 */
export const CheckADRComplianceInputSchema = z.object({
  files: z
    .array(z.string())
    .describe("Array of file paths to check for ADR compliance"),
  adrs: z
    .array(z.string())
    .optional()
    .describe("Optional array of specific ADR IDs to check (e.g., ['ADR-001']). If not provided, all relevant ADRs are checked."),
  adrPath: z
    .string()
    .optional()
    .describe("Path to ADR directory. Defaults to 'docs/adr' relative to repository root."),
  context: z
    .string()
    .optional()
    .describe("Optional context about the changes for better analysis"),
});

export type CheckADRComplianceInput = z.infer<typeof CheckADRComplianceInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "check_adr_compliance",
  description:
    "Validate code changes against Architecture Decision Records (ADRs). " +
    "Checks if proposed changes comply with documented architectural decisions, " +
    "returning violations with severity levels and remediation guidance. " +
    "Useful for ensuring code adheres to established governance policies before implementation.",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "List of file paths to check for ADR compliance (relative to repo root)",
      },
      adrs: {
        type: "array",
        items: { type: "string" },
        description: "Optional list of specific ADR IDs to check (e.g., ['ADR-001']). If omitted, all relevant ADRs are checked.",
      },
      adrPath: {
        type: "string",
        description: "Path to ADR directory. Defaults to 'docs/adr'.",
      },
      context: {
        type: "string",
        description: "Optional context about the changes for better analysis",
      },
    },
    required: ["files"],
  },
} as const;

/**
 * Execute ADR compliance check
 */
export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Validate input
  let validatedInput: CheckADRComplianceInput;
  try {
    validatedInput = CheckADRComplianceInputSchema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "Invalid input",
              code: "INVALID_INPUT",
              details: error.errors,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
    throw error;
  }

  const { files, adrs: requestedADRs, adrPath = "docs/adr", context: checkContext } = validatedInput;

  try {
    // Initialize ADR components
    const parser = createADRParser();
    const matcher = createADRMatcher();
    const validator = createADRValidator();

    // Determine ADR directory path
    // In a real implementation, this would resolve relative to repo root
    const resolvedADRPath = adrPath.startsWith('/') ? adrPath : join(process.cwd(), adrPath);

    // Parse ADRs
    let allADRs = await parser.parseADRDirectory(resolvedADRPath);

    // Filter to requested ADRs if specified
    if (requestedADRs && requestedADRs.length > 0) {
      allADRs = allADRs.filter(adr => requestedADRs.includes(adr.id));
    }

    // Match files to relevant ADRs
    const fileToADRs = matcher.matchFilesToADRs(files, allADRs);

    // Validate files against ADRs
    const violations = await validator.validateFiles(fileToADRs);

    // Get unique ADRs that were checked
    const checkedADRs = matcher.getUniqueADRs(fileToADRs);
    const adrsChecked = checkedADRs.map(adr => adr.id).sort();

    // Generate suggestions based on violations and ADR content
    const suggestions: string[] = [];
    if (violations.length > 0) {
      const violatedADRIds = Array.from(new Set(violations.map(v => v.adrId)));
      for (const adrId of violatedADRIds) {
        const adr = allADRs.find(a => a.id === adrId);
        if (adr && adr.complianceChecks) {
          suggestions.push(`Review compliance checks in ${adrId}`);
        }
      }
    }

    // Build result
    const result: ADRComplianceResult = {
      compliant: violations.length === 0,
      adrsChecked,
      violations,
      suggestions,
      timestamp: context.timestamp.toISOString(),
    };

    // Format response for MCP
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            timestamp: context.timestamp.toISOString(),
            requestId: context.requestId,
            compliance: result,
            context: checkContext,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    // Handle execution errors
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "ADR compliance check failed",
            code: "EXECUTION_FAILED",
            message: error instanceof Error ? error.message : String(error),
            timestamp: context.timestamp.toISOString(),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
