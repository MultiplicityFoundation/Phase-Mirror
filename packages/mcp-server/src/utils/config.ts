/**
 * Configuration utilities for MCP server
 */
import { MCPServerConfig } from "../types/index.js";

/**
 * Require configuration to be present
 * Throws if required fields are missing
 */
export function requireConfig(config: MCPServerConfig): Required<MCPServerConfig> {
  if (!config.awsRegion) {
    throw new Error("awsRegion is required in configuration");
  }
  
  return {
    awsRegion: config.awsRegion,
    fpTableName: config.fpTableName,
    consentTableName: config.consentTableName,
    nonceParameterName: config.nonceParameterName,
    logLevel: config.logLevel || "info",
  } as Required<MCPServerConfig>;
}
