/**
 * Error recovery utilities for Phase Mirror MCP Server
 * Provides retry, circuit breaker, and graceful degradation
 */

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

const defaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: [
    "RATE_LIMITED",
    "TOO_MANY_REQUESTS",
    "EXTERNAL_SERVICE_ERROR",
    "DYNAMODB_ERROR",
  ],
};

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const fullConfig = { ...defaultRetryConfig, ...config };
  let lastError: Error | undefined;
  let delay = fullConfig.initialDelayMs;

  for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const errorCode = (error as any)?.code;
      const isRetryable = fullConfig.retryableErrors.includes(errorCode);

      if (!isRetryable || attempt === fullConfig.maxAttempts) {
        throw error;
      }

      console.warn(
        `Attempt ${attempt} failed (${errorCode}), retrying in ${delay}ms...`
      );

      await sleep(delay);
      delay = Math.min(delay * fullConfig.backoffMultiplier, fullConfig.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Circuit breaker state
 */
interface CircuitBreakerState {
  failures: number;
  lastFailure: Date | null;
  state: "closed" | "open" | "half-open";
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeMs: number;
  halfOpenAttempts: number;
}

const defaultCircuitConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeMs: 30000, // 30 seconds
  halfOpenAttempts: 1,
};

/**
 * Simple circuit breaker
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    lastFailure: null,
    state: "closed",
  };

  private config: CircuitBreakerConfig;
  private halfOpenAttempts = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...defaultCircuitConfig, ...config };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit should recover
    if (this.state.state === "open") {
      const timeSinceFailure = this.state.lastFailure
        ? Date.now() - this.state.lastFailure.getTime()
        : 0;

      if (timeSinceFailure >= this.config.recoveryTimeMs) {
        this.state.state = "half-open";
        this.halfOpenAttempts = 0;
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    try {
      const result = await fn();

      // Success - reset state
      if (this.state.state === "half-open") {
        this.halfOpenAttempts++;
        if (this.halfOpenAttempts >= this.config.halfOpenAttempts) {
          this.reset();
        }
      } else {
        this.state.failures = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.state.failures++;
    this.state.lastFailure = new Date();

    if (this.state.failures >= this.config.failureThreshold) {
      this.state.state = "open";
      console.warn(
        `Circuit breaker opened after ${this.state.failures} failures`
      );
    }
  }

  private reset(): void {
    this.state = {
      failures: 0,
      lastFailure: null,
      state: "closed",
    };
    console.info("Circuit breaker reset");
  }

  getState(): "closed" | "open" | "half-open" {
    return this.state.state;
  }
}

/**
 * Graceful degradation wrapper
 */
export async function withGracefulDegradation<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
  options: {
    timeout?: number;
    logErrors?: boolean;
  } = {}
): Promise<T> {
  const { timeout = 10000, logErrors = true } = options;

  try {
    // Try primary function with timeout
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Operation timeout")), timeout)
    );

    return await Promise.race([primaryFn(), timeoutPromise]);
  } catch (error) {
    if (logErrors) {
      console.warn("Primary function failed, falling back to degraded mode:", error);
    }

    try {
      return await fallbackFn();
    } catch (fallbackError) {
      if (logErrors) {
        console.error("Fallback also failed:", fallbackError);
      }
      throw fallbackError;
    }
  }
}

/**
 * Timeout wrapper
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operationName = "Operation"
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Batch retry wrapper for multiple operations
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  config: Partial<RetryConfig> = {}
): Promise<Array<T | Error>> {
  return Promise.all(
    operations.map((op) =>
      retryWithBackoff(op, config).catch((error) => error as Error)
    )
  );
}
