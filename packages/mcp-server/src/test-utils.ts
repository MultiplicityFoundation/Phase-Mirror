/**
 * Test utilities for MCP server tests
 */
import { ToolContext, MCPServerConfig } from "../src/types/index.js";
import { generateRequestId } from "../src/utils/index.js";

/**
 * Create a mock context for testing
 */
export function createMockContext(configOverrides?: Partial<MCPServerConfig>): ToolContext {
  const defaultConfig: MCPServerConfig = {
    awsRegion: "us-east-1",
    fpTableName: undefined,
    consentTableName: undefined,
    nonceParameterName: undefined,
    logLevel: "info",
  };

  return {
    config: {
      ...defaultConfig,
      ...configOverrides,
    },
    requestId: generateRequestId(),
    timestamp: new Date(),
  };
}
