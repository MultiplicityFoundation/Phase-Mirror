/**
 * Oracle V2 - Adapter-Based Implementation
 * 
 * Day 8: Complete refactor to use adapter pattern throughout.
 * Zero direct AWS SDK imports. Fail-closed by default.
 */

import { createAdapters } from "./adapters/factory";
import { loadCloudConfig, type CloudConfig } from "./adapters/config";
import type { Adapters } from "./adapters/types";
import { evaluateAllRules } from "./rules/index";
import { makeDecision } from "./policy/index";
import type { OracleInput, OracleOutput, RuleViolation } from "../schemas/types";
import { randomUUID } from "crypto";

/**
 * Oracle class - uses adapters for all cloud I/O
 */
export class Oracle {
  private readonly adapters: Adapters;

  constructor(adapters: Adapters) {
    this.adapters = adapters;
  }

  /**
   * Main analysis entry point
   */
  async analyze(input: OracleInput): Promise<OracleOutput> {
    console.log(`[oracle] Analyzing in ${input.mode} mode with provider: ${this.adapters.provider}`);

    // Evaluate all rules
    const evalResult = await evaluateAllRules(input);

    // Filter out false positives via adapter
    const realViolations: RuleViolation[] = [];
    let fpStoreError: Error | undefined;

    for (const violation of evalResult.violations) {
      // Error violations bypass FP filtering
      if (violation.context?.isEvaluationError) {
        realViolations.push(violation);
        continue;
      }

      // Check FP store via adapter (fail-closed on errors)
      try {
        const isFP = await this.adapters.fpStore.isFalsePositive(violation.ruleId);
        if (!isFP) {
          realViolations.push(violation);
        }
      } catch (error) {
        // Fail-closed: if FP store unavailable, keep the violation
        fpStoreError = error instanceof Error ? error : new Error(String(error));
        realViolations.push(violation);
      }
    }

    // Check circuit breaker via adapter
    let circuitBreakerTripped = false;
    for (const violation of realViolations) {
      try {
        const count = await this.adapters.blockCounter.get(violation.ruleId);
        if (count > 100) {
          circuitBreakerTripped = true;
          break;
        }
      } catch (error) {
        console.warn(`[oracle] Circuit breaker check failed for ${violation.ruleId}:`, error);
        // Continue without circuit breaker data
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
        try {
          await this.adapters.blockCounter.increment(violation.ruleId, 3600); // 1 hour TTL
        } catch (error) {
          console.warn(`[oracle] Failed to increment block counter for ${violation.ruleId}:`, error);
          // Non-fatal - continue
        }
      }
    }

    // Generate summary
    const summary = this.generateSummary(machineDecision, realViolations, fpStoreError);

    // Count by severity
    const criticalCount = realViolations.filter(v => v.severity === 'critical').length;

    // Count rules checked
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

  private generateSummary(
    decision: any,
    violations: RuleViolation[],
    fpStoreError?: Error
  ): string {
    const lines: string[] = [];

    lines.push('='.repeat(60));
    lines.push('MIRROR DISSONANCE PROTOCOL - ORACLE ANALYSIS');
    lines.push('='.repeat(60));
    lines.push('');

    lines.push(`Decision: ${decision.outcome.toUpperCase()}`);
    lines.push(`Timestamp: ${decision.metadata.timestamp}`);
    lines.push(`Mode: ${decision.metadata.mode}`);
    lines.push(`Provider: ${this.adapters.provider}`);
    lines.push('');

    if (fpStoreError) {
      lines.push('⚠️  FP Store Degraded (fail-closed mode)');
      lines.push(`   ${fpStoreError.message}`);
      lines.push('');
    }

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

/**
 * Create Oracle with adapter layer
 * 
 * This is the new initialization function that replaces initializeOracle().
 * It uses the adapter factory and fails closed if configuration is invalid.
 * 
 * @param configOverride - Optional config overrides
 * @returns Configured Oracle instance
 */
export async function createOracle(
  configOverride?: Partial<CloudConfig>
): Promise<Oracle> {
  const config = { ...loadCloudConfig(), ...configOverride };

  console.log(`[oracle] Initializing with provider: ${config.provider}`);

  // Create adapters (will throw if config invalid - fail-closed)
  const adapters = await createAdapters(config);

  // Verify secret store is reachable (fail-closed for non-local)
  const reachable = await adapters.secretStore.isReachable();
  if (!reachable && config.provider !== "local") {
    throw new Error(
      `Secret store unreachable for provider "${config.provider}". ` +
      `Cannot start Oracle without nonce access.`
    );
  }

  console.log(
    `[oracle] Adapters ready: ` +
    `fp=${config.fpTableName || "local"}, ` +
    `consent=${config.consentTableName || "local"}, ` +
    `provider=${config.provider}`
  );

  return new Oracle(adapters);
}

// Export types and helpers
export { loadCloudConfig, type CloudConfig } from "./adapters/config";
export type { Adapters } from "./adapters/types";
