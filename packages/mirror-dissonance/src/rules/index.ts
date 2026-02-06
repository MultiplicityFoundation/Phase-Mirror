/**
 * Rule registry and orchestration
 */
import { RuleViolation, OracleInput } from '../../schemas/types.js';
import { checkMD001 } from './md-001.js';
import { checkMD002 } from './md-002.js';
import { checkMD003 } from './md-003.js';
import { checkMD004 } from './md-004.js';
import { checkMD005 } from './md-005.js';
import { RuleEvaluationError, EvaluationResult } from './rule-error.js';

export type RuleChecker = (input: OracleInput) => Promise<RuleViolation[]>;

export const RULES: Record<string, RuleChecker> = {
  'MD-001': checkMD001,
  'MD-002': checkMD002,
  'MD-003': checkMD003,
  'MD-004': checkMD004,
  'MD-005': checkMD005,
};

/**
 * Evaluate all rules against the input.
 *
 * BEFORE: errors were caught and logged, created 'high' severity violations.
 *         A throwing rule produced an implicit violation, but not blocking.
 *
 * AFTER:  errors produce structured RuleEvaluationError instances,
 *         converted to 'critical' severity violations. A throwing rule
 *         produces a BLOCK, not just a warning.
 */
export async function evaluateAllRules(input: OracleInput): Promise<EvaluationResult> {
  const violations: RuleViolation[] = [];
  const errors: RuleEvaluationError[] = [];
  let rulesEvaluated = 0;
  let rulesErrored = 0;

  for (const [ruleId, checker] of Object.entries(RULES)) {
    try {
      const ruleViolations = await checker(input);
      violations.push(...ruleViolations);
      rulesEvaluated++;
    } catch (error: unknown) {
      rulesErrored++;

      // Wrap raw errors in structured type
      const ruleError =
        error instanceof RuleEvaluationError
          ? error
          : new RuleEvaluationError({
              ruleId,
              ruleVersion: 'unknown', // Could be extracted from rule metadata
              phase: 'evaluate',
              message:
                error instanceof Error
                  ? error.message
                  : String(error),
              cause: error,
            });

      // Enhanced error context for troubleshooting
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      // Log — but this is no longer the ONLY thing we do
      console.error(
        `[rule-error] ${ruleError.ruleId}@${ruleError.ruleVersion} ` +
          `failed during ${ruleError.phase}: ${ruleError.message}`,
        `\n  Error Type: ${errorType}`,
        `\n  Mode: ${input.mode}`,
        `\n  Repository: ${input.context?.repositoryName || 'unknown'}`,
        errorStack ? `\n  Stack: ${errorStack}` : ''
      );

      // Convert to a synthetic violation — this is the critical fix.
      // The error now appears in the violations array as a critical
      // severity item, which makeDecision will see and block on.
      violations.push(ruleError.toViolation());
      errors.push(ruleError);
    }
  }

  return { violations, errors, rulesEvaluated, rulesErrored };
}
