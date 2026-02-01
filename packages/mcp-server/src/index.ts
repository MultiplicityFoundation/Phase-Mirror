#!/usr/bin/env node

/**
 * Phase Mirror MCP Server
 * 
 * Model Context Protocol server that exposes Phase Mirror's governance
 * capabilities as callable tools for GitHub Copilot coding agent.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { MCPServerConfig, ToolContext } from "./types/index.js";
import * as analyzeDissonance from "./tools/analyze-dissonance.js";
import * as validateL0Invariants from "./tools/validate-l0-invariants.js";
import { generateRequestId } from "./utils/index.js";

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

    switch (name) {
      case "get_server_info":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: "Phase Mirror MCP Server",
                version: "0.1.0",
                config: {
                  awsRegion: config.awsRegion,
                  fpTableName: config.fpTableName,
                  consentTableName: config.consentTableName,
                  nonceParameterName: config.nonceParameterName,
                  logLevel: config.logLevel,
                },
              }, null, 2),
            },
          ],
        };

      case "analyze_dissonance":
        return await analyzeDissonance.execute(args, toolContext);

      case "validate_l0_invariants":
        return await validateL0Invariants.execute(args, toolContext);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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
