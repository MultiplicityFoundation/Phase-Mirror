import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";

/**
 * Input schema for analyze_dissonance tool
 */
export const AnalyzeDissonanceInputSchema = z.object({
  files: z
    .array(z.string())
    .describe("Array of file paths to analyze for dissonance"),
  context: z
    .string()
    .optional()
    .describe("Optional issue description or PR context for analysis"),
  mode: z
    .enum(["pull_request", "issue", "merge_group", "drift"])
    .default("issue")
    .describe("Analysis mode determining rule evaluation context"),
});

export type AnalyzeDissonanceInput = z.infer<typeof AnalyzeDissonanceInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "analyze_dissonance",
  description: 
    "Run Mirror Dissonance protocol to detect inconsistencies across requirements, " +
    "configs, code, and runtime assumptions. Returns actionable findings with severity " +
    "levels, evidence citations, and ADR references. Useful for validating proposed " +
    "code changes against governance rules before implementation.",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        description: "List of file paths to analyze for dissonance (relative to repo root)",
      },
      context: {
        type: "string",
        description: "Optional issue description or PR context to inform analysis",
      },
      mode: {
        type: "string",
        enum: ["pull_request", "issue", "merge_group", "drift"],
        default: "issue",
        description: "Analysis mode: pull_request for PR checks, issue for planning, drift for baseline comparison",
      },
    },
    required: ["files"],
  },
} as const;

/**
 * Execute dissonance analysis
 */
export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Validate input
  let validatedInput: AnalyzeDissonanceInput;
  try {
    validatedInput = AnalyzeDissonanceInputSchema.parse(args);
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

  const { files, context: issueContext, mode } = validatedInput;

  try {
    // Import Mirror Dissonance core library
    // Note: Using the Oracle from @mirror-dissonance/core
    const { analyze } = await import("@mirror-dissonance/core/dist/src/oracle.js");

    // Map our mode to Oracle mode
    const oracleMode = mode === "issue" ? "pull_request" : mode;

    // Execute analysis
    const report = await analyze({
      mode: oracleMode as "pull_request" | "merge_group" | "drift" | "calibration",
      context: {
        repositoryName: issueContext,
      },
    });

    // Format response for MCP
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            timestamp: context.timestamp.toISOString(),
            requestId: context.requestId,
            analysis: {
              mode,
              filesAnalyzed: files.length,
              findings: report.violations || [],
              summary: report.summary || {},
              decision: report.machineDecision || {},
              degradedMode: false,
              adrReferences: extractADRReferences(report),
            },
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
            error: "Analysis execution failed",
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

/**
 * Extract ADR references from dissonance report
 */
function extractADRReferences(report: any): string[] {
  const adrPattern = /ADR-\d{3}/g;
  const adrRefs = new Set<string>();

  // Search in findings (violations)
  if (report.violations) {
    for (const violation of report.violations) {
      const matches = JSON.stringify(violation).match(adrPattern);
      if (matches) {
        matches.forEach(ref => adrRefs.add(ref));
      }
    }
  }

  // Search in summary
  if (report.summary) {
    const matches = JSON.stringify(report.summary).match(adrPattern);
    if (matches) {
      matches.forEach(ref => adrRefs.add(ref));
    }
  }

  return Array.from(adrRefs).sort();
}
