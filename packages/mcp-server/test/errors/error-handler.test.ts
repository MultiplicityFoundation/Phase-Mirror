/**
 * Tests for error handler middleware
 */

import { z } from "zod";
import {
  handleZodError,
  handleFileError,
  handleAWSError,
  handleGenericError,
  withErrorHandling,
  errorToToolResponse,
} from "../../src/errors/handler.js";
import {
  MCPError,
  ErrorCode,
  InputValidationError,
} from "../../src/errors/index.js";

describe("Error Handler", () => {
  describe("handleZodError", () => {
    it("should convert Zod validation error to MCP error response", () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      try {
        schema.parse({ name: 123, age: "invalid" });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const response = handleZodError(error, "req-123");

          expect(response.success).toBe(false);
          expect(response.code).toBe(ErrorCode.INVALID_INPUT);
          expect(response.requestId).toBe("req-123");
          expect(response.details?.validationErrors).toBeDefined();
        }
      }
    });

    it("should include field paths in validation details", () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });

      try {
        schema.parse({ user: { email: "invalid-email" } });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const response = handleZodError(error);
          const details = response.details?.validationErrors as any[];

          expect(details).toBeDefined();
          expect(details.some((d) => d.path.includes("email"))).toBe(true);
        }
      }
    });
  });

  describe("handleFileError", () => {
    it("should handle ENOENT error", () => {
      const error: NodeJS.ErrnoException = new Error("File not found");
      error.code = "ENOENT";

      const response = handleFileError(error, "/path/to/file.txt", "req-123");

      expect(response.code).toBe(ErrorCode.FILE_NOT_FOUND);
      expect(response.details?.filePath).toBe("/path/to/file.txt");
      expect(response.requestId).toBe("req-123");
    });

    it("should handle EACCES error", () => {
      const error: NodeJS.ErrnoException = new Error("Permission denied");
      error.code = "EACCES";

      const response = handleFileError(error, "/path/to/file.txt");

      expect(response.code).toBe(ErrorCode.EXECUTION_FAILED);
      expect(response.message).toContain("Permission denied");
      expect(response.details?.errorCode).toBe("EACCES");
    });

    it("should handle generic file errors", () => {
      const error: NodeJS.ErrnoException = new Error("IO error");
      error.code = "EIO";

      const response = handleFileError(error, "/path/to/file.txt");

      expect(response.code).toBe(ErrorCode.EXECUTION_FAILED);
      expect(response.message).toContain("File operation failed");
    });
  });

  describe("handleAWSError", () => {
    it("should handle throttling errors", () => {
      const error = new Error("Rate exceeded") as any;
      error.code = "ThrottlingException";

      const response = handleAWSError(error, "DynamoDB", "putItem", "req-123");

      expect(response.code).toBe(ErrorCode.RATE_LIMITED);
      expect(response.message).toContain("rate limit");
      expect(response.retryable).toBe(true);
    });

    it("should handle access denied errors", () => {
      const error = new Error("Access denied") as any;
      error.code = "AccessDeniedException";

      const response = handleAWSError(error, "S3", "getObject");

      expect(response.code).toBe(ErrorCode.UNAUTHORIZED_ORG);
      expect(response.message).toContain("Access denied");
    });

    it("should handle generic AWS errors", () => {
      const error = new Error("Service unavailable") as any;
      error.code = "ServiceUnavailableException";

      const response = handleAWSError(error, "DynamoDB", "query");

      expect(response.code).toBe(ErrorCode.EXTERNAL_SERVICE_ERROR);
      expect(response.details?.service).toBe("DynamoDB");
      expect(response.details?.operation).toBe("query");
    });
  });

  describe("handleGenericError", () => {
    it("should handle MCPError instances", () => {
      const error = new MCPError(ErrorCode.NOT_FOUND, "Resource not found");
      const response = handleGenericError(error, "req-123");

      expect(response.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.requestId).toBe("req-123");
    });

    it("should handle Zod errors", () => {
      const schema = z.string();
      try {
        schema.parse(123);
      } catch (error) {
        const response = handleGenericError(error);
        expect(response.code).toBe(ErrorCode.INVALID_INPUT);
      }
    });

    it("should handle standard Error instances", () => {
      const error = new Error("Something went wrong");
      const response = handleGenericError(error, "req-123");

      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toBe("Something went wrong");
      expect(response.requestId).toBe("req-123");
    });

    it("should handle unknown error types", () => {
      const error = "string error";
      const response = handleGenericError(error);

      expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(response.message).toContain("unexpected");
    });

    it("should include stack traces in development", () => {
      const error = new Error("Test error");
      const response = handleGenericError(error, "req-123", {
        includeStacks: true,
        logErrors: false,
        reportErrors: false,
      });

      expect(response.stack).toBeDefined();
    });

    it("should not include stack traces by default", () => {
      const error = new Error("Test error");
      const response = handleGenericError(error, "req-123", {
        includeStacks: false,
        logErrors: false,
        reportErrors: false,
      });

      expect(response.stack).toBeUndefined();
    });
  });

  describe("withErrorHandling", () => {
    it("should return successful result", async () => {
      const fn = async () => ({
        content: [{ type: "text" as const, text: "Success" }],
      });

      const result = await withErrorHandling(fn, "req-123");

      expect(result.content[0]).toEqual({ type: "text", text: "Success" });
    });

    it("should catch and convert errors", async () => {
      const fn = async () => {
        throw new MCPError(ErrorCode.NOT_FOUND, "Not found");
      };

      const result = await withErrorHandling(fn, "req-123");

      expect(result.isError).toBe(true);
      const content = result.content[0];
      if ("text" in content) {
        const parsed = JSON.parse(content.text);
        expect(parsed.code).toBe(ErrorCode.NOT_FOUND);
      }
    });

    it("should handle async errors", async () => {
      const fn = async () => {
        await Promise.resolve();
        throw new Error("Async error");
      };

      const result = await withErrorHandling(fn);

      expect(result.isError).toBe(true);
    });
  });

  describe("errorToToolResponse", () => {
    it("should convert error response to tool response", () => {
      const errorResponse = new MCPError(
        ErrorCode.NOT_FOUND,
        "Resource not found"
      ).toResponse("req-123");

      const toolResponse = errorToToolResponse(errorResponse);

      expect(toolResponse.isError).toBe(true);
      expect(toolResponse.content).toHaveLength(1);
      expect(toolResponse.content[0].type).toBe("text");
      
      const content = toolResponse.content[0];
      if ("text" in content) {
        const parsed = JSON.parse(content.text);
        expect(parsed.code).toBe(ErrorCode.NOT_FOUND);
        expect(parsed.requestId).toBe("req-123");
      }
    });
  });
});
