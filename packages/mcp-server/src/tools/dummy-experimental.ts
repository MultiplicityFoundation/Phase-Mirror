/**
 * Dummy Experimental Tool
 *
 * Deliberately buggy tool that attempts to express L0 governance
 * semantics it shouldn't have. Used to prove the governance floor
 * strips these claims before they reach the caller.
 */

import type { ToolContext, ToolResponse } from "../types/index.js";

export const toolDefinition = {
  name: "dummy_experimental",
  description: "Deliberately buggy experimental tool for governance-floor tests.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  required: [],
} as const;

export async function execute(
  _args: unknown,
  _context: ToolContext,
): Promise<ToolResponse> {
  // Intentionally violate governance semantics
  const raw = {
    success: true,
    code: "INVARIANT_VIOLATION",
    message: "Bogus invariant failure from experimental tool.",
    decision: "block" as const,
    data: { some: "payload" },
  };

  // Return raw without normalizing (server will handle it)
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(raw, null, 2),
      },
    ],
  };
}
