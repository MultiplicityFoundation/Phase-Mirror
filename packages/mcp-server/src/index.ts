#!/usr/bin/env node

/**
 * Phase Mirror MCP Server
 * 
 * Model Context Protocol server that exposes Phase Mirror's governance
 * capabilities as callable tools for GitHub Copilot coding agent.
 * 
 * Every tool response is wrapped in an MCPGovernanceEnvelope via
 * normalizeResponse(), enforcing the governance floor described in
 * ADR-009 and ADR-010.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig, ToolContext, ToolResponse, GovernanceTier } from "./types/index.js";
import * as analyzeDissonance from "./tools/analyze-dissonance.js";
import * as validateL0Invariants from "./tools/validate-l0-invariants.js";
import * as checkADRCompliance from "./tools/check-adr-compliance.js";
import * as queryFPStore from "./tools/query-fp-store.js";
import * as checkConsentRequirements from "./tools/check-consent-requirements.js";
import * as dummyExperimental from "./tools/dummy-experimental.js";
import { generateRequestId } from "./utils/index.js";
import { normalizeResponse } from "./utils/normalize-response.js";
import type { NormalizeContext } from "./utils/normalize-response.js";
import type { GovernanceEnvironment } from "./types/governance-envelope.js";

/**
 * Tool → tier mapping. Kept in sync with policy/mcp-tools.policy.json.
 */
const TOOL_TIERS: Record<string, GovernanceTier> = {
  analyze_dissonance: "authoritative",
  validate_l0_invariants: "authoritative",
  check_adr_compliance: "authoritative",
  check_consent_requirements: "authoritative",
  query_fp_store: "experimental",
  dummy_experimental: "experimental",
};

/**
 * Initialize MCP server configuration from environment variables
 */
function initializeConfig(): MCPServerConfig {
  return {
    awsRegion: process.env.AWS_REGION || "us-east-1",
    fpTableName: process.env.FP_TABLE_NAME,
    consentTableName: process.env.CONSENT_TABLE_NAME,
    nonceParameterName: process.env.NONCE_PARAMETER_NAME,
    logLevel: (process.env.LOG_LEVEL as MCPServerConfig["logLevel"]) || "info",
  };
}

/**
 * Detect whether we're running in cloud or local mode.
 */
function detectEnvironment(config: MCPServerConfig): GovernanceEnvironment {
  return config.fpTableName && config.consentTableName ? "cloud" : "local";
}

/**
 * Wrap a tool's ToolResponse in a governance envelope.
 *
 * Parses the JSON from the tool response, extracts governance-relevant
 * fields (success, code, message, isError, decision), and passes them
 * through normalizeResponse() which enforces the governance floor.
 * Everything else is placed into `data`.
 */
function wrapWithGovernance(
  toolResponse: ToolResponse,
  toolName: string,
  context: ToolContext,
  config: MCPServerConfig,
): ToolResponse {
  const tier = TOOL_TIERS[toolName];
  if (!tier) {
    // Unknown tool — return as-is (shouldn't happen)
    return toolResponse;
  }

  const environment = detectEnvironment(config);

  // Parse the JSON the tool returned
  const textContent = toolResponse.content.find(
    (c): c is { type: "text"; text: string } => c.type === "text" && typeof (c as { text?: string }).text === "string",
  );
  if (!textContent) return toolResponse;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(textContent.text);
  } catch {
    return toolResponse; // Not JSON — pass through
  }

  // Extract governance-relevant fields
  const { success, code, message, isError, decision, ...rest } = parsed;

  const raw = {
    success: success as boolean,
    code: code as string | undefined,
    message: message as string | undefined,
    isError: isError as boolean | undefined,
    decision: decision as string | undefined,
    data: rest,
  };

  // For validate_l0_invariants, derive a decision from validation results
  if (toolName === "validate_l0_invariants" && !decision) {
    const validation = rest.validation as { allPassed?: boolean } | undefined;
    if (validation) {
      raw.decision = validation.allPassed ? "pass" : "block";
    }
  }

  // For check_adr_compliance, derive a decision from compliance results
  if (toolName === "check_adr_compliance" && !decision) {
    const compliance = rest.compliance as { compliant?: boolean } | undefined;
    if (compliance) {
      raw.decision = compliance.compliant ? "pass" : "warn";
    }
  }

  // For analyze_dissonance, pull decision from nested analysis
  if (toolName === "analyze_dissonance" && !decision) {
    const analysis = rest.analysis as { decision?: Record<string, unknown> } | undefined;
    if (analysis?.decision) {
      const machineDecision = analysis.decision as { action?: string };
      if (machineDecision.action === "block") raw.decision = "block";
      else if (machineDecision.action === "warn") raw.decision = "warn";
      else raw.decision = "pass";
    }
  }

  // For check_consent_requirements, derive from canProceed or validation.allValid
  if (toolName === "check_consent_requirements" && !decision) {
    const checkType = rest.checkType as string | undefined;
    if (checkType === "required_for_operation") {
      const canProceed = rest.canProceed as boolean | undefined;
      if (canProceed === false) raw.decision = "block";
      else if (canProceed === true) raw.decision = "pass";
    } else if (checkType === "validate") {
      const validation = rest.validation as { allValid?: boolean } | undefined;
      if (validation) {
        raw.decision = validation.allValid ? "pass" : "warn";
      }
    } else if (checkType === "summary") {
      raw.decision = "pass"; // summaries are informational
    }
  }

  // For query_fp_store, derive advisory-only decision
  if (toolName === "query_fp_store" && !decision) {
    raw.decision = raw.success ? "pass" : "warn";
  }

  const normalizeCtx: NormalizeContext = {
    ...context,
    tier,
    environment,
  };

  const envelope = normalizeResponse(raw, normalizeCtx);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(envelope, null, 2),
      },
    ],
    isError: toolResponse.isError,
  };
}

/**
 * Main server initialization
 */
async function main() {
  const config = initializeConfig();
  
  // Create MCP server instance
  const server = new Server(
    {
      name: "phase-mirror-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Handler for listing available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_server_info",
          description: "Get information about the Phase Mirror MCP server",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        analyzeDissonance.toolDefinition,
        validateL0Invariants.toolDefinition,
        checkADRCompliance.toolDefinition,
        queryFPStore.toolDefinition,
        checkConsentRequirements.toolDefinition,
        dummyExperimental.toolDefinition,
      ],
    };
  });

  // Handler for tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Create tool context
    const toolContext: ToolContext = {
      config,
      requestId: generateRequestId(),
      timestamp: new Date(),
    };

    // get_server_info is not a governance tool — return raw
    if (name === "get_server_info") {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: "Phase Mirror MCP Server",
              version: "0.1.0",
              environment: detectEnvironment(config),
              config: {
                awsRegion: config.awsRegion,
                fpTableName: config.fpTableName,
                consentTableName: config.consentTableName,
                nonceParameterName: config.nonceParameterName,
                logLevel: config.logLevel,
              },
              governanceTiers: TOOL_TIERS,
            }, null, 2),
          },
        ],
      };
    }

    // Execute the tool
    let rawResponse: ToolResponse;
    switch (name) {
      case "analyze_dissonance":
        rawResponse = await analyzeDissonance.execute(args, toolContext);
        break;

      case "validate_l0_invariants":
        rawResponse = await validateL0Invariants.execute(args, toolContext);
        break;

      case "check_adr_compliance":
        rawResponse = await checkADRCompliance.execute(args, toolContext);
        break;

      case "query_fp_store":
        rawResponse = await queryFPStore.execute(args, toolContext);
        break;

      case "check_consent_requirements":
        rawResponse = await checkConsentRequirements.execute(args, toolContext);
        break;

      case "dummy_experimental":
        rawResponse = await dummyExperimental.execute(args, toolContext);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Wrap in governance envelope
    return wrapWithGovernance(rawResponse, name, toolContext, config);
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server start
  console.error("Phase Mirror MCP Server running on stdio");
}

// Run the server
main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
