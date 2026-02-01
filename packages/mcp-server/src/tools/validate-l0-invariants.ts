import { z } from "zod";
import { ToolContext, ToolResponse } from "../types/index.js";

/**
 * Input schema for validate_l0_invariants tool
 */
export const ValidateL0InvariantsInputSchema = z.object({
  schemaVersion: z
    .string()
    .describe("Schema version and hash in format 'version:hash' (e.g., '1.0:abc123')"),
  permissionBits: z
    .number()
    .int()
    .min(0)
    .max(65535)
    .describe("Permission bitfield (16 bits, bits 12-15 must be 0)"),
  driftMagnitude: z
    .number()
    .min(0.0)
    .max(1.0)
    .describe("Drift magnitude from baseline (0.0 to 1.0)"),
  nonce: z.object({
    value: z.string().describe("Nonce value for replay protection"),
    issuedAt: z.number().describe("Unix timestamp in milliseconds when nonce was issued"),
  }).describe("Cryptographic nonce for replay protection"),
  contractionWitnessScore: z
    .number()
    .min(0.0)
    .max(1.0)
    .describe("Contraction witness score (0.0 to 1.0, must be 1.0 for validation)"),
});

export type ValidateL0InvariantsInput = z.infer<typeof ValidateL0InvariantsInputSchema>;

/**
 * Tool definition for MCP protocol
 */
export const toolDefinition = {
  name: "validate_l0_invariants",
  description:
    "Validate foundation-tier L0 invariants that enforce non-negotiable governance rules. " +
    "These checks run in <100ns and include: schema hash integrity, permission bits validation, " +
    "drift magnitude checks, nonce freshness, and contraction witness validation. " +
    "All L0 checks are always-on and fail-closed (validation failure = block). " +
    "Use this to verify that state transitions comply with Phase Mirror's core security and governance requirements.",
  inputSchema: {
    type: "object",
    properties: {
      schemaVersion: {
        type: "string",
        description: "Schema version and hash (format: 'version:hash', e.g., '1.0:f7a8b9c0')",
      },
      permissionBits: {
        type: "number",
        description: "Permission bitfield (16 bits, 0-65535, reserved bits 12-15 must be 0)",
      },
      driftMagnitude: {
        type: "number",
        description: "Drift magnitude from baseline (0.0 to 1.0, threshold: 0.3)",
      },
      nonce: {
        type: "object",
        properties: {
          value: {
            type: "string",
            description: "Nonce value",
          },
          issuedAt: {
            type: "number",
            description: "Unix timestamp in milliseconds",
          },
        },
        required: ["value", "issuedAt"],
        description: "Cryptographic nonce with timestamp",
      },
      contractionWitnessScore: {
        type: "number",
        description: "Contraction witness score (0.0 to 1.0, must be 1.0)",
      },
    },
    required: ["schemaVersion", "permissionBits", "driftMagnitude", "nonce", "contractionWitnessScore"],
  },
} as const;

/**
 * Execute L0 invariants validation
 */
export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Validate input
  let validatedInput: ValidateL0InvariantsInput;
  try {
    validatedInput = ValidateL0InvariantsInputSchema.parse(args);
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

  try {
    // Import L0 invariants from mirror-dissonance
    const l0Module = await import("@mirror-dissonance/core/dist/src/l0-invariants/index.js");
    const { checkL0Invariants } = l0Module;
    
    // Import type separately
    type State = {
      schemaVersion: string;
      permissionBits: number;
      driftMagnitude: number;
      nonce: {
        value: string;
        issuedAt: number;
      };
      contractionWitnessScore: number;
    };

    // Construct state object for validation
    const state: State = {
      schemaVersion: validatedInput.schemaVersion,
      permissionBits: validatedInput.permissionBits,
      driftMagnitude: validatedInput.driftMagnitude,
      nonce: validatedInput.nonce,
      contractionWitnessScore: validatedInput.contractionWitnessScore,
    };

    // Execute L0 validation
    const startTime = Date.now();
    const result = checkL0Invariants(state);
    const endTime = Date.now();

    // Format detailed check results
    const checkResults = {
      "L0-001 (Schema Hash)": {
        passed: !result.failedChecks.includes("schema_hash"),
        description: "Schema version and hash integrity",
      },
      "L0-002 (Permission Bits)": {
        passed: !result.failedChecks.includes("permission_bits"),
        description: "GitHub Actions permissions follow least privilege",
      },
      "L0-003 (Drift Magnitude)": {
        passed: !result.failedChecks.includes("drift_magnitude"),
        description: "Changes within safety thresholds",
      },
      "L0-004 (Nonce Freshness)": {
        passed: !result.failedChecks.includes("nonce_freshness"),
        description: "Cryptographic nonce is fresh and valid",
      },
      "L0-005 (Contraction Witness)": {
        passed: !result.failedChecks.includes("contraction_witness"),
        description: "State coherence validated",
      },
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
            validation: {
              passed: result.passed,
              decision: result.passed ? "ALLOW" : "BLOCK",
              failedChecks: result.failedChecks,
              checkResults,
              performance: {
                latencyNs: result.latencyNs,
                latencyMs: (endTime - startTime),
                target: "p99 < 100ns",
              },
              context: result.context,
            },
            message: result.passed
              ? "All L0 invariants passed - state transition is valid"
              : `L0 invariant violations detected: ${result.failedChecks.join(", ")}. State transition BLOCKED.`,
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
            error: "L0 validation execution failed",
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
