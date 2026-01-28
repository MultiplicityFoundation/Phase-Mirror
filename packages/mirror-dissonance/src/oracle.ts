/**
 * Oracle - Main entrypoint for Mirror Dissonance Protocol
 * 
 * The Oracle analyzes agentic domain-specific reasoning tensions and provides
 * machine decisions on whether to allow, block, or warn on changes.
 */
import { OracleInput, OracleOutput, RuleViolation } from '../schemas/types.js';
import { evaluateAllRules } from './rules/index.js';
import { makeDecision } from './policy/index.js';
import { MemoryBlockCounter } from './block-counter/index.js';
import { NoOpFPStore } from './fp-store/index.js';

export class Oracle {
  private blockCounter: MemoryBlockCounter;
  private fpStore: NoOpFPStore;

  constructor() {
    this.blockCounter = new MemoryBlockCounter(24);
    this.fpStore = new NoOpFPStore();
  }

  async analyze(input: OracleInput): Promise<OracleOutput> {
    console.log(`Oracle analyzing in ${input.mode} mode...`);
    
    // Evaluate all rules
    const violations = await evaluateAllRules(input);

    // Filter out false positives
    const realViolations: RuleViolation[] = [];
    for (const violation of violations) {
      const isFP = await this.fpStore.isFalsePositive(violation.ruleId);
      if (!isFP) {
        realViolations.push(violation);
      }
    }

    // Check circuit breaker
    let circuitBreakerTripped = false;
    for (const violation of realViolations) {
      const count = await this.blockCounter.getCount(violation.ruleId);
      if (count > 100) { // threshold
        circuitBreakerTripped = true;
        break;
      }
    }

    // Make decision
    const machineDecision = makeDecision({
      violations: realViolations,
      mode: input.mode,
      strict: input.strict || false,
      dryRun: input.dryRun || false,
      circuitBreakerTripped,
    });

    // Update block counter if blocking
    if (machineDecision.outcome === 'block') {
      for (const violation of realViolations) {
        await this.blockCounter.increment(violation.ruleId);
      }
    }

    // Generate summary
    const summary = this.generateSummary(machineDecision, realViolations);

    // Count by severity
    const criticalCount = realViolations.filter(v => v.severity === 'critical').length;

    // Count rules checked (5 rules: MD-001 through MD-005)
    const rulesChecked = 5;

    return {
      machineDecision,
      violations: realViolations,
      summary,
      report: {
        rulesChecked,
        violationsFound: realViolations.length,
        criticalIssues: criticalCount,
      },
    };
  }

  private generateSummary(decision: any, violations: RuleViolation[]): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push('MIRROR DISSONANCE PROTOCOL - ORACLE ANALYSIS');
    lines.push('='.repeat(60));
    lines.push('');
    
    lines.push(`Decision: ${decision.outcome.toUpperCase()}`);
    lines.push(`Timestamp: ${decision.metadata.timestamp}`);
    lines.push(`Mode: ${decision.metadata.mode}`);
    lines.push('');
    
    lines.push('Reasons:');
    decision.reasons.forEach((reason: string) => {
      lines.push(`  - ${reason}`);
    });
    lines.push('');
    
    if (violations.length > 0) {
      lines.push('Violations:');
      violations.forEach(v => {
        lines.push(`  [${v.severity.toUpperCase()}] ${v.ruleId}: ${v.message}`);
      });
    } else {
      lines.push('No violations detected.');
    }
    
    lines.push('');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
  }
}

// Export factory function
export function createOracle(): Oracle {
  return new Oracle();
}

// Export main analyze function for convenience
export async function analyze(input: OracleInput): Promise<OracleOutput> {
  const oracle = createOracle();
  return oracle.analyze(input);
}
