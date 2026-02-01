import { z } from "zod";
import { 
  AnalysisOrchestrator
} from "@mirror-dissonance/core/dist/src/oracle.js";
import type { ToolContext, ToolResponse } from "../types/index.js";

// Helper types
interface RuleViolation {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  context: Record<string, unknown>;
}

interface Finding {
  id: string;
  ruleId: string;
  ruleVersion: string;
  severity: string;
  title: string;
  description: string;
  evidence: Array<{
    path: string;
    line: number;
    snippet: { value: string };
  }>;
  remediation: string;
}

/**
 * Input schema for analyze_dissonance tool
 */
export const AnalyzeDissonanceInputSchema = z.object({
  files: z
    .array(z.string())
    .min(1)
    .describe("Array of file paths to analyze (relative to repository root)"),
  repository: z
    .object({
      owner: z.string().describe("Repository owner (org or user)"),
      name: z.string().describe("Repository name"),
      branch: z.string().optional().describe("Branch name (default: main)"),
    })
    .describe("Repository context"),
  mode: z
    .enum(["pull_request", "issue", "merge_group", "drift"])
    .default("issue")
    .describe(
      "Analysis mode: " +
      "pull_request = PR validation, " +
      "issue = planning phase, " +
      "merge_group = merge queue check, " +
      "drift = baseline comparison"
    ),
  context: z
    .string()
    .optional()
    .describe("Additional context (issue description, PR body, etc.)"),
  commitSha: z
    .string()
    .optional()
    .describe("Specific commit SHA to analyze"),
  includeADRs: z
    .boolean()
    .default(true)
    .describe("Include Architecture Decision Record references"),
  includeFPPatterns: z
    .boolean()
    .default(false)
    .describe("Include false positive patterns (requires consent)"),
});

export type AnalyzeDissonanceInput = z.infer<typeof AnalyzeDissonanceInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "analyze_dissonance",
  description:
    "Run Phase Mirror's Mirror Dissonance protocol to detect inconsistencies across " +
    "requirements, configurations, code, and runtime assumptions. Returns actionable " +
    "findings with severity levels, evidence citations, and relevant Architecture " +
    "Decision Records (ADRs). Use this before implementing code changes to ensure " +
    "compliance with governance rules and architectural constraints.",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        description: "File paths to analyze (relative to repository root)",
        examples: [
          ["src/index.ts", "src/config.ts"],
          [".github/workflows/ci.yml"],
          ["README.md", "docs/architecture.md"],
        ],
      },
      repository: {
        type: "object",
        properties: {
          owner: { type: "string", description: "Repository owner" },
          name: { type: "string", description: "Repository name" },
          branch: { type: "string", description: "Branch name (optional)" },
        },
        required: ["owner", "name"],
        examples: [
          { owner: "PhaseMirror", name: "Phase-Mirror" },
          { owner: "acme-corp", name: "api-gateway", branch: "feature-auth" },
        ],
      },
      mode: {
        type: "string",
        enum: ["pull_request", "issue", "merge_group", "drift"],
        default: "issue",
        description: "Analysis context mode",
      },
      context: {
        type: "string",
        description: "Optional context to inform analysis",
        examples: [
          "Implement JWT authentication with RS256",
          "Refactor database connection pooling",
        ],
      },
      commitSha: {
        type: "string",
        description: "Specific commit to analyze (optional)",
        pattern: "^[0-9a-f]{40}$",
      },
      includeADRs: {
        type: "boolean",
        default: true,
        description: "Include ADR references in response",
      },
      includeFPPatterns: {
        type: "boolean",
        default: false,
        description: "Include false positive patterns (requires org consent)",
      },
    },
    required: ["files", "repository"],
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
    repository,
    mode,
    context: userContext,
    commitSha,
    includeADRs,
    includeFPPatterns,
  } = validatedInput;

  try {
    // Map mode from tool schema to orchestrator schema
    // 'issue' mode is used for planning phase analysis and maps to 'drift' mode in the orchestrator
    // which performs baseline comparison without strict blocking behavior
    const orchestratorMode = mode === "issue" ? "drift" : mode;
    
    // Create orchestrator
    const orchestrator = new AnalysisOrchestrator({
      awsRegion: context.config.awsRegion,
      fpTableName: context.config.fpTableName,
      consentTableName: context.config.consentTableName,
      nonceParameterName: context.config.nonceParameterName,
      adrPath: includeADRs ? (process.env.ADR_PATH || "./docs/adr") : undefined,
    });

    await orchestrator.initialize();

    // Check consent if FP patterns requested
    // Note: Using NoOpConsentStore which returns implicit consent by default
    if (includeFPPatterns) {
      // In production, this would check actual consent records
      // The orchestrator uses NoOpConsentStore by default, which always returns true
    }

    // Run analysis
    const report = await orchestrator.analyze({
      files,
      repository,
      mode: orchestratorMode as 'pull_request' | 'merge_group' | 'drift' | 'calibration',
      context: userContext,
      commitSha,
    });

    // Format findings from violations
    // Note: The current Oracle implementation doesn't provide file-level violation context
    // In future versions, violations should include the specific file path where they occurred
    const findings: Finding[] = report.violations.map((v: RuleViolation, idx: number) => ({
      id: `finding-${idx + 1}`,
      ruleId: v.ruleId,
      ruleVersion: "1.0.0", // Default version
      severity: v.severity,
      title: v.message,
      description: v.message,
      evidence: [{
        path: v.context.filePath as string || files[0] || "unknown",
        line: (v.context.line as number) || 1,
        snippet: { value: String(v.context.snippet || "") },
      }],
      remediation: `Address ${v.severity} severity issue: ${v.message}`,
    }));

    // Calculate summary
    const bySeverity = {
      critical: findings.filter((f: Finding) => f.severity === "critical").length,
      high: findings.filter((f: Finding) => f.severity === "high").length,
      medium: findings.filter((f: Finding) => f.severity === "medium").length,
      low: findings.filter((f: Finding) => f.severity === "low").length,
    };

    // Optionally include FP patterns (placeholder for now)
    let fpPatterns: Record<string, { count: number; observedFPR: number; recentExamples: unknown[] }> | undefined = undefined;
    if (includeFPPatterns && findings.length > 0) {
      fpPatterns = {};
      const uniqueRules = new Set(findings.map((f: Finding) => f.ruleId));
      
      for (const ruleId of uniqueRules) {
        // Placeholder: In production, this would query the FP store
        fpPatterns[ruleId] = {
          count: 0,
          observedFPR: 0.0,
          recentExamples: [],
        };
      }
    }

    // Format enhanced response
    const response = {
      success: true,
      timestamp: context.timestamp.toISOString(),
      requestId: context.requestId,
      analysis: {
        mode,
        repository: `${repository.owner}/${repository.name}`,
        branch: repository.branch || "main",
        filesAnalyzed: files.length,
        commitSha: commitSha || "latest",
        
        // Summary
        summary: {
          totalFindings: findings.length,
          bySeverity,
          decision: report.machineDecision.outcome,
          degradedMode: false,
        },

        // Findings with evidence
        findings: findings.map((f: Finding) => ({
          id: f.id,
          ruleId: f.ruleId,
          ruleVersion: f.ruleVersion,
          severity: f.severity,
          title: f.title,
          description: f.description,
          evidence: f.evidence.map((e: Finding['evidence'][0]) => ({
            path: e.path,
            line: e.line,
            snippet: e.snippet?.value,
          })),
          remediation: f.remediation,
        })),

        // ADR references (if included)
        adrReferences: includeADRs ? (report.adrReferences || {}) : undefined,

        // FP patterns (if included and consented)
        fpPatterns: includeFPPatterns ? fpPatterns : undefined,

        // Degraded mode details
        degradedModeDetails: undefined,

        // Recommendations
        recommendations: generateRecommendations(findings, report.machineDecision.outcome),
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
              error: "Analysis execution failed",
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
 * Generate actionable recommendations based on findings
 */
function generateRecommendations(
  findings: Array<{ severity: string; ruleId: string }>,
  outcome: string
): string[] {
  const recommendations: string[] = [];

  // Critical findings
  const critical = findings.filter((f: { severity: string }) => f.severity === "critical");
  if (critical.length > 0) {
    recommendations.push(
      `Address ${critical.length} critical finding(s) immediately before proceeding`
    );
  }

  // General guidance
  if (findings.length === 0) {
    recommendations.push("No governance violations detected. Proceed with implementation.");
  } else if (outcome === "warn") {
    recommendations.push(
      "Findings detected but not blocking. Review warnings and document decisions."
    );
  } else if (outcome === "block") {
    recommendations.push(
      "Critical issues detected. Address all findings before proceeding."
    );
  }

  return recommendations;
}
