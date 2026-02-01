/**
 * check_adr_compliance MCP tool
 * 
 * Validates code changes against Architecture Decision Records (ADRs)
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { resolve } from "path";
import { 
  ADRParser,
  ADRValidator,
  ADRMatcher,
  ParsedADR,
  ADRComplianceResult
} from "@mirror-dissonance/core/dist/src/index.js";

/**
 * Input schema for check_adr_compliance tool
 */
export const CheckADRComplianceInputSchema = z.object({
  files: z
    .array(z.string())
    .min(1)
    .describe("File paths to check for ADR compliance"),
  adrs: z
    .array(z.string())
    .optional()
    .describe("Specific ADR IDs to check (e.g., ['ADR-001', 'ADR-002']). If omitted, checks all relevant ADRs."),
  adrPath: z
    .string()
    .optional()
    .describe("Path to ADR directory (default: ./docs/adr)"),
  includeProposed: z
    .boolean()
    .default(false)
    .describe("Include proposed ADRs in addition to accepted ones"),
  context: z
    .string()
    .optional()
    .describe("Additional context about the changes (helps with ADR matching)"),
});

export type CheckADRComplianceInput = z.infer<typeof CheckADRComplianceInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "check_adr_compliance",
  description:
    "Validate code changes against Architecture Decision Records (ADRs). Checks if files " +
    "comply with architectural constraints, coding standards, and governance policies " +
    "documented in ADRs. Returns specific violations with remediation guidance. " +
    "Use this before implementing changes to ensure adherence to architectural decisions.",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "Files to check for ADR compliance",
        examples: [
          [".github/workflows/deploy.yml"],
          ["src/fp-store/index.ts", "src/fp-store/schema.ts"],
        ],
      },
      adrs: {
        type: "array",
        items: { type: "string", pattern: "^ADR-\\d{3}$" },
        description: "Specific ADRs to check (optional)",
        examples: [
          ["ADR-001"],
          ["ADR-001", "ADR-002", "ADR-003"],
        ],
      },
      adrPath: {
        type: "string",
        description: "Path to ADR directory (default: ./docs/adr)",
      },
      includeProposed: {
        type: "boolean",
        default: false,
        description: "Include proposed ADRs",
      },
      context: {
        type: "string",
        description: "Context about changes for better ADR matching",
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
            text: JSON.stringify(
              {
                success: false,
                error: "Invalid input parameters",
                code: "INVALID_INPUT",
                details: error.errors.map(e => ({
                  path: e.path.join("."),
                  message: e.message,
                })),
                timestamp: context.timestamp.toISOString(),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
    throw error;
  }

  const {
    files,
    adrs: specificADRs,
    adrPath,
    includeProposed,
    context: userContext,
  } = validatedInput;

  try {
    const startTime = performance.now();

    // Resolve ADR path
    const resolvedADRPath = resolve(adrPath || "./docs/adr");

    // Parse ADRs
    const parser = new ADRParser();
    const allADRs = await parser.parseADRDirectory(resolvedADRPath);

    if (allADRs.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: "No ADRs found",
                code: "NO_ADRS_FOUND",
                message: `No ADR files found in ${resolvedADRPath}`,
                timestamp: context.timestamp.toISOString(),
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    // Filter ADRs based on status and specific IDs
    let filteredADRs = allADRs.filter(adr => {
      // Filter by status
      if (!includeProposed && adr.status === "proposed") {
        return false;
      }
      // Filter by specific ADR IDs if provided
      if (specificADRs && specificADRs.length > 0) {
        return specificADRs.includes(adr.id);
      }
      return true;
    });

    // Match files to relevant ADRs
    const matcher = new ADRMatcher();
    const fileToADRs = matcher.matchFilesToADRs(files, filteredADRs);

    // Validate files against ADRs
    const validator = new ADRValidator();
    const violations = await validator.validateFiles(fileToADRs);

    // Get unique ADRs that were checked
    const checkedADRs = matcher.getUniqueADRs(fileToADRs);
    const adrsChecked = checkedADRs.map(adr => adr.id).sort();

    // Generate suggestions
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

    const elapsedMs = performance.now() - startTime;

    // Format response
    const response = {
      success: true,
      timestamp: context.timestamp.toISOString(),
      requestId: context.requestId,
      
      compliance: {
        compliant: violations.length === 0,
        filesChecked: files.length,
        adrsChecked: adrsChecked.length,
        adrList: adrsChecked,
        
        violations: violations.map(v => ({
          adrId: v.adrId,
          ruleId: v.ruleId,
          file: v.file,
          line: v.line,
          message: v.message,
          severity: v.severity,
          remediation: v.remediation,
        })),
        
        violationSummary: {
          total: violations.length,
          high: violations.filter(v => v.severity === "high").length,
          medium: violations.filter(v => v.severity === "medium").length,
          low: violations.filter(v => v.severity === "low").length,
        },
        
        suggestions,
        
        // ADR details for reference
        adrDetails: adrsChecked.map(adrId => {
          const adr = allADRs.find(a => a.id === adrId);
          return adr ? {
            id: adr.id,
            title: adr.title,
            status: adr.status,
            tags: adr.tags,
            relatedRules: adr.relatedRules,
          } : null;
        }).filter(Boolean),
      },
      
      performance: {
        elapsedMs: Math.round(elapsedMs),
      },
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: "ADR compliance check failed",
              code: "EXECUTION_FAILED",
              message: error instanceof Error ? error.message : String(error),
              timestamp: context.timestamp.toISOString(),
              stack: error instanceof Error ? error.stack : undefined,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
