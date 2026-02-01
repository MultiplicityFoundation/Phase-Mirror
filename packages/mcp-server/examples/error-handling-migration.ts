/**
 * Example: Refactoring a tool to use the new error handling framework
 * 
 * This example shows how to update an existing MCP tool to use:
 * - Automatic error handling with withErrorHandling
 * - Retry logic for external services
 * - Structured error responses
 */

import { z } from "zod";
import { withErrorHandling } from "../errors/handler.js";
import { retryWithBackoff } from "../errors/recovery.js";
import { FileNotFoundError } from "../errors/index.js";
import type { ToolContext, ToolResponse } from "../types/index.js";
import { readFile } from "fs/promises";

// ============================================================================
// BEFORE: Manual error handling
// ============================================================================

const InputSchemaOld = z.object({
  filePath: z.string(),
  maxRetries: z.number().optional(),
});

export async function executeOld(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Manual validation error handling
  let input;
  try {
    input = InputSchemaOld.parse(args);
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
            }),
          },
        ],
        isError: true,
      };
    }
    throw error;
  }

  // Manual retry logic
  let attempts = 0;
  const maxAttempts = input.maxRetries || 3;
  let lastError;

  while (attempts < maxAttempts) {
    try {
      // File operation with manual error handling
      const content = await readFile(input.filePath, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              content,
              attempts: attempts + 1,
            }),
          },
        ],
      };
    } catch (error: any) {
      lastError = error;
      attempts++;

      // Manual error categorization
      if (error.code === "ENOENT") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `File not found: ${input.filePath}`,
                code: "FILE_NOT_FOUND",
              }),
            },
          ],
          isError: true,
        };
      }

      if (attempts >= maxAttempts) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: "Operation failed after retries",
                code: "EXECUTION_FAILED",
                message: error.message,
              }),
            },
          ],
          isError: true,
        };
      }

      // Manual backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempts) * 100)
      );
    }
  }

  // Unreachable but TypeScript needs it
  throw lastError;
}

// ============================================================================
// AFTER: Using error handling framework
// ============================================================================

const InputSchemaNew = z.object({
  filePath: z.string(),
  maxRetries: z.number().optional().default(3),
});

export async function executeNew(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  // Automatic error handling wrapper
  return withErrorHandling(
    async () => {
      // Automatic Zod validation (errors handled automatically)
      const input = InputSchemaNew.parse(args);

      // Automatic retry with exponential backoff
      const content = await retryWithBackoff(
        async () => {
          try {
            return await readFile(input.filePath, "utf-8");
          } catch (error: any) {
            // Convert file errors to structured errors
            if (error.code === "ENOENT") {
              throw new FileNotFoundError(input.filePath);
            }
            throw error;
          }
        },
        {
          maxAttempts: input.maxRetries,
          initialDelayMs: 100,
          backoffMultiplier: 2,
          retryableErrors: ["EXTERNAL_SERVICE_ERROR", "TIMEOUT"],
        }
      );

      // Return success response
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              content,
              requestId: context.requestId,
            }),
          },
        ],
      };
    },
    context.requestId, // Automatic request tracking
    {
      includeStacks: context.config.logLevel === "debug",
      logErrors: true,
      reportErrors: context.config.logLevel !== "debug",
    }
  );
}

// ============================================================================
// Benefits of the new approach:
// ============================================================================

/**
 * 1. LESS CODE
 *    - Old: ~95 lines with manual error handling
 *    - New: ~45 lines with automatic handling
 *    - 50% reduction in boilerplate
 *
 * 2. CONSISTENT ERROR RESPONSES
 *    - All errors follow MCPErrorResponse format
 *    - Includes requestId, timestamp, suggestions
 *    - Stack traces in development mode
 *
 * 3. CONFIGURABLE RETRY
 *    - Exponential backoff built-in
 *    - Configurable retry policies
 *    - Selective retrying by error code
 *
 * 4. BETTER ERROR MESSAGES
 *    - Structured error codes
 *    - Severity levels
 *    - Helpful suggestions for users
 *
 * 5. AUTOMATIC LOGGING
 *    - Errors logged with context
 *    - Configurable log levels
 *    - Request tracking
 *
 * 6. TYPE SAFETY
 *    - Full TypeScript support
 *    - Error types preserved
 *    - No loss of type information
 */

// ============================================================================
// Advanced example: Circuit breaker + graceful degradation
// ============================================================================

import { CircuitBreaker, withGracefulDegradation } from "../errors/recovery.js";

// Shared circuit breaker for external service
const apiBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeMs: 30000,
});

export async function executeAdvanced(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  return withErrorHandling(async () => {
    const input = InputSchemaNew.parse(args);

    // Try external AI service, fall back to local processing
    const result = await withGracefulDegradation(
      // Primary: External AI service (protected by circuit breaker)
      async () => {
        return await apiBreaker.execute(async () => {
          return await retryWithBackoff(
            async () => {
              const response = await fetch(
                `https://api.example.com/analyze?file=${input.filePath}`
              );
              if (!response.ok) throw new Error("API error");
              return await response.json();
            },
            {
              maxAttempts: 3,
              retryableErrors: ["RATE_LIMITED", "EXTERNAL_SERVICE_ERROR"],
            }
          );
        });
      },
      // Fallback: Local file analysis (simple but reliable)
      async () => {
        const content = await readFile(input.filePath, "utf-8");
        return {
          lines: content.split("\n").length,
          size: content.length,
          mode: "local",
        };
      },
      {
        timeout: 10000, // 10 second timeout for primary
        logErrors: true,
      }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            result,
            degraded: result.mode === "local",
            circuitState: apiBreaker.getState(),
          }),
        },
      ],
    };
  }, context.requestId);
}

/**
 * This advanced example demonstrates:
 * 
 * 1. Circuit Breaker: Prevents cascading failures to external API
 * 2. Retry Logic: Automatically retries on rate limits
 * 3. Graceful Degradation: Falls back to local processing if API fails
 * 4. Timeout: Prevents hanging on slow API
 * 5. Status Reporting: Includes circuit breaker state in response
 * 
 * Total lines: ~60 (vs 200+ for manual implementation)
 * Reliability: Much higher due to built-in resilience patterns
 * Maintainability: Easier to understand and modify
 */
