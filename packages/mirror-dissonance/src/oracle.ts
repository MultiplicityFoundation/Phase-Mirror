/**
 * Oracle - Main entrypoint for Mirror Dissonance Protocol
 * 
 * The Oracle analyzes agentic domain-specific reasoning tensions and provides
 * machine decisions on whether to allow, block, or warn on changes.
 */
import { OracleInput, OracleOutput, RuleViolation } from '../schemas/types.js';
import { evaluateAllRules } from './rules/index.js';
import { makeDecision } from './policy/index.js';
import { createAdapters, loadCloudConfig, BlockCounterError } from './adapters/index.js';
import type { CloudAdapters, FPStoreAdapter, BlockCounterAdapter, ConsentStoreAdapter, SecretStoreAdapter } from './adapters/types.js';
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
  fpStore: FPStoreAdapter;
  consentStore: ConsentStoreAdapter;
  blockCounter: BlockCounterAdapter;
  secretStore: SecretStoreAdapter;
  redactor?: Redactor;
}

/**
 * Initialize Oracle via adapter factory.
 *
 * Replaces direct DynamoDB/SSM instantiation with createAdapters(loadCloudConfig()).
 * CLOUD_PROVIDER=local for zero-cloud mode (no NoOpFPStore fallback).
 */
export async function initializeOracle(config: OracleConfig = {}): Promise<Oracle> {
  // Override CloudConfig env vars if explicit config values provided
  if (config.region) process.env.AWS_REGION = config.region;
  if (config.fpTableName) process.env.FP_TABLE_NAME = config.fpTableName;
  if (config.consentTableName) process.env.CONSENT_TABLE_NAME = config.consentTableName;
  if (config.blockCounterTableName) process.env.BLOCK_COUNTER_TABLE_NAME = config.blockCounterTableName;
  if (config.nonceParameterName) process.env.NONCE_PARAMETER_NAME = config.nonceParameterName;

  const cloudConfig = loadCloudConfig();
  const adapters = await createAdapters(cloudConfig);

  // Load nonce and create redactor
  let redactor: Redactor | undefined;
  try {
    const nonceConfig = await adapters.secretStore.getNonce();
    redactor = createRedactor(nonceConfig);
  } catch (error) {
    // L0 fail-closed: nonce is required for non-local providers
    if (cloudConfig.provider !== 'local') {
      throw error;
    }
    console.warn('Failed to load nonce via adapter, redaction will be limited:', error);
  }

  return new Oracle({
    fpStore: adapters.fpStore,
    consentStore: adapters.consentStore,
    blockCounter: adapters.blockCounter,
    secretStore: adapters.secretStore,
    redactor,
  });
}

export class Oracle {
  private blockCounter: BlockCounterAdapter;
  private fpStore: FPStoreAdapter;
  private consentStore: ConsentStoreAdapter;
  private redactor?: Redactor;

  constructor(components: OracleComponents) {
    this.blockCounter = components.blockCounter;
    this.fpStore = components.fpStore;
    this.consentStore = components.consentStore;
    this.redactor = components.redactor;
  }

  async analyze(input: OracleInput): Promise<OracleOutput> {
    console.log(`Oracle analyzing in ${input.mode} mode...`);
    
    // Evaluate all rules - now returns structured result with errors
    const evalResult = await evaluateAllRules(input);

    // Filter out false positives via adapter
    // Error-originated violations bypass FP filtering — they are never false positives
    const realViolations: RuleViolation[] = [];
    for (const violation of evalResult.violations) {
      // Error violations bypass FP filtering — they have no FP history
      if (violation.context?.isEvaluationError) {
        realViolations.push(violation);
        continue;
      }

      // Use adapter's isFalsePositive method
      const isFP = await this.fpStore.isFalsePositive(violation.ruleId);
      if (!isFP) {
        realViolations.push(violation);
      }
    }

    // Check circuit breaker via adapter — fail-open on counter failure
    let circuitBreakerTripped = false;
    const orgId = input.context?.repositoryName || 'unknown';
    for (const violation of realViolations) {
      try {
        const broken = await this.blockCounter.isCircuitBroken(violation.ruleId, orgId, 100);
        if (broken) {
          circuitBreakerTripped = true;
          break;
        }
      } catch (error) {
        // L0 fail-open: counter failure should NOT block PRs or trip breaker
        console.warn('Circuit breaker counter unavailable, defaulting to open', {
          ruleId: violation.ruleId,
          orgId,
          error: error instanceof BlockCounterError ? error.context : error,
        });
        // Don't trip breaker on infrastructure failure
      }
    }

    // Make decision - error violations are critical severity, will block
    const machineDecision = makeDecision({
      violations: realViolations,
      mode: input.mode,
      strict: input.strict || false,
      dryRun: input.dryRun || false,
      circuitBreakerTripped,
    });

    // Update block counter if blocking — fail-open on increment failure
    if (machineDecision.outcome === 'block') {
      for (const violation of realViolations) {
        try {
          await this.blockCounter.increment(violation.ruleId, orgId);
        } catch (error) {
          // L0 fail-open: increment failure is observed but non-blocking
          console.warn('Block counter increment failed, continuing', {
            ruleId: violation.ruleId,
            orgId,
            error: error instanceof BlockCounterError ? error.context : error,
          });
        }
      }
    }

    // Generate summary
    const summary = this.generateSummary(machineDecision, realViolations);

    // Count by severity
    const criticalCount = realViolations.filter(v => v.severity === 'critical').length;

    // Count rules checked - now we have the actual count
    const rulesChecked = evalResult.rulesEvaluated + evalResult.rulesErrored;

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

// Export factory function — uses adapter factory for provider-agnostic initialization
export async function createOracle(): Promise<Oracle> {
  return initializeOracle();
}

// Export main analyze function for convenience
export async function analyze(input: OracleInput): Promise<OracleOutput> {
  const oracle = await createOracle();
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
