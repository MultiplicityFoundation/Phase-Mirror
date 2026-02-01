/**
 * Utility functions for MCP server
 */

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Format error message for MCP response
 */
export function formatError(code: string, message: string, details?: Record<string, unknown>) {
  return {
    code,
    message,
    ...(details && { data: details }),
  };
}

/**
 * Log message with timestamp
 */
export function log(level: string, message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const logData = data ? ` ${JSON.stringify(data)}` : '';
  console.error(`[${timestamp}] [${level.toUpperCase()}] ${message}${logData}`);
}

// Re-export config utilities
export { requireConfig } from './config.js';
