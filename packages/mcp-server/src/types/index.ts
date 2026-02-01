import { z } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Environment configuration for MCP server
 */
export interface MCPServerConfig {
  /** AWS region for DynamoDB/SSM access */
  awsRegion: string;
  /** DynamoDB table name for FP store */
  fpTableName?: string;
  /** DynamoDB table name for consent store */
  consentTableName?: string;
  /** SSM parameter name for nonce */
  nonceParameterName?: string;
  /** Log level */
  logLevel: "debug" | "info" | "warn" | "error";
}

/**
 * Tool execution context
 */
export interface ToolContext {
  config: MCPServerConfig;
  requestId: string;
  timestamp: Date;
}

/**
 * Standard tool response format (matches MCP CallToolResult)
 */
export type ToolResponse = CallToolResult;

/**
 * Tool error details
 */
export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Zod schemas for validation
 */
export const MCPServerConfigSchema = z.object({
  awsRegion: z.string(),
  fpTableName: z.string().optional(),
  consentTableName: z.string().optional(),
  nonceParameterName: z.string().optional(),
  logLevel: z.enum(["debug", "info", "warn", "error"]),
});

export type MCPServerConfigInput = z.infer<typeof MCPServerConfigSchema>;
