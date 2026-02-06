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
import { NoOpFPStore, IFPStore, EnhancedDynamoDBFPStore, FPStore } from './fp-store/index.js';
import { DynamoDBBlockCounter } from './block-counter/dynamodb.js';
import type { BlockCounter } from './block-counter/dynamodb.js';
import { DynamoDBConsentStore, NoOpConsentStore, IConsentStore } from './consent-store/index.js';
import { SSMClient, SSMClientConfig } from '@aws-sdk/client-ssm';
import { loadNonce } from './nonce/loader.js';
import { createRedactor, Redactor } from './redaction/redactor.js';

// Constants for adapter configuration
const BLOCK_COUNTER_TTL_SECONDS = 3600; // 1 hour TTL for block counter entries

export interface OracleConfig {
  region?: string;
  endpoint?: string;  // For LocalStack testing
  nonceParameterName?: string;
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
}

export interface OracleComponents {
  fpStore?: IFPStore | FPStore;
  consentStore?: IConsentStore;
  redactor?: Redactor;
  blockCounter?: BlockCounter | MemoryBlockCounter;
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
      const clientConfig: SSMClientConfig = { region };
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

/**
 * Initialize Oracle with cloud adapters (Phase 1 Adapter Layer)
 * 
 * This is the new initialization path that uses the adapter layer to:
 * 1. Consolidate all AWS SDK instantiation in one place
 * 2. Enable zero-credential local development
 * 3. Make the Oracle cloud-agnostic
 * 4. Fail-closed instead of silently falling back to NoOp stores
 * 
 * Usage:
 * ```
 * import { initializeOracleWithAdapters } from './oracle';
 * import { loadCloudConfig } from './adapters/config';
 * 
 * const config = loadCloudConfig(); // Reads from environment
 * const oracle = await initializeOracleWithAdapters(config);
 * ```
 */
export async function initializeOracleWithAdapters(
  cloudConfig: import('./adapters/types').CloudConfig
): Promise<Oracle> {
  const { createAdapters } = await import('./adapters/factory');
  const adapters = await createAdapters(cloudConfig);

  const components: OracleComponents = {};

  // Load nonce if we're in AWS mode with SSM configured
  if (cloudConfig.provider === 'aws' && cloudConfig.nonceParameterName) {
    try {
      const nonce = await adapters.secretStore.getNonce(cloudConfig.nonceParameterName);
      const { createRedactor } = await import('./redaction/redactor');
      components.redactor = createRedactor({
        value: nonce,
        loadedAt: new Date().toISOString(),
        source: cloudConfig.nonceParameterName,
      });
    } catch (error) {
      // Fail-closed: throw error if nonce cannot be loaded
      console.error('Failed to load nonce from secret store:', error);
      throw error;
    }
  }

  // Wrap adapters in Oracle-compatible interfaces
  // The adapter layer provides the new interface (recordEvent, etc.)
  // The Oracle expects the old interface (isFalsePositive legacy method)
  // For now, we create a compatibility wrapper
  
  // Define proper wrapper interfaces that match Oracle's expectations
  interface OracleFPStore {
    recordEvent: typeof adapters.fpStore.recordEvent;
    markFalsePositive: typeof adapters.fpStore.markFalsePositive;
    getWindowByCount: typeof adapters.fpStore.getWindowByCount;
    getWindowBySince: typeof adapters.fpStore.getWindowBySince;
    isFalsePositive: typeof adapters.fpStore.isFalsePositive;
  }

  interface OracleBlockCounter {
    increment: (ruleId: string) => Promise<number>;
    get: (key: string) => Promise<number>;
    getCount: (key: string) => Promise<number>;
  }

  interface OracleConsentStore {
    hasValidConsent: (orgId: string) => Promise<boolean>;
  }

  const fpStoreWrapper: OracleFPStore = {
    recordEvent: adapters.fpStore.recordEvent.bind(adapters.fpStore),
    markFalsePositive: adapters.fpStore.markFalsePositive.bind(adapters.fpStore),
    getWindowByCount: adapters.fpStore.getWindowByCount.bind(adapters.fpStore),
    getWindowBySince: adapters.fpStore.getWindowBySince.bind(adapters.fpStore),
    isFalsePositive: adapters.fpStore.isFalsePositive.bind(adapters.fpStore),
  };

  const blockCounterWrapper: OracleBlockCounter = {
    // Adapter uses (key, ttlSeconds), Oracle expects different signatures
    increment: async (ruleId: string) => {
      return adapters.blockCounter.increment(ruleId, BLOCK_COUNTER_TTL_SECONDS);
    },
    get: adapters.blockCounter.get.bind(adapters.blockCounter),
    getCount: adapters.blockCounter.get.bind(adapters.blockCounter), // Alias for compatibility
  };

  // Consent store needs wrapping to match Oracle's expected interface
  const consentStoreWrapper: OracleConsentStore = {
    // Minimal compatibility wrapper - Oracle currently doesn't use consent store methods heavily
    hasValidConsent: async (orgId: string) => {
      // Check a default resource for backward compatibility
      // In a full migration, we'd map this properly
      return adapters.consentStore.hasConsent(orgId, 'fp_patterns');
    },
  };

  components.fpStore = fpStoreWrapper as unknown as IFPStore | FPStore;
  components.blockCounter = blockCounterWrapper as unknown as BlockCounter | MemoryBlockCounter;
  components.consentStore = consentStoreWrapper as unknown as IConsentStore;

  return new Oracle(components);
}

export class Oracle {
  private blockCounter: BlockCounter | MemoryBlockCounter;
  private fpStore: IFPStore | FPStore;
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
    
    // Evaluate all rules - now returns structured result with errors
    const evalResult = await evaluateAllRules(input);

    // Filter out false positives (only if legacy store)
    // Error-originated violations bypass FP filtering — they are never false positives
    const realViolations: RuleViolation[] = [];
    for (const violation of evalResult.violations) {
      // Error violations bypass FP filtering — they have no FP history
      if (violation.context?.isEvaluationError) {
        realViolations.push(violation);
        continue;
      }

      // Check if the store has the legacy isFalsePositive method
      if ('isFalsePositive' in this.fpStore) {
        const isFP = await (this.fpStore as IFPStore).isFalsePositive(violation.ruleId);
        if (!isFP) {
          realViolations.push(violation);
        }
      } else {
        // Enhanced store doesn't have this method yet, keep all violations
        realViolations.push(violation);
      }
    }

    // Check circuit breaker
    let circuitBreakerTripped = false;
    for (const violation of realViolations) {
      const count = 'getCount' in this.blockCounter 
        ? await this.blockCounter.getCount(violation.ruleId)
        : await this.blockCounter.get(violation.ruleId);
      if (count > 100) { // threshold
        circuitBreakerTripped = true;
        break;
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

    // Update block counter if blocking
    if (machineDecision.outcome === 'block') {
      for (const violation of realViolations) {
        if ('getCount' in this.blockCounter) {
          // MemoryBlockCounter
          await this.blockCounter.increment(violation.ruleId);
        } else {
          // DynamoDBBlockCounter
          await this.blockCounter.increment(violation.ruleId, 3600); // 1 hour TTL
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

// Export adapter layer types and config loader
export { loadCloudConfig } from './adapters/config';
export type { CloudConfig, CloudProvider, Adapters } from './adapters/types';
