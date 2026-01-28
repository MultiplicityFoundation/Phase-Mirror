/**
 * Decision logic for Mirror Dissonance Protocol
 */
import { RuleViolation, MachineDecision } from '../../schemas/types';
import { getThresholds, shouldBlock, Thresholds } from './thresholds';

export interface DecisionContext {
  violations: RuleViolation[];
  mode: string;
  strict: boolean;
  dryRun: boolean;
  circuitBreakerTripped?: boolean;
}

export function makeDecision(context: DecisionContext): MachineDecision {
  const thresholds = getThresholds(context.strict);
  
  // Count violations by severity
  const counts = {
    critical: context.violations.filter(v => v.severity === 'critical').length,
    high: context.violations.filter(v => v.severity === 'high').length,
    medium: context.violations.filter(v => v.severity === 'medium').length,
    low: context.violations.filter(v => v.severity === 'low').length,
  };

  const reasons: string[] = [];
  let outcome: 'allow' | 'block' | 'warn' = 'allow';

  // Check circuit breaker
  if (context.circuitBreakerTripped) {
    reasons.push('Circuit breaker tripped - too many blocks in current hour');
    outcome = 'warn';
  }

  // Evaluate violations
  if (shouldBlock(counts.critical, counts.high, counts.medium, thresholds)) {
    reasons.push(`Critical violations: ${counts.critical}, High: ${counts.high}, Medium: ${counts.medium}`);
    outcome = 'block';
  }

  // Apply dry-run override
  if (context.dryRun && outcome === 'block') {
    reasons.push('Dry-run mode: would block but allowing with warning');
    outcome = 'warn';
  }

  // Determine final reasons
  if (outcome === 'allow' && context.violations.length === 0) {
    reasons.push('No violations detected');
  } else if (outcome === 'allow' && context.violations.length > 0) {
    reasons.push(`Minor violations within thresholds: Low: ${counts.low}`);
  }

  // Add rule IDs to reasons
  const ruleIds = [...new Set(context.violations.map(v => v.ruleId))];

  return {
    outcome,
    reasons,
    metadata: {
      timestamp: new Date().toISOString(),
      mode: context.mode,
      rulesEvaluated: ruleIds,
    },
  };
}
