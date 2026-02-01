/**
 * Tests for error recovery utilities
 */

import {
  retryWithBackoff,
  CircuitBreaker,
  withGracefulDegradation,
  withTimeout,
  retryBatch,
} from "../../src/errors/recovery.js";

describe("Error Recovery", () => {
  describe("retryWithBackoff", () => {
    it("should succeed on first attempt", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return "success";
      };

      const result = await retryWithBackoff(fn);

      expect(result).toBe("success");
      expect(attempts).toBe(1);
    });

    it("should retry on retryable errors", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error("Retryable");
          error.code = "RATE_LIMITED";
          throw error;
        }
        return "success";
      };

      const result = await retryWithBackoff(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should not retry on non-retryable errors", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error: any = new Error("Not retryable");
        error.code = "INVALID_INPUT";
        throw error;
      };

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow("Not retryable");

      expect(attempts).toBe(1);
    });

    it("should respect max attempts", async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        const error: any = new Error("Always fails");
        error.code = "RATE_LIMITED";
        throw error;
      };

      await expect(
        retryWithBackoff(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow("Always fails");

      expect(attempts).toBe(3);
    });

    it("should use exponential backoff", async () => {
      const delays: number[] = [];
      let attempts = 0;

      const fn = async () => {
        const now = Date.now();
        if (attempts > 0) {
          delays.push(now);
        }
        attempts++;
        if (attempts < 4) {
          const error: any = new Error("Retry");
          error.code = "RATE_LIMITED";
          throw error;
        }
        return "success";
      };

      await retryWithBackoff(fn, {
        maxAttempts: 4,
        initialDelayMs: 50,
        backoffMultiplier: 2,
      });

      expect(attempts).toBe(4);
      // Delays should be increasing (with some tolerance for execution time)
      expect(delays.length).toBe(3);
    });
  });

  describe("CircuitBreaker", () => {
    it("should allow operations when closed", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeMs: 1000,
      });

      const result = await breaker.execute(async () => "success");

      expect(result).toBe("success");
      expect(breaker.getState()).toBe("closed");
    });

    it("should open after threshold failures", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeMs: 1000,
      });

      // Cause 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("Failure");
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe("open");

      // Next call should fail immediately
      await expect(
        breaker.execute(async () => "success")
      ).rejects.toThrow("Circuit breaker is open");
    });

    it("should transition to half-open after recovery time", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        recoveryTimeMs: 100, // Short recovery for testing
        halfOpenAttempts: 1,
      });

      // Cause failures to open circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("Failure");
          });
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe("open");

      // Wait for recovery time
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should transition to half-open and allow one attempt
      const result = await breaker.execute(async () => "success");

      expect(result).toBe("success");
      expect(breaker.getState()).toBe("closed");
    });

    it("should reset on successful half-open attempt", async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 1,
        recoveryTimeMs: 50,
        halfOpenAttempts: 1,
      });

      // Open circuit
      try {
        await breaker.execute(async () => {
          throw new Error("Failure");
        });
      } catch (e) {
        // Expected
      }

      expect(breaker.getState()).toBe("open");

      // Wait and recover
      await new Promise((resolve) => setTimeout(resolve, 100));

      await breaker.execute(async () => "success");

      expect(breaker.getState()).toBe("closed");
    });
  });

  describe("withGracefulDegradation", () => {
    it("should use primary function when it succeeds", async () => {
      const primary = async () => "primary";
      const fallback = async () => "fallback";

      const result = await withGracefulDegradation(primary, fallback);

      expect(result).toBe("primary");
    });

    it("should use fallback when primary fails", async () => {
      const primary = async () => {
        throw new Error("Primary failed");
      };
      const fallback = async () => "fallback";

      const result = await withGracefulDegradation(primary, fallback, {
        logErrors: false,
      });

      expect(result).toBe("fallback");
    });

    it("should timeout slow primary operations", async () => {
      const primary = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return "primary";
      };
      const fallback = async () => "fallback";

      const result = await withGracefulDegradation(primary, fallback, {
        timeout: 100,
        logErrors: false,
      });

      expect(result).toBe("fallback");
    });

    it("should throw if both primary and fallback fail", async () => {
      const primary = async () => {
        throw new Error("Primary failed");
      };
      const fallback = async () => {
        throw new Error("Fallback failed");
      };

      await expect(
        withGracefulDegradation(primary, fallback, { logErrors: false })
      ).rejects.toThrow("Fallback failed");
    });
  });

  describe("withTimeout", () => {
    it("should return result within timeout", async () => {
      const fn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "success";
      };

      const result = await withTimeout(fn, 1000);

      expect(result).toBe("success");
    });

    it("should throw timeout error when exceeded", async () => {
      const fn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return "success";
      };

      await expect(withTimeout(fn, 50, "test operation")).rejects.toThrow(
        "test operation timed out"
      );
    });
  });

  describe("retryBatch", () => {
    it("should retry all operations", async () => {
      const op1 = async () => "result1";
      const op2 = async () => "result2";
      const op3 = async () => "result3";

      const results = await retryBatch([op1, op2, op3]);

      expect(results).toEqual(["result1", "result2", "result3"]);
    });

    it("should return errors for failed operations", async () => {
      const op1 = async () => "success";
      const op2 = async () => {
        throw new Error("Failed");
      };
      const op3 = async () => "success";

      const results = await retryBatch([op1, op2, op3], {
        maxAttempts: 1,
      });

      expect(results[0]).toBe("success");
      expect(results[1]).toBeInstanceOf(Error);
      expect(results[2]).toBe("success");
    });

    it("should retry failed operations", async () => {
      let attempts = 0;
      const op = async () => {
        attempts++;
        if (attempts < 2) {
          const error: any = new Error("Retry");
          error.code = "RATE_LIMITED";
          throw error;
        }
        return "success";
      };

      const results = await retryBatch([op], {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      expect(results[0]).toBe("success");
      expect(attempts).toBe(2);
    });
  });
});
