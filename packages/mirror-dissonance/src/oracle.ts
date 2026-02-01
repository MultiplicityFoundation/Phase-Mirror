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
import { NoOpFPStore, IFPStore, DynamoDBFPStore as EnhancedDynamoDBFPStore } from './fp-store/index.js';
import { DynamoDBBlockCounter } from './block-counter/dynamodb.js';
import type { BlockCounter } from './block-counter/dynamodb.js';
import { DynamoDBConsentStore, NoOpConsentStore, IConsentStore } from './consent-store/index.js';
import { SSMClient } from '@aws-sdk/client-ssm';
import { loadNonce } from './nonce/loader.js';
import { createRedactor, Redactor } from './redaction/redactor.js';

export interface OracleConfig {
  region?: string;
  endpoint?: string;  // For LocalStack testing
  nonceParameterName?: string;
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
}

export interface OracleComponents {
  fpStore?: IFPStore;
  consentStore?: IConsentStore;
  redactor?: Redactor;
  blockCounter?: BlockCounter | MemoryBlockCounter;
}
}

/**
 * Initialize Oracle with AWS services
 * Day 13: Wire Components Together
 */
export async function initializeOracle(config: OracleConfig): Promise<Oracle> {
  const components: OracleComponents = {};
  const region = config.region || 'us-east-1';

  // Load nonce first (required for redaction) if SSM parameter name provided
  if (config.nonceParameterName) {
    try {
      const clientConfig: any = { region };
      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
      }
      const ssmClient = new SSMClient(clientConfig);
      const nonceConfig = await loadNonce(ssmClient, config.nonceParameterName);
      components.redactor = createRedactor(nonceConfig);
    } catch (error) {
      console.warn('Failed to load nonce from SSM, redaction will be limited:', error);
      // Fail-closed: throw error if nonce cannot be loaded
      throw error;
    }
  }

  // Initialize FP Store if table name provided
  if (config.fpTableName) {
    try {
      components.fpStore = new EnhancedDynamoDBFPStore({
        tableName: config.fpTableName,
        region,
        endpoint: config.endpoint,
      });
    } catch (error) {
      console.warn('Failed to initialize FP Store:', error);
      components.fpStore = new NoOpFPStore();
    }
  }

  // Initialize Consent Store if table name provided
  if (config.consentTableName) {
    try {
      components.consentStore = new DynamoDBConsentStore({
        tableName: config.consentTableName,
        region,
        endpoint: config.endpoint,
      });
    } catch (error) {
      console.warn('Failed to initialize Consent Store:', error);
      components.consentStore = new NoOpConsentStore();
    }
  }

  // Initialize Block Counter if table name provided
  if (config.blockCounterTableName) {
    try {
      components.blockCounter = new DynamoDBBlockCounter(
        config.blockCounterTableName,
        region,
        config.endpoint
      );
    } catch (error) {
      console.warn('Failed to initialize Block Counter:', error);
      components.blockCounter = new MemoryBlockCounter(24);
    }
  }

  return new Oracle(components);
}

export class Oracle {
  private blockCounter: BlockCounter | MemoryBlockCounter;
  private fpStore: IFPStore;
  private consentStore: IConsentStore;
  private redactor?: Redactor;

  constructor(components: OracleComponents = {}) {
    this.blockCounter = components.blockCounter || new MemoryBlockCounter(24);
    this.fpStore = components.fpStore || new NoOpFPStore();
    this.consentStore = components.consentStore || new NoOpConsentStore();
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
      const count = await this.blockCounter.get(violation.ruleId);
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

// Export analysis orchestrator for reusable integration
export {
  AnalysisOrchestrator,
  createOrchestrator,
  type AnalysisOrchestratorConfig,
  type AnalysisInput,
  type AnalysisOutput,
  type FileArtifact,
  type RepositoryContext,
} from './analysis/index.js';
