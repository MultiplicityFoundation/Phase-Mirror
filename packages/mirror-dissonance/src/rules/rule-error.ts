/**
 * Structured error for rule evaluation failures.
 * Carries enough context to generate a synthetic violation
 * that the Oracle can include in the report.
 */

import { RuleViolation } from '../../schemas/types.js';

export class RuleEvaluationError extends Error {
  public readonly ruleId: string;
  public readonly ruleVersion: string;
  public readonly phase: "init" | "evaluate" | "evidence" | "post";
  public readonly cause: unknown;

  constructor(opts: {
    ruleId: string;
    ruleVersion?: string;
    phase: "init" | "evaluate" | "evidence" | "post";
    message: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = "RuleEvaluationError";
    this.ruleId = opts.ruleId;
    this.ruleVersion = opts.ruleVersion || "unknown";
    this.phase = opts.phase;
    this.cause = opts.cause;
  }

  /**
   * Convert to a synthetic violation that makeDecision can process.
   * Severity is always "critical" — if a rule can't run, the Oracle
   * must not pretend it passed.
   */
  toViolation(): RuleViolation {
    return {
      ruleId: this.ruleId,
      severity: "critical" as const,
      message: `Rule ${this.ruleId} failed during ${this.phase}: ${this.message}`,
      context: {
        ruleVersion: this.ruleVersion,
        phase: this.phase,
        errorType: this.cause instanceof Error ? this.cause.name : 'UnknownError',
        originalMessage: this.message,
        isEvaluationError: true, // Flag to identify error-originated violations
      },
    };
  }
}

/**
 * Result structure for evaluateAllRules
 */
export interface EvaluationResult {
  violations: RuleViolation[];
  errors: RuleEvaluationError[];
  rulesEvaluated: number;
  rulesErrored: number;
}
