/**
 * Error handling for Phase Mirror MCP Server
 * Provides structured error classes and responses
 */

/**
 * MCP error codes
 */
export enum ErrorCode {
  // Validation errors (400-level)
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  
  // Authorization errors (401-403)
  UNAUTHORIZED = "UNAUTHORIZED",
  UNAUTHORIZED_ORG = "UNAUTHORIZED_ORG",
  FORBIDDEN = "FORBIDDEN",
  
  // Resource errors (404)
  NOT_FOUND = "NOT_FOUND",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  
  // Rate limiting (429)
  RATE_LIMITED = "RATE_LIMITED",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  
  // Execution errors (500-level)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  EXECUTION_FAILED = "EXECUTION_FAILED",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  DYNAMODB_ERROR = "DYNAMODB_ERROR",
  TIMEOUT = "TIMEOUT",
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

/**
 * MCP error response structure
 */
export interface MCPErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  timestamp: string;
  requestId?: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
  retryable?: boolean;
  stack?: string;
}

/**
 * Base MCP Error class
 */
export class MCPError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly details?: Record<string, unknown>;
  public readonly suggestions?: string[];
  public readonly retryable: boolean;
  public readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      severity?: ErrorSeverity;
      details?: Record<string, unknown>;
      suggestions?: string[];
      retryable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = "MCPError";
    this.code = code;
    this.severity = options.severity || ErrorSeverity.MEDIUM;
    this.details = options.details;
    this.suggestions = options.suggestions;
    this.retryable = options.retryable || false;
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to MCP error response format
   */
  toResponse(requestId?: string, includeStack = false): MCPErrorResponse {
    const response: MCPErrorResponse = {
      success: false,
      error: this.message,
      code: this.code,
      message: this.message,
      severity: this.severity,
      timestamp: new Date().toISOString(),
      requestId,
      details: this.details,
      suggestions: this.suggestions,
      retryable: this.retryable,
    };

    if (includeStack && this.stack) {
      response.stack = this.stack;
    }

    return response;
  }
}

/**
 * Input validation error
 */
export class InputValidationError extends MCPError {
  constructor(
    message: string,
    details?: Record<string, unknown>,
    suggestions?: string[]
  ) {
    super(ErrorCode.INVALID_INPUT, message, {
      severity: ErrorSeverity.LOW,
      details,
      suggestions: suggestions || [
        "Check input parameters against tool schema",
        "Ensure all required fields are provided",
      ],
      retryable: false,
    });
    this.name = "InputValidationError";
  }
}

/**
 * File not found error
 */
export class FileNotFoundError extends MCPError {
  constructor(filePath: string) {
    super(ErrorCode.FILE_NOT_FOUND, `File not found: ${filePath}`, {
      severity: ErrorSeverity.LOW,
      details: { filePath },
      suggestions: [
        "Verify the file path is correct",
        "Ensure the file exists",
        "Check file permissions",
      ],
      retryable: false,
    });
    this.name = "FileNotFoundError";
  }
}

/**
 * External service error
 */
export class ExternalServiceError extends MCPError {
  constructor(service: string, operation: string, cause?: Error) {
    super(
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      `${service} error during ${operation}`,
      {
        severity: ErrorSeverity.HIGH,
        details: {
          service,
          operation,
          originalError: cause?.message,
        },
        suggestions: [
          "Check service availability",
          "Verify service configuration",
          "Retry the operation",
        ],
        retryable: true,
        cause,
      }
    );
    this.name = "ExternalServiceError";
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends MCPError {
  constructor(service: string, retryAfterMs?: number) {
    super(ErrorCode.RATE_LIMITED, `Rate limit exceeded for ${service}`, {
      severity: ErrorSeverity.MEDIUM,
      details: {
        service,
        retryAfterMs,
      },
      suggestions: [
        "Wait before retrying",
        retryAfterMs ? `Retry after ${retryAfterMs}ms` : "Use exponential backoff",
        "Contact support for rate limit increase",
      ],
      retryable: true,
    });
    this.name = "RateLimitError";
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends MCPError {
  constructor(operation: string, timeoutMs: number) {
    super(ErrorCode.TIMEOUT, `Operation timed out: ${operation}`, {
      severity: ErrorSeverity.MEDIUM,
      details: {
        operation,
        timeoutMs,
      },
      suggestions: [
        "Retry the operation",
        "Increase timeout limit if appropriate",
        "Check if the operation is hung",
      ],
      retryable: true,
    });
    this.name = "TimeoutError";
  }
}

/**
 * Authorization error
 */
export class UnauthorizedError extends MCPError {
  constructor(resource: string, action: string) {
    super(
      ErrorCode.UNAUTHORIZED_ORG,
      `Unauthorized to ${action} ${resource}`,
      {
        severity: ErrorSeverity.HIGH,
        details: { resource, action },
        suggestions: [
          "Verify authentication credentials",
          "Check IAM permissions",
          "Contact administrator for access",
        ],
        retryable: false,
      }
    );
    this.name = "UnauthorizedError";
  }
}
