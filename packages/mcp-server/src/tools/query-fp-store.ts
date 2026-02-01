/**
 * query_fp_store MCP tool
 * 
 * Query false positive patterns to improve rule calibration
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { createFPStore, IFPStore } from "@mirror-dissonance/core/dist/src/fp-store/store.js";

/**
 * Input schema for query_fp_store tool
 */
export const QueryFPStoreInputSchema = z.object({
  operation: z
    .enum(["check_false_positive", "get_by_rule", "get_statistics"])
    .describe("Type of query: check if a finding is a known false positive, get false positives for a rule, or get statistics"),
  findingId: z
    .string()
    .optional()
    .describe("Finding ID to check (required for 'check_false_positive' operation)"),
  ruleId: z
    .string()
    .optional()
    .describe("Rule ID to query (required for 'get_by_rule' operation)"),
  limit: z
    .number()
    .optional()
    .default(100)
    .describe("Maximum number of results to return (for 'get_by_rule' operation)"),
});

export type QueryFPStoreInput = z.infer<typeof QueryFPStoreInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "query_fp_store",
  description:
    "Query the false positive store to check if findings are known false positives " +
    "or to retrieve false positive patterns for rule calibration. " +
    "Helps reduce noise by learning from past false positives and improving rule accuracy.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["check_false_positive", "get_by_rule", "get_statistics"],
        description: "Type of query operation to perform",
      },
      findingId: {
        type: "string",
        description: "Finding ID to check (for 'check_false_positive' operation)",
      },
      ruleId: {
        type: "string",
        description: "Rule ID to query (for 'get_by_rule' operation)",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default: 100)",
        default: 100,
      },
    },
    required: ["operation"],
  },
} as const;

/**
 * Execute FP store query
 */
export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Validate input
  let validatedInput: QueryFPStoreInput;
  try {
    validatedInput = QueryFPStoreInputSchema.parse(args);
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

  const { operation, findingId, ruleId, limit } = validatedInput;

  try {
    // Initialize FP store
    const fpStore: IFPStore = createFPStore(
      context.config.fpTableName
        ? {
            tableName: context.config.fpTableName,
            region: context.config.awsRegion,
          }
        : undefined
    );

    // Execute operation
    let result: any;
    switch (operation) {
      case "check_false_positive":
        if (!findingId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "findingId is required for 'check_false_positive' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        result = {
          findingId,
          isFalsePositive: await fpStore.isFalsePositive(findingId),
        };
        break;

      case "get_by_rule":
        if (!ruleId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "ruleId is required for 'get_by_rule' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const falsePositives = await fpStore.getFalsePositivesByRule(ruleId);
        result = {
          ruleId,
          count: falsePositives.length,
          falsePositives: falsePositives.slice(0, limit),
        };
        break;

      case "get_statistics":
        // Get statistics across all rules
        // This is a simplified implementation - real version would aggregate data
        result = {
          message: "Statistics operation requires specific rule ID",
          note: "Use 'get_by_rule' operation with a specific ruleId to get false positive counts",
        };
        break;

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown operation: ${operation}`,
                code: "INVALID_OPERATION",
              }, null, 2),
            },
          ],
          isError: true,
        };
    }

    // Format response for MCP
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            timestamp: context.timestamp.toISOString(),
            requestId: context.requestId,
            operation,
            result,
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
            error: "FP store query failed",
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
