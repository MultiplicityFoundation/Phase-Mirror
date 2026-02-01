/**
 * query_fp_store MCP tool
 * 
 * Query Phase Mirror's false positive (FP) store to analyze FP patterns
 */
import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";
import { 
  createFPStore, 
  IFPStore, 
  FPStoreQuery,
  createFPStoreQuery,
  createConsentStore,
  FPRateResult,
  FPTrendPoint
} from "@mirror-dissonance/core/dist/src/index.js";

/**
 * Input schema for query_fp_store tool
 */
export const QueryFPStoreInputSchema = z.object({
  queryType: z
    .enum(["fp_rate", "recent_patterns", "trend_analysis", "cross_rule_comparison"])
    .describe("Type of FP store query to perform"),
  
  ruleId: z
    .string()
    .optional()
    .describe("Rule ID to query (required for fp_rate, recent_patterns, trend_analysis)"),
  
  ruleIds: z
    .array(z.string())
    .optional()
    .describe("Array of rule IDs (required for cross_rule_comparison)"),
  
  orgId: z
    .string()
    .describe("Organization ID (required for consent check)"),
  
  daysBack: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe("Number of days to look back (default: 30)"),
  
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of results (default: 100)"),
  
  threshold: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("FPR threshold for calibration flag (default: 0.1)"),
});

export type QueryFPStoreInput = z.infer<typeof QueryFPStoreInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "query_fp_store",
  description:
    "Query Phase Mirror's false positive (FP) store to analyze FP patterns, calculate " +
    "FP rates, detect trends, and identify rules needing calibration. Requires organization " +
    "consent for access (ADR-004 compliance). Use this to understand rule performance, " +
    "learn from past false positives, and improve governance rule accuracy over time.",
  inputSchema: {
    type: "object",
    properties: {
      queryType: {
        type: "string",
        enum: ["fp_rate", "recent_patterns", "trend_analysis", "cross_rule_comparison"],
        description: "Type of query to perform",
      },
      ruleId: {
        type: "string",
        description: "Rule ID (MD-###) for single-rule queries",
        pattern: "^MD-\\d{3}$",
      },
      ruleIds: {
        type: "array",
        items: { type: "string", pattern: "^MD-\\d{3}$" },
        description: "Array of rule IDs for cross-rule comparison",
      },
      orgId: {
        type: "string",
        description: "Organization ID (required for consent verification)",
      },
      daysBack: {
        type: "number",
        minimum: 1,
        maximum: 365,
        description: "Days to look back (default: 30)",
      },
      limit: {
        type: "number",
        minimum: 1,
        maximum: 1000,
        description: "Max results (default: 100)",
      },
      threshold: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "FPR threshold for calibration (default: 0.1)",
      },
    },
    required: ["queryType", "orgId"],
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
    queryType,
    ruleId,
    ruleIds,
    orgId,
    daysBack,
    limit,
    threshold,
  } = validatedInput;

  try {
    // Check consent (ADR-004 compliance)
    const consentStore = createConsentStore(
      context.config.consentTableName
        ? {
            tableName: context.config.consentTableName,
            region: context.config.awsRegion,
          }
        : undefined
    );

    const hasConsent = await consentStore.hasValidConsent(orgId);
    
    if (!hasConsent) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: "Consent required",
                code: "CONSENT_REQUIRED",
                message: `Organization '${orgId}' has not granted consent for FP store access. ` +
                  `Contact your Phase Mirror administrator to request access.`,
                learnMore: "https://phasemirror.com/docs/fp-store-consent",
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

    // Initialize FP store
    const fpStore = createFPStore(
      context.config.fpTableName
        ? {
            tableName: context.config.fpTableName,
            region: context.config.awsRegion,
          }
        : undefined
    );

    const fpQuery = createFPStoreQuery(fpStore);
    const startTime = performance.now();

    // Execute query based on type
    let result: any;

    switch (queryType) {
      case "fp_rate": {
        if (!ruleId) {
          throw new Error("ruleId is required for fp_rate query");
        }
        
        const fprResult = await fpQuery.getFPRate(ruleId, {
          orgId,
          endDate: new Date(),
          startDate: daysBack ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : undefined,
        });

        result = {
          queryType: "fp_rate",
          ...fprResult,
          recommendation: getRecommendation(fprResult.fpr, fprResult.confidence),
        };
        break;
      }

      case "recent_patterns": {
        if (!ruleId) {
          throw new Error("ruleId is required for recent_patterns query");
        }
        
        const patterns = await fpQuery.getRecentPatterns(ruleId, {
          limit,
          daysBack,
        });

        result = {
          queryType: "recent_patterns",
          ruleId,
          patternsFound: patterns.length,
          patterns: patterns.map(p => ({
            contextHash: p.contextHash.substring(0, 12) + "...", // Truncate for privacy
            frequency: p.frequency,
            lastSeen: p.lastSeen.toISOString(),
            firstSeen: p.firstSeen.toISOString(),
            durationDays: Math.round((p.lastSeen.getTime() - p.firstSeen.getTime()) / (1000 * 60 * 60 * 24)),
          })),
          suggestions: patterns.length > 0
            ? [`Found ${patterns.length} recurring FP pattern(s). Consider rule refinement to reduce noise.`]
            : ["No recurring FP patterns found. Rule performing well."],
        };
        break;
      }

      case "trend_analysis": {
        if (!ruleId) {
          throw new Error("ruleId is required for trend_analysis query");
        }
        
        const trendPoints = await fpQuery.getFPTrend(ruleId, {
          startDate: daysBack ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : undefined,
          endDate: new Date(),
          bucketSizeDays: 7, // Weekly buckets
        });

        const trend = fpQuery.detectTrend(trendPoints);
        const percentChange = calculatePercentChange(trendPoints);

        result = {
          queryType: "trend_analysis",
          ruleId,
          timeRange: {
            start: trendPoints[0]?.date,
            end: trendPoints[trendPoints.length - 1]?.date,
          },
          dataPoints: trendPoints,
          trend,
          percentChange,
          interpretation: getTrendInterpretation(trend, percentChange),
        };
        break;
      }

      case "cross_rule_comparison": {
        if (!ruleIds || ruleIds.length === 0) {
          throw new Error("ruleIds array is required for cross_rule_comparison query");
        }
        
        const comparison = await fpQuery.compareFPRates(ruleIds, { threshold });

        result = {
          queryType: "cross_rule_comparison",
          rulesAnalyzed: comparison.length,
          rules: comparison,
          summary: {
            needingCalibration: comparison.filter(r => r.needsCalibration).length,
            averageFPR: comparison.reduce((sum, r) => sum + r.fpr, 0) / comparison.length,
            highestFPR: comparison[0],
            lowestFPR: comparison[comparison.length - 1],
          },
          recommendations: comparison
            .filter(r => r.needsCalibration)
            .map(r => `${r.ruleId}: FPR ${(r.fpr * 100).toFixed(1)}% exceeds threshold. Review rule logic.`),
        };
        break;
      }
    }

    const elapsedMs = performance.now() - startTime;

    // Format response
    const response = {
      success: true,
      timestamp: context.timestamp.toISOString(),
      requestId: context.requestId,
      query: {
        type: queryType,
        parameters: { 
          ...(ruleId && { ruleId }),
          ...(ruleIds && { ruleIds }),
          orgId, 
          ...(daysBack && { daysBack }),
          ...(limit && { limit }),
          ...(threshold && { threshold })
        },
      },
      result,
      performance: {
        elapsedMs: Math.round(elapsedMs),
      },
      compliance: {
        consentVerified: true,
        dataAnonymized: true, // All data anonymized per ADR-004
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
              error: "FP store query failed",
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

/**
 * Get recommendation based on FPR
 */
function getRecommendation(fpr: number, confidence: string): string {
  if (confidence === "low") {
    return "Insufficient data for reliable recommendation. Need more events.";
  }
  
  if (fpr < 0.05) {
    return "Excellent FPR (<5%). Rule is well-calibrated.";
  } else if (fpr < 0.10) {
    return "Good FPR (5-10%). Within acceptable range.";
  } else if (fpr < 0.20) {
    return "Moderate FPR (10-20%). Consider rule refinement.";
  } else {
    return "High FPR (>20%). Rule needs immediate calibration.";
  }
}

/**
 * Calculate percent change from trend
 */
function calculatePercentChange(trendPoints: FPTrendPoint[]): number {
  if (trendPoints.length < 2) return 0;
  
  const first = trendPoints[0].fpr;
  const last = trendPoints[trendPoints.length - 1].fpr;
  
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

/**
 * Get trend interpretation
 */
function getTrendInterpretation(
  trend: "increasing" | "decreasing" | "stable",
  percentChange: number
): string {
  if (trend === "stable") {
    return "FPR is stable. Rule performance consistent.";
  } else if (trend === "decreasing") {
    return `FPR decreasing by ${Math.abs(percentChange).toFixed(1)}%. Rule improving over time. ✅`;
  } else {
    return `FPR increasing by ${Math.abs(percentChange).toFixed(1)}%. Rule may need attention. ⚠️`;
  }
}
