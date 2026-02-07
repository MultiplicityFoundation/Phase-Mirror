/**
 * Adapter Error Classes
 *
 * Structured errors for L1 adapter failures (Phase 0+).
 *
 * Philosophy: Adapters MUST throw structured errors on failure.
 * They MUST NOT mask failures by returning null, [], or other sentinel values.
 * Callers at L0 (business logic) implement fail-closed or fail-open behavior.
 *
 * @see SPEC-COMPUTE.md for the formal error propagation contract.
 */

/**
 * Base adapter error with structured context.
 *
 * All adapter-specific errors extend this to provide a consistent shape
 * for logging, tracing, and circuit-breaker integration.
 */
export class AdapterError extends Error {
  public readonly code: string;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.context = context;
  }
}

/**
 * SecretStoreError — nonce and cryptographic material retrieval failures.
 *
 * Error codes:
 * - NONCE_NOT_FOUND:  No nonce exists in the store
 * - READ_FAILED:      I/O or network error reading from the store
 * - MALFORMED_SECRET: Secret exists but has an unexpected format
 * - ROTATION_FAILED:  Failed to write a new nonce version
 * - VERSIONS_FAILED:  Failed to list or retrieve nonce versions
 */
export class SecretStoreError extends AdapterError {
  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ) {
    super(message, code, context);
    this.name = 'SecretStoreError';
  }
}

/**
 * BlockCounterError — circuit breaker counter failures.
 *
 * Error codes:
 * - INCREMENT_FAILED:  Failed to atomically increment the counter
 * - READ_FAILED:       Failed to read the current count
 * - CIRCUIT_CHECK_FAILED: Failed to evaluate circuit breaker threshold
 *
 * Callers implement fail-open: counter infrastructure failure
 * should NOT block PRs or trip circuit breakers.
 */
export class BlockCounterError extends AdapterError {
  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {},
  ) {
    super(message, code, context);
    this.name = 'BlockCounterError';
  }
}
