/**
 * Shared test utilities
 */

import type { FPEvent, OrganizationConsent, State } from '../types';

/**
 * Create a valid FP event for testing
 */
export function createMockFPEvent(overrides?: Partial<FPEvent>): FPEvent {
  return {
    eventId: 'test-event-001',
    ruleId: 'MD-001',
    ruleVersion: '1.0.0',
    findingId: 'finding-001',
    outcome: 'block',
    isFalsePositive: false,
    timestamp: new Date('2026-02-01T12:00:00Z'),
    context: {
      repo: 'test/repo',
      branch: 'main',
      eventType: 'pullrequest'
    },
    ...overrides
  };
}

/**
 * Create a valid consent record for testing
 */
export function createMockConsent(overrides?: Partial<OrganizationConsent>): OrganizationConsent {
  return {
    orgId: 'TestOrg',
    state: 'granted',
    grantedAt: new Date('2026-01-01T00:00:00Z'),
    grantedBy: 'test-admin',
    policyVersion: '1.0.0',
    resources: ['fppatterns', 'fpmetrics', 'crossorgbenchmarks'],
    ...overrides
  };
}

/**
 * Create a valid L0 state for testing
 */
export function createMockL0State(overrides?: Partial<State>): State {
  return {
    schemaVersion: '1.0.0',
    schemaHash: 'abc123def456',
    permissionBits: 0b0000000000000001,
    driftMagnitude: 0.15,
    nonce: {
      value: 'a'.repeat(64),
      issuedAt: Date.now()
    },
    ...overrides
  };
}

/**
 * Wait for condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Create a spy that tracks call order
 */
export function createCallOrderSpy() {
  const calls: string[] = [];
  
  return {
    record: (name: string) => calls.push(name),
    getCalls: () => [...calls],
    assertOrder: (...expectedOrder: string[]) => {
      expect(calls).toEqual(expectedOrder);
    }
  };
}
