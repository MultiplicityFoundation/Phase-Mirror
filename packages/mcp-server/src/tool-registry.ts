/**
 * MCP Tool Registry
 *
 * Centralised registry of all tool definitions exposed by the MCP server.
 * The build-contract script and the server itself both consume this list,
 * keeping the policy manifest ↔ code relationship single-source.
 */

import * as analyzeDissonanceTool from "./tools/analyze-dissonance.js";
import * as validateL0Tool from "./tools/validate-l0-invariants.js";
import * as checkADRComplianceTool from "./tools/check-adr-compliance.js";
import * as checkConsentTool from "./tools/check-consent-requirements.js";
import * as queryFPStoreTool from "./tools/query-fp-store.js";
import * as dummyExperimentalTool from "./tools/dummy-experimental.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;
  required?: readonly string[];
}

export function getToolDefinitions(): ToolDefinition[] {
  return [
    analyzeDissonanceTool.toolDefinition,
    validateL0Tool.toolDefinition,
    checkADRComplianceTool.toolDefinition,
    checkConsentTool.toolDefinition,
    queryFPStoreTool.toolDefinition,
    dummyExperimentalTool.toolDefinition,
  ];
}
