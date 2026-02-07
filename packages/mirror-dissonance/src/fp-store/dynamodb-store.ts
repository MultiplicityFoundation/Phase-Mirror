/**
 * FP Store Error class
 *
 * @deprecated The DynamoDBFPStore class that lived here has moved to
 *   `src/adapters/aws/fp-store.ts`.  Use the adapter factory instead:
 *
 *     import { createAdapters } from '../adapters/index.js';
 *
 * Only FPStoreError (cloud-agnostic) remains in this module.
 */

/**
 * Custom error class for FP store failures.
 * Carries structured context so the Oracle can decide
 * whether to degrade gracefully or halt.
 */
export class FPStoreError extends Error {
  public readonly ruleId?: string;
  public readonly eventId?: string;
  public readonly findingId?: string;
  public readonly operation: string;
  public readonly cause: unknown;

  constructor(opts: {
    message: string;
    operation: string;
    ruleId?: string;
    eventId?: string;
    findingId?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "FPStoreError";
    this.operation = opts.operation;
    this.ruleId = opts.ruleId;
    this.eventId = opts.eventId;
    this.findingId = opts.findingId;
    this.cause = opts.cause;
  }
}
