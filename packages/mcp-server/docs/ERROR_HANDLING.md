# Error Handling Framework

## Overview

The Phase Mirror MCP server includes a comprehensive error handling framework that provides:

- **Structured Error Classes**: Hierarchical error types with consistent codes and severities
- **Error Handler Middleware**: Automatic error catching and conversion
- **Recovery Utilities**: Retry logic, circuit breakers, and graceful degradation
- **MCP Integration**: Seamless conversion to MCP tool response format

## Error Classes

### Base Error: MCPError

All errors extend from `MCPError` which provides:

```typescript
import { MCPError, ErrorCode, ErrorSeverity } from "./errors/index.js";

const error = new MCPError(
  ErrorCode.EXECUTION_FAILED,
  "Operation failed",
  {
    severity: ErrorSeverity.HIGH,
    details: { reason: "timeout" },
    suggestions: ["Retry the operation", "Check service status"],
    retryable: true,
    cause: originalError,
  }
);

// Convert to MCP response format
const response = error.toResponse("request-id-123", includeStack);
```

### Error Codes

```typescript
enum ErrorCode {
  // Validation (400-level)
  INVALID_INPUT = "INVALID_INPUT",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  
  // Authorization (401-403)
  UNAUTHORIZED = "UNAUTHORIZED",
  UNAUTHORIZED_ORG = "UNAUTHORIZED_ORG",
  FORBIDDEN = "FORBIDDEN",
  
  // Resource (404)
  NOT_FOUND = "NOT_FOUND",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  
  // Rate Limiting (429)
  RATE_LIMITED = "RATE_LIMITED",
  TOO_MANY_REQUESTS = "TOO_MANY_REQUESTS",
  
  // Execution (500-level)
  INTERNAL_ERROR = "INTERNAL_ERROR",
  EXECUTION_FAILED = "EXECUTION_FAILED",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  DYNAMODB_ERROR = "DYNAMODB_ERROR",
  TIMEOUT = "TIMEOUT",
}
```

### Error Severities

```typescript
enum ErrorSeverity {
  LOW = "low",        // Minor issues, user-correctable
  MEDIUM = "medium",  // Significant issues, may need attention
  HIGH = "high",      // Serious issues, requires immediate attention
  CRITICAL = "critical", // System-level failures
}
```

### Specific Error Classes

#### InputValidationError

For Zod schema validation failures:

```typescript
import { InputValidationError } from "./errors/index.js";

const error = new InputValidationError(
  "Invalid parameters",
  { validationErrors: [...] },
  ["Check parameter types", "See schema documentation"]
);
```

#### FileNotFoundError

For missing files:

```typescript
import { FileNotFoundError } from "./errors/index.js";

const error = new FileNotFoundError("/path/to/file.txt");
```

#### ExternalServiceError

For AWS/external service failures:

```typescript
import { ExternalServiceError } from "./errors/index.js";

const error = new ExternalServiceError(
  "DynamoDB",
  "putItem",
  originalError
);
```

#### RateLimitError

For rate limiting:

```typescript
import { RateLimitError } from "./errors/index.js";

const error = new RateLimitError("API Service", 5000); // retry after 5s
```

#### TimeoutError

For operation timeouts:

```typescript
import { TimeoutError } from "./errors/index.js";

const error = new TimeoutError("database query", 30000);
```

#### UnauthorizedError

For authorization failures:

```typescript
import { UnauthorizedError } from "./errors/index.js";

const error = new UnauthorizedError("S3 bucket", "read");
```

## Error Handler Middleware

### handleZodError

Converts Zod validation errors to MCP error responses:

```typescript
import { z } from "zod";
import { handleZodError } from "./errors/handler.js";

const schema = z.object({ name: z.string() });

try {
  schema.parse({ name: 123 });
} catch (error) {
  if (error instanceof z.ZodError) {
    const response = handleZodError(error, "request-id");
    // Returns MCPErrorResponse with validation details
  }
}
```

### handleFileError

Handles file system errors:

```typescript
import { handleFileError } from "./errors/handler.js";

try {
  await fs.readFile("/path/to/file");
} catch (error) {
  const response = handleFileError(
    error as NodeJS.ErrnoException,
    "/path/to/file",
    "request-id"
  );
  // Handles ENOENT, EACCES, and other file errors
}
```

### handleAWSError

Handles AWS SDK errors:

```typescript
import { handleAWSError } from "./errors/handler.js";

try {
  await dynamodb.putItem(params);
} catch (error) {
  const response = handleAWSError(
    error,
    "DynamoDB",
    "putItem",
    "request-id"
  );
  // Handles throttling, access denied, etc.
}
```

### handleGenericError

Catches all error types:

```typescript
import { handleGenericError } from "./errors/handler.js";

try {
  await someOperation();
} catch (error) {
  const response = handleGenericError(error, "request-id", {
    includeStacks: true,
    logErrors: true,
    reportErrors: false,
  });
}
```

### withErrorHandling

Wrap tool execution with automatic error handling:

```typescript
import { withErrorHandling } from "./errors/handler.js";

export async function execute(args: any, context: ToolContext) {
  return withErrorHandling(async () => {
    // Tool implementation
    return {
      content: [{ type: "text", text: "Success" }],
    };
  }, context.requestId);
}
```

### errorToToolResponse

Convert error response to MCP tool response:

```typescript
import { errorToToolResponse } from "./errors/handler.js";

const errorResponse = error.toResponse("request-id");
const toolResponse = errorToToolResponse(errorResponse);
// Returns { content: [...], isError: true }
```

## Recovery Utilities

### Retry with Exponential Backoff

```typescript
import { retryWithBackoff } from "./errors/recovery.js";

const result = await retryWithBackoff(
  async () => {
    return await unstableOperation();
  },
  {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ["RATE_LIMITED", "EXTERNAL_SERVICE_ERROR"],
  }
);
```

**Features**:
- Exponential backoff: delays increase exponentially
- Configurable retry conditions
- Max delay cap
- Only retries specific error codes

### Circuit Breaker

Prevents cascading failures:

```typescript
import { CircuitBreaker } from "./errors/recovery.js";

const breaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  recoveryTimeMs: 30000,    // Try recovery after 30s
  halfOpenAttempts: 1,      // Reset after 1 success
});

const result = await breaker.execute(async () => {
  return await unreliableService();
});

console.log(breaker.getState()); // "closed" | "open" | "half-open"
```

**States**:
- **Closed**: Normal operation, counting failures
- **Open**: Failing fast, not calling service
- **Half-Open**: Testing recovery, limited attempts

### Graceful Degradation

Fallback to degraded mode:

```typescript
import { withGracefulDegradation } from "./errors/recovery.js";

const result = await withGracefulDegradation(
  async () => {
    // Primary: Full-featured, may be slow/fail
    return await primaryService();
  },
  async () => {
    // Fallback: Degraded but reliable
    return await fallbackService();
  },
  {
    timeout: 10000,  // Primary timeout
    logErrors: true,
  }
);
```

### Timeout Wrapper

Add timeout to any operation:

```typescript
import { withTimeout } from "./errors/recovery.js";

const result = await withTimeout(
  async () => {
    return await longRunningOperation();
  },
  30000,  // 30 second timeout
  "Long operation"  // Name for error message
);
```

### Batch Retry

Retry multiple operations in parallel:

```typescript
import { retryBatch } from "./errors/recovery.js";

const operations = [
  async () => await op1(),
  async () => await op2(),
  async () => await op3(),
];

const results = await retryBatch(operations, {
  maxAttempts: 3,
  initialDelayMs: 100,
});

// Results: Array<T | Error>
// Successful results or Error instances
```

## Integration Examples

### Tool with Complete Error Handling

```typescript
import { z } from "zod";
import { withErrorHandling } from "./errors/handler.js";
import { retryWithBackoff } from "./errors/recovery.js";
import type { ToolContext, ToolResponse } from "./types/index.js";

const InputSchema = z.object({
  resourceId: z.string(),
  action: z.enum(["read", "write"]),
});

export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  return withErrorHandling(async () => {
    // Input validation (automatic Zod error handling)
    const input = InputSchema.parse(args);

    // Retry with backoff for external service calls
    const data = await retryWithBackoff(
      async () => await externalService.get(input.resourceId),
      {
        maxAttempts: 3,
        retryableErrors: ["RATE_LIMITED", "EXTERNAL_SERVICE_ERROR"],
      }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, data }),
        },
      ],
    };
  }, context.requestId);
}
```

### Tool with Circuit Breaker

```typescript
import { CircuitBreaker } from "./errors/recovery.js";
import { withErrorHandling } from "./errors/handler.js";

// Shared circuit breaker instance
const dbBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeMs: 30000,
});

export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  return withErrorHandling(async () => {
    const input = InputSchema.parse(args);

    // Protected by circuit breaker
    const result = await dbBreaker.execute(async () => {
      return await database.query(input.query);
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, result }),
        },
      ],
    };
  }, context.requestId);
}
```

### Tool with Graceful Degradation

```typescript
import { withGracefulDegradation } from "./errors/recovery.js";
import { withErrorHandling } from "./errors/handler.js";

export async function execute(
  args: unknown,
  context: ToolContext
): Promise<ToolResponse> {
  return withErrorHandling(async () => {
    const input = InputSchema.parse(args);

    // Try full analysis, fall back to simple check
    const result = await withGracefulDegradation(
      async () => {
        // Full AI-powered analysis (may be slow/fail)
        return await aiService.deepAnalysis(input.files);
      },
      async () => {
        // Simple rule-based check (fast, reliable)
        return await ruleEngine.basicCheck(input.files);
      },
      { timeout: 10000 }
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            result,
            degraded: result.mode === "fallback",
          }),
        },
      ],
    };
  }, context.requestId);
}
```

## Error Response Format

All errors are converted to a consistent MCP response format:

```typescript
interface MCPErrorResponse {
  success: false;
  error: string;           // Error message
  code: ErrorCode;         // Error code enum
  message: string;         // Detailed message
  severity: ErrorSeverity; // Severity level
  timestamp: string;       // ISO timestamp
  requestId?: string;      // Request tracking ID
  details?: Record<string, unknown>; // Additional context
  suggestions?: string[];  // Remediation suggestions
  retryable?: boolean;     // Whether retry is recommended
  stack?: string;          // Stack trace (dev only)
}
```

## Best Practices

### 1. Use Specific Error Classes

```typescript
// Good
throw new FileNotFoundError(filePath);

// Avoid
throw new MCPError(ErrorCode.NOT_FOUND, `File not found: ${filePath}`);
```

### 2. Include Helpful Suggestions

```typescript
new InputValidationError("Invalid email", details, [
  "Check email format (example@domain.com)",
  "Ensure @ symbol is present",
  "Use lowercase characters",
]);
```

### 3. Mark Retryable Errors

```typescript
new MCPError(ErrorCode.EXTERNAL_SERVICE_ERROR, message, {
  retryable: true,  // Client can retry
  suggestions: ["Wait 1 second and retry"],
});
```

### 4. Use Circuit Breakers for Unstable Services

```typescript
// Protect database calls
const dbBreaker = new CircuitBreaker();

// Protect API calls
const apiBreaker = new CircuitBreaker();
```

### 5. Combine Recovery Strategies

```typescript
// Retry + Circuit Breaker
const result = await breaker.execute(() =>
  retryWithBackoff(() => unstableOperation())
);

// Timeout + Graceful Degradation
const result = await withTimeout(
  () => withGracefulDegradation(primary, fallback),
  30000
);
```

## Testing

The error handling framework includes comprehensive tests:

- **error-classes.test.ts**: Tests all error class types
- **error-handler.test.ts**: Tests error handlers and middleware
- **error-recovery.test.ts**: Tests retry, circuit breaker, and degradation

Run tests:

```bash
pnpm test test/errors/
```

## Configuration

### Error Handler Config

```typescript
interface ErrorHandlerConfig {
  includeStacks: boolean;  // Include stack traces
  logErrors: boolean;      // Log to console
  reportErrors: boolean;   // Report to monitoring
}
```

### Retry Config

```typescript
interface RetryConfig {
  maxAttempts: number;        // Max retry attempts
  initialDelayMs: number;     // Initial delay
  maxDelayMs: number;         // Max delay cap
  backoffMultiplier: number;  // Backoff multiplier
  retryableErrors: string[];  // Error codes to retry
}
```

### Circuit Breaker Config

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;   // Failures before opening
  recoveryTimeMs: number;     // Recovery wait time
  halfOpenAttempts: number;   // Attempts in half-open
}
```

## References

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Error Handling Best Practices](https://nodejs.org/en/docs/guides/error-handling/)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff](https://en.wikipedia.org/wiki/Exponential_backoff)
