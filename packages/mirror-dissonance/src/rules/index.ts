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
    } catch (error: unknown) {
      // Enhanced error context for troubleshooting
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      console.error(
        `Error evaluating rule ${ruleId}:`,
        `\n  Error Type: ${errorType}`,
        `\n  Message: ${errorMessage}`,
        `\n  Mode: ${input.mode}`,
        `\n  Repository: ${input.context?.repositoryName || 'unknown'}`,
        errorStack ? `\n  Stack: ${errorStack}` : ''
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
          hasStackTrace: !!errorStack,
        },
      });
    }
  }

  return allViolations;
}
