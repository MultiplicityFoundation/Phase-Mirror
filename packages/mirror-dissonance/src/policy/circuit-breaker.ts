/**
 * Circuit Breaker Policy - Day 17
 * Degrades to warn mode after threshold blocks per hour
 */

import type { BlockCounter } from '../block-counter/dynamodb.js';
import type { MachineDecisionV2, DegradedMode } from '../../schemas/types.js';

export interface CircuitBreakerConfig {
  maxBlocksPerHour: number;
  bucketTTLSeconds: number;  // 2-3 hours
}

export interface MachineDecisionInput {
  outcome: 'pass' | 'warn' | 'block';
  degraded?: boolean;
  reason?: string;
}

/**
 * Applies circuit breaker logic to a machine decision
 * @param decision Current machine decision
 * @param context Repository context
 * @param counter Block counter instance
 * @param config Circuit breaker configuration
 * @returns Modified decision if circuit breaker triggers
 */
export async function applyCircuitBreaker(
  decision: MachineDecisionInput,
  context: { owner: string; repo: string },
  counter: BlockCounter,
  config: CircuitBreakerConfig
): Promise<MachineDecisionV2> {
  const now = new Date();
  const hourBucket = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
  const key = `blocks:${context.owner}/${context.repo}:${hourBucket}`;

  // If decision is block, increment counter
  if (decision.outcome === 'block') {
    const newCount = await counter.increment(key, config.bucketTTLSeconds);

    if (newCount >= config.maxBlocksPerHour) {
      return {
        outcome: 'warn',
        degraded: true,
        reason: `Circuit breaker triggered: ${newCount} blocks in current hour (threshold: ${config.maxBlocksPerHour})`,
      };
    }
  }

  return {
    outcome: decision.outcome,
    degraded: decision.degraded || false,
    reason: decision.reason,
  };
}

/**
 * Creates a DegradedMode object for circuit breaker trigger
 */
export function createCircuitBreakerDegradedMode(count: number, threshold: number): DegradedMode {
  return {
    reason: 'circuit_breaker_triggered',
    timestamp: new Date(),
    details: `Circuit breaker triggered: ${count} blocks in current hour (threshold: ${threshold})`,
  };
}
