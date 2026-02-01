/**
 * Rule registry and orchestration
 */
import { RuleViolation, OracleInput } from '../../schemas/types.js';
import { checkMD001 } from './md-001.js';
import { checkMD002 } from './md-002.js';
import { checkMD003 } from './md-003.js';
import { checkMD004 } from './md-004.js';
import { checkMD005 } from './md-005.js';

export type RuleChecker = (input: OracleInput) => Promise<RuleViolation[]>;

export const RULES: Record<string, RuleChecker> = {
  'MD-001': checkMD001,
  'MD-002': checkMD002,
  'MD-003': checkMD003,
  'MD-004': checkMD004,
  'MD-005': checkMD005,
};

export async function evaluateAllRules(input: OracleInput): Promise<RuleViolation[]> {
  const allViolations: RuleViolation[] = [];

  for (const [ruleId, checker] of Object.entries(RULES)) {
    try {
      const violations = await checker(input);
      allViolations.push(...violations);
    } catch (error: any) {
      // Enhanced error context for troubleshooting
      const errorType = error.name || 'UnknownError';
      const errorMessage = error.message || String(error);
      
      console.error(
        `Error evaluating rule ${ruleId}:`,
        `\n  Error Type: ${errorType}`,
        `\n  Message: ${errorMessage}`,
        `\n  Mode: ${input.mode}`,
        `\n  Repository: ${input.context?.repositoryName || 'unknown'}`,
        error.stack ? `\n  Stack: ${error.stack}` : ''
      );
      
      // Add a violation for rule evaluation failure with rich context
      allViolations.push({
        ruleId,
        severity: 'high',
        message: `Rule evaluation failed: ${errorMessage}`,
        context: {
          errorType,
          errorMessage,
          mode: input.mode,
          repository: input.context?.repositoryName || 'unknown',
          hasStackTrace: !!error.stack,
        },
      });
    }
  }

  return allViolations;
}
