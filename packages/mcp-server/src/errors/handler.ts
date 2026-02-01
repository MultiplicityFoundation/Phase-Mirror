import { z } from "zod";
import {
  MCPError,
  MCPErrorResponse,
  ErrorCode,
  ErrorSeverity,
  InputValidationError,
  FileNotFoundError,
  ExternalServiceError,
} from "./index.js";
import type { ToolResponse } from "../types/index.js";

/**
 * Error handler configuration
 */
export interface ErrorHandlerConfig {
  /** Include stack traces in responses */
  includeStacks: boolean;
  /** Log errors to console */
  logErrors: boolean;
  /** Report errors to monitoring service */
  reportErrors: boolean;
}

const defaultConfig: ErrorHandlerConfig = {
  includeStacks: process.env.NODE_ENV === "development",
  logErrors: true,
  reportErrors: process.env.NODE_ENV === "production",
};

/**
 * Handle Zod validation errors
 */
export function handleZodError(
  error: z.ZodError,
  requestId?: string
): MCPErrorResponse {
  const details = error.errors.map((e) => ({
    path: e.path.join("."),
    message: e.message,
    code: e.code,
  }));

  const inputError = new InputValidationError(
    "Invalid input parameters",
    { validationErrors: details },
    [
      `Fix the following issues: ${details.map((d) => d.path).join(", ")}`,
      "Refer to the tool schema for correct parameter types",
    ]
  );

  return inputError.toResponse(requestId);
}

/**
 * Handle file system errors
 */
export function handleFileError(
  error: NodeJS.ErrnoException,
  filePath: string,
  requestId?: string
): MCPErrorResponse {
  if (error.code === "ENOENT") {
    return new FileNotFoundError(filePath).toResponse(requestId);
  }

  if (error.code === "EACCES") {
    return new MCPError(
      ErrorCode.EXECUTION_FAILED,
      `Permission denied: ${filePath}`,
      {
        severity: ErrorSeverity.MEDIUM,
        details: { filePath, errorCode: error.code },
        suggestions: ["Check file permissions"],
      }
    ).toResponse(requestId);
  }

  return new MCPError(
    ErrorCode.EXECUTION_FAILED,
    `File operation failed: ${error.message}`,
    {
      severity: ErrorSeverity.MEDIUM,
      details: { filePath, errorCode: error.code },
      cause: error,
    }
  ).toResponse(requestId);
}

/**
 * Handle AWS SDK errors
 */
export function handleAWSError(
  error: Error & { code?: string; $metadata?: any },
  service: string,
  operation: string,
  requestId?: string
): MCPErrorResponse {
  const code = error.code || error.name;

  // Rate limiting
  if (
    code === "ProvisionedThroughputExceededException" ||
    code === "ThrottlingException"
  ) {
    return new MCPError(ErrorCode.RATE_LIMITED, `${service} rate limit exceeded`, {
      severity: ErrorSeverity.MEDIUM,
      details: { service, operation },
      suggestions: ["Wait and retry", "Contact support for capacity increase"],
      retryable: true,
    }).toResponse(requestId);
  }

  // Access denied
  if (code === "AccessDeniedException") {
    return new MCPError(ErrorCode.UNAUTHORIZED_ORG, `Access denied to ${service}`, {
      severity: ErrorSeverity.HIGH,
      details: { service, operation },
      suggestions: ["Verify IAM permissions", "Check service configuration"],
    }).toResponse(requestId);
  }

  // Generic AWS error
  return new ExternalServiceError(service, operation, error).toResponse(requestId);
}

/**
 * Handle generic errors
 */
export function handleGenericError(
  error: unknown,
  requestId?: string,
  config: ErrorHandlerConfig = defaultConfig
): MCPErrorResponse {
  // Already an MCP error
  if (error instanceof MCPError) {
    if (config.logErrors) {
      console.error(`[MCPError] ${error.code}: ${error.message}`);
    }
    return error.toResponse(requestId, config.includeStacks);
  }

  // Zod validation error
  if (error instanceof z.ZodError) {
    if (config.logErrors) {
      console.error(`[ValidationError] ${error.errors.length} issues`);
    }
    return handleZodError(error, requestId);
  }

  // Standard Error
  if (error instanceof Error) {
    if (config.logErrors) {
      console.error(`[Error] ${error.name}: ${error.message}`);
      if (config.includeStacks && error.stack) {
        console.error(error.stack);
      }
    }

    return new MCPError(ErrorCode.INTERNAL_ERROR, error.message, {
      severity: ErrorSeverity.HIGH,
      details: { errorType: error.name },
      suggestions: ["Contact support if issue persists"],
      cause: error,
    }).toResponse(requestId, config.includeStacks);
  }

  // Unknown error type
  if (config.logErrors) {
    console.error(`[UnknownError]`, error);
  }

  return new MCPError(
    ErrorCode.INTERNAL_ERROR,
    "An unexpected error occurred",
    {
      severity: ErrorSeverity.CRITICAL,
      details: { errorType: typeof error },
      suggestions: ["Contact support"],
    }
  ).toResponse(requestId);
}

/**
 * Wrap tool execution with error handling
 */
export async function withErrorHandling<T extends ToolResponse>(
  fn: () => Promise<T>,
  requestId?: string,
  config?: ErrorHandlerConfig
): Promise<T | ToolResponse> {
  try {
    return await fn();
  } catch (error) {
    return errorToToolResponse(handleGenericError(error, requestId, config));
  }
}

/**
 * Convert error response to MCP tool response format
 */
export function errorToToolResponse(error: MCPErrorResponse): ToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(error, null, 2),
      },
    ],
    isError: true,
  };
}
