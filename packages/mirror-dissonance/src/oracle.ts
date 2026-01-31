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
import { NoOpFPStore, IFPStore } from './fp-store/index.js';
import type { EnhancedDynamoDBFPStore } from './fp-store/index.js';
import type { BlockCounter } from './block-counter/dynamodb.js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { loadNonce } from './nonce/loader.js';
import { createRedactor, Redactor } from './redaction/redactor.js';

export interface OracleConfig {
  region?: string;
  nonceParameterName?: string;
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
}

export interface OracleComponents {
  fpStore?: IFPStore;
  redactor?: Redactor;
  blockCounter?: MemoryBlockCounter;
}

/**
 * Initialize Oracle with AWS services
 * Day 13: Wire Components Together
 */
export async function initializeOracle(config: OracleConfig): Promise<Oracle> {
  const components: OracleComponents = {};

  // Load nonce first (required for redaction) if SSM parameter name provided
  if (config.nonceParameterName) {
    try {
      const ssmClient = new SSMClient({ region: config.region || 'us-east-1' });
      const nonceConfig = await loadNonce(ssmClient, config.nonceParameterName);
      components.redactor = createRedactor(nonceConfig);
    } catch (error) {
      console.warn('Failed to load nonce from SSM, redaction will be limited:', error);
    }
  }

  // Initialize FP Store if table name provided
  if (config.fpTableName) {
    try {
      // Would import and create DynamoDBFPStore here
      // For now, use NoOp to maintain backward compatibility
      components.fpStore = new NoOpFPStore();
    } catch (error) {
      console.warn('Failed to initialize FP Store:', error);
      components.fpStore = new NoOpFPStore();
    }
  }

  return new Oracle(components);
}

export class Oracle {
  private blockCounter: MemoryBlockCounter;
  private fpStore: IFPStore;
  private redactor?: Redactor;

  constructor(components: OracleComponents = {}) {
    this.blockCounter = components.blockCounter || new MemoryBlockCounter(24);
    this.fpStore = components.fpStore || new NoOpFPStore();
    this.redactor = components.redactor;
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
