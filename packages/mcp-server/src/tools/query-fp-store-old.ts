/**
 * query_fp_store MCP tool
 * 
 * Query false positive patterns to improve rule calibration
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { 
  createFPStore, 
  IFPStore, 
  FPStoreQuery,
  createFPStoreQuery
} from "@mirror-dissonance/core/dist/src/index.js";

/**
 * Input schema for query_fp_store tool
 */
export const QueryFPStoreInputSchema = z.object({
  operation: z
    .enum([
      "check_false_positive", 
      "get_by_rule", 
      "get_statistics",
      "fp_rate",
      "recent_patterns",
      "fp_trend",
      "compare_rules"
    ])
    .describe("Type of query operation to perform"),
  findingId: z
    .string()
    .optional()
    .describe("Finding ID to check (required for 'check_false_positive' operation)"),
  ruleId: z
    .string()
    .optional()
    .describe("Rule ID to query (required for 'get_by_rule', 'fp_rate', 'recent_patterns', 'fp_trend' operations)"),
  ruleIds: z
    .array(z.string())
    .optional()
    .describe("Rule IDs to compare (required for 'compare_rules' operation)"),
  limit: z
    .number()
    .optional()
    .default(100)
    .describe("Maximum number of results to return"),
  daysBack: z
    .number()
    .optional()
    .default(30)
    .describe("Number of days to look back for trend/pattern analysis"),
  startDate: z
    .string()
    .optional()
    .describe("Start date for time-range queries (ISO format)"),
  endDate: z
    .string()
    .optional()
    .describe("End date for time-range queries (ISO format)"),
});

export type QueryFPStoreInput = z.infer<typeof QueryFPStoreInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "query_fp_store",
  description:
    "Query the false positive store to check if findings are known false positives, " +
    "retrieve false positive patterns for rule calibration, analyze FP rates and trends, " +
    "and compare rule performance. Helps reduce noise by learning from past false positives.",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: [
          "check_false_positive", 
          "get_by_rule", 
          "get_statistics",
          "fp_rate",
          "recent_patterns",
          "fp_trend",
          "compare_rules"
        ],
        description: "Type of query operation: check_false_positive, get_by_rule, fp_rate, recent_patterns, fp_trend, compare_rules, get_statistics",
      },
      findingId: {
        type: "string",
        description: "Finding ID (for check_false_positive)",
      },
      ruleId: {
        type: "string",
        description: "Rule ID (for get_by_rule, fp_rate, recent_patterns, fp_trend)",
      },
      ruleIds: {
        type: "array",
        items: { type: "string" },
        description: "Rule IDs to compare (for compare_rules)",
      },
      limit: {
        type: "number",
        description: "Maximum results (default: 100)",
        default: 100,
      },
      daysBack: {
        type: "number",
        description: "Days to look back (default: 30)",
        default: 30,
      },
      startDate: {
        type: "string",
        description: "Start date (ISO format)",
      },
      endDate: {
        type: "string",
        description: "End date (ISO format)",
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

  const { operation, findingId, ruleId, ruleIds, limit, daysBack, startDate, endDate } = validatedInput;

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

    // Create FP Store Query instance
    const fpQuery = createFPStoreQuery(fpStore);

    // Parse dates if provided
    const parsedStartDate = startDate ? new Date(startDate) : undefined;
    const parsedEndDate = endDate ? new Date(endDate) : undefined;

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

      case "get_by_rule": {
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
      }

      case "fp_rate": {
        if (!ruleId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "ruleId is required for 'fp_rate' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const fpRate = await fpQuery.getFPRate(ruleId, {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });
        result = {
          ...fpRate,
          recommendation: fpRate.fpr < 0.1 
            ? "FPR within acceptable range (<10%). No immediate calibration needed."
            : "FPR above threshold (10%). Consider rule calibration.",
        };
        break;
      }

      case "recent_patterns": {
        if (!ruleId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "ruleId is required for 'recent_patterns' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const patterns = await fpQuery.getRecentPatterns(ruleId, {
          limit,
          daysBack,
        });
        result = {
          ruleId,
          patterns: patterns.map(p => ({
            contextHash: p.contextHash,
            frequency: p.frequency,
            lastSeen: p.lastSeen.toISOString(),
            firstSeen: p.firstSeen.toISOString(),
          })),
          totalPatterns: patterns.length,
        };
        break;
      }

      case "fp_trend": {
        if (!ruleId) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "ruleId is required for 'fp_trend' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const trend = await fpQuery.getFPTrend(ruleId, {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });
        
        // Calculate trend direction
        let trendDirection = "stable";
        if (trend.length >= 2) {
          const firstFPR = trend[0].fpr;
          const lastFPR = trend[trend.length - 1].fpr;
          const change = lastFPR - firstFPR;
          if (change < -0.01) trendDirection = "decreasing";
          else if (change > 0.01) trendDirection = "increasing";
        }
        
        result = {
          ruleId,
          timeRange: trend.length > 0 
            ? `${trend[0].date} to ${trend[trend.length - 1].date}`
            : "No data",
          dataPoints: trend,
          trend: trendDirection,
          percentChange: trend.length >= 2 
            ? ((trend[trend.length - 1].fpr - trend[0].fpr) / (trend[0].fpr || 0.01)) * 100
            : 0,
        };
        break;
      }

      case "compare_rules": {
        if (!ruleIds || ruleIds.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "ruleIds array is required for 'compare_rules' operation",
                  code: "MISSING_PARAMETER",
                }, null, 2),
              },
            ],
            isError: true,
          };
        }
        const comparison = await fpQuery.compareRules(ruleIds, {
          startDate: parsedStartDate,
          endDate: parsedEndDate,
        });
        result = {
          rules: comparison.map(r => ({
            ...r,
            needsCalibration: r.fpr > 0.1,
          })),
        };
        break;
      }

      case "get_statistics":
        // Get statistics across all rules
        result = {
          message: "Statistics operation shows aggregate metrics",
          note: "Use 'compare_rules' with specific ruleIds for detailed comparison, or 'fp_rate' for individual rule metrics",
          availableOperations: [
            "fp_rate - Get FP rate for a specific rule",
            "recent_patterns - Analyze recent FP patterns",
            "fp_trend - View FP rate trend over time",
            "compare_rules - Compare FP rates across multiple rules",
          ],
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
