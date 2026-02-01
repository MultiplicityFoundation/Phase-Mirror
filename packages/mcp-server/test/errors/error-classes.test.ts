/**
 * Tests for error classes
 */

import {
  MCPError,
  ErrorCode,
  ErrorSeverity,
  InputValidationError,
  FileNotFoundError,
  ExternalServiceError,
  RateLimitError,
  TimeoutError,
  UnauthorizedError,
} from "../../src/errors/index.js";

describe("Error Classes", () => {
  describe("MCPError", () => {
    it("should create basic error with code and message", () => {
      const error = new MCPError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong"
      );

      expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(error.message).toBe("Something went wrong");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(false);
    });

    it("should create error with all options", () => {
      const causeError = new Error("Underlying cause");
      const error = new MCPError(ErrorCode.EXECUTION_FAILED, "Test error", {
        severity: ErrorSeverity.HIGH,
        details: { key: "value" },
        suggestions: ["Try again", "Check logs"],
        retryable: true,
        cause: causeError,
      });

      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.details).toEqual({ key: "value" });
      expect(error.suggestions).toEqual(["Try again", "Check logs"]);
      expect(error.retryable).toBe(true);
      expect(error.cause).toBe(causeError);
    });

    it("should convert to response format", () => {
      const error = new MCPError(ErrorCode.NOT_FOUND, "Resource not found", {
        severity: ErrorSeverity.LOW,
        details: { resourceId: "123" },
        suggestions: ["Check the ID"],
      });

      const response = error.toResponse("req-123");

      expect(response.success).toBe(false);
      expect(response.error).toBe("Resource not found");
      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.severity).toBe(ErrorSeverity.LOW);
      expect(response.requestId).toBe("req-123");
      expect(response.details).toEqual({ resourceId: "123" });
      expect(response.suggestions).toEqual(["Check the ID"]);
      expect(response.timestamp).toBeDefined();
    });

    it("should include stack trace when requested", () => {
      const error = new MCPError(ErrorCode.INTERNAL_ERROR, "Test error");
      const response = error.toResponse("req-123", true);

      expect(response.stack).toBeDefined();
      expect(typeof response.stack).toBe("string");
    });

    it("should not include stack trace by default", () => {
      const error = new MCPError(ErrorCode.INTERNAL_ERROR, "Test error");
      const response = error.toResponse("req-123");

      expect(response.stack).toBeUndefined();
    });
  });

  describe("InputValidationError", () => {
    it("should create validation error with defaults", () => {
      const error = new InputValidationError("Invalid parameters");

      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.retryable).toBe(false);
      expect(error.suggestions).toBeDefined();
    });

    it("should include validation details", () => {
      const error = new InputValidationError(
        "Invalid input",
        { fields: ["name", "email"] },
        ["Fix name field", "Fix email field"]
      );

      expect(error.details).toEqual({ fields: ["name", "email"] });
      expect(error.suggestions).toEqual(["Fix name field", "Fix email field"]);
    });
  });

  describe("FileNotFoundError", () => {
    it("should create file not found error", () => {
      const error = new FileNotFoundError("/path/to/file.txt");

      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(error.message).toContain("/path/to/file.txt");
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.details).toEqual({ filePath: "/path/to/file.txt" });
      expect(error.suggestions).toBeDefined();
    });
  });

  describe("ExternalServiceError", () => {
    it("should create external service error", () => {
      const causeError = new Error("Connection timeout");
      const error = new ExternalServiceError("DynamoDB", "putItem", causeError);

      expect(error.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(error.message).toContain("DynamoDB");
      expect(error.message).toContain("putItem");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(true);
      expect(error.details).toEqual({
        service: "DynamoDB",
        operation: "putItem",
        originalError: "Connection timeout",
      });
    });
  });

  describe("RateLimitError", () => {
    it("should create rate limit error without retry time", () => {
      const error = new RateLimitError("API Service");

      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.message).toContain("API Service");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(true);
    });

    it("should create rate limit error with retry time", () => {
      const error = new RateLimitError("API Service", 5000);

      expect(error.details).toEqual({
        service: "API Service",
        retryAfterMs: 5000,
      });
      expect(error.suggestions?.some((s) => s.includes("5000ms"))).toBe(true);
    });
  });

  describe("TimeoutError", () => {
    it("should create timeout error", () => {
      const error = new TimeoutError("database query", 30000);

      expect(error.code).toBe(ErrorCode.TIMEOUT);
      expect(error.message).toContain("database query");
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(true);
      expect(error.details).toEqual({
        operation: "database query",
        timeoutMs: 30000,
      });
    });
  });

  describe("UnauthorizedError", () => {
    it("should create unauthorized error", () => {
      const error = new UnauthorizedError("S3 bucket", "read");

      expect(error.code).toBe(ErrorCode.UNAUTHORIZED_ORG);
      expect(error.message).toContain("S3 bucket");
      expect(error.message).toContain("read");
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(false);
      expect(error.details).toEqual({
        resource: "S3 bucket",
        action: "read",
      });
    });
  });
});
