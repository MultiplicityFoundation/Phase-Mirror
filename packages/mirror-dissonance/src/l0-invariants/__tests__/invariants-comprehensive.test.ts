/**
 * L0 Invariants Test Suite
 * 
 * Requirements:
 * - 90%+ code coverage
 * - Performance benchmarks in performance.test.ts (<2µs p99 for JavaScript/Node.js)
 * - All invariant checks validated
 */

import {
  checkL0Invariants,
  createValidState,
  InvariantViolationError,
  type State,
  type InvariantCheckResult
} from '../index';

describe('L0 Invariants', () => {
  let validState: State;

  beforeEach(() => {
    validState = createValidState();
  });

  describe('1. Schema Hash Validation', () => {
    it('should pass with matching schema hash', () => {
      const result = checkL0Invariants(validState);

      expect(result.passed).toBe(true);
      expect(result.failedChecks).toHaveLength(0);
      expect(result.violations).toBeUndefined();
    });

    it('should fail with mismatched schema hash', () => {
      const invalidState = createValidState({
        schemaVersion: '1.0.0',
        schemaHash: 'wrong-hash-value'
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
      expect(result.violations).toBeDefined();
      expect(result.violations?.schema_hash).toMatch(/mismatch/i);
    });

    it('should fail with empty schema hash', () => {
      const invalidState = createValidState({
        schemaHash: ''
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
    });

    it('should fail with null schema hash', () => {
      const invalidState = {
        ...validState,
        schemaHash: null as any
      };

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
    });
  });

  describe('2. Permission Bits Validation', () => {
    it('should pass with correct permission bits', () => {
      const result = checkL0Invariants(validState);
      expect(result.passed).toBe(true);
    });

    it('should fail when reserved bits are set', () => {
      const invalidState = createValidState({
        permissionBits: 0b1111_0000_0000_0000 // All reserved bits set
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('permission_bits');
      expect(result.violations?.permission_bits).toMatch(/reserved bits/i);
    });

    it('should pass with all valid bits set', () => {
      const validBits = createValidState({
        permissionBits: 0b0000_1111_1111_1111 // All valid bits
      });

      const result = checkL0Invariants(validBits);
      expect(result.passed).toBe(true);
    });

    it('should fail with single reserved bit set', () => {
      const invalidState = createValidState({
        permissionBits: 0b1000_0000_0000_0000 // Single reserved bit
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('permission_bits');
    });

    it('should handle edge case: all zeros', () => {
      const zeroState = createValidState({
        permissionBits: 0b0000_0000_0000_0000
      });

      const result = checkL0Invariants(zeroState);
      expect(result.passed).toBe(true); // No reserved bits set
    });

    it('should handle edge case: max valid value', () => {
      const maxValid = createValidState({
        permissionBits: 0b0000_1111_1111_1111
      });

      const result = checkL0Invariants(maxValid);
      expect(result.passed).toBe(true);
    });
  });

  describe('3. Drift Magnitude Validation', () => {
    it('should pass when drift is within threshold', () => {
      const result = checkL0Invariants(
        createValidState({ driftMagnitude: 0.15 })
      );

      expect(result.passed).toBe(true);
    });

    it('should fail when drift exceeds threshold (0.3)', () => {
      const invalidState = createValidState({
        driftMagnitude: 0.35 // Over 0.3 threshold
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drift_magnitude');
      expect(result.violations?.drift_magnitude).toMatch(/threshold/i);
    });

    it('should pass at exact threshold boundary', () => {
      const boundaryState = createValidState({
        driftMagnitude: 0.3
      });

      const result = checkL0Invariants(boundaryState);
      expect(result.passed).toBe(true);
    });

    it('should fail just over threshold', () => {
      const overThreshold = createValidState({
        driftMagnitude: 0.30001
      });

      const result = checkL0Invariants(overThreshold);
      expect(result.passed).toBe(false);
    });

    it('should pass with zero drift', () => {
      const zeroDrift = createValidState({
        driftMagnitude: 0.0
      });

      const result = checkL0Invariants(zeroDrift);
      expect(result.passed).toBe(true);
    });

    it('should fail with negative drift', () => {
      const negativeDrift = createValidState({
        driftMagnitude: -0.1
      });

      const result = checkL0Invariants(negativeDrift);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drift_magnitude');
    });
  });

  describe('4. Nonce Freshness Validation', () => {
    it('should pass with fresh nonce', () => {
      const result = checkL0Invariants(validState);
      expect(result.passed).toBe(true);
    });

    it('should fail with expired nonce (>1 hour old)', () => {
      const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
      const invalidState = createValidState({
        nonce: {
          value: 'a'.repeat(64),
          issuedAt: twoHoursAgo
        }
      });

      const result = checkL0Invariants(invalidState);

      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('nonce_freshness');
      expect(result.violations?.nonce_freshness).toMatch(/expired|stale/i);
    });

    it('should pass at freshness boundary (59min 59sec)', () => {
      const almostExpired = Date.now() - (59 * 60 * 1000 + 59 * 1000);
      const boundaryState = createValidState({
        nonce: {
          value: 'a'.repeat(64),
          issuedAt: almostExpired
        }
      });

      const result = checkL0Invariants(boundaryState);
      expect(result.passed).toBe(true);
    });

    it('should fail just past freshness boundary', () => {
      const justExpired = Date.now() - (60 * 60 * 1000 + 1000); // 1hr + 1sec
      const expiredState = createValidState({
        nonce: {
          value: 'a'.repeat(64),
          issuedAt: justExpired
        }
      });

      const result = checkL0Invariants(expiredState);
      expect(result.passed).toBe(false);
    });

    it('should fail with missing nonce value', () => {
      const invalidState = createValidState({
        nonce: {
          value: '',
          issuedAt: Date.now()
        }
      });

      const result = checkL0Invariants(invalidState);
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('nonce_freshness');
    });

    it('should fail with future nonce timestamp', () => {
      const futureTime = Date.now() + (10 * 60 * 1000); // 10 min future
      const futureState = createValidState({
        nonce: {
          value: 'a'.repeat(64),
          issuedAt: futureTime
        }
      });

      const result = checkL0Invariants(futureState);
      expect(result.passed).toBe(false);
    });

    it('should fail with invalid nonce length', () => {
      const shortNonce = createValidState({
        nonce: {
          value: 'abc123', // Too short (need 64 chars)
          issuedAt: Date.now()
        }
      });

      const result = checkL0Invariants(shortNonce);
      expect(result.passed).toBe(false);
    });
  });

  describe('5. Multiple Violations', () => {
    it('should report all violations when multiple checks fail', () => {
      const multipleInvalid = createValidState({
        schemaHash: 'wrong-hash',
        permissionBits: 0b1111_0000_0000_0000,
        driftMagnitude: 0.5,
        nonce: {
          value: '',
          issuedAt: Date.now() - (3 * 60 * 60 * 1000)
        }
      });

      const result = checkL0Invariants(multipleInvalid);

      expect(result.passed).toBe(false);
      expect(result.failedChecks.length).toBeGreaterThanOrEqual(4);
      expect(result.failedChecks).toContain('schema_hash');
      expect(result.failedChecks).toContain('permission_bits');
      expect(result.failedChecks).toContain('drift_magnitude');
      expect(result.failedChecks).toContain('nonce_freshness');
    });

    it('should include all violation details', () => {
      const multipleInvalid = createValidState({
        schemaHash: 'wrong',
        driftMagnitude: 0.8
      });

      const result = checkL0Invariants(multipleInvalid);

      expect(result.violations).toBeDefined();
      expect(Object.keys(result.violations!).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('6. Edge Cases & Resilience', () => {
    it('should handle null state gracefully', () => {
      expect(() => checkL0Invariants(null as any)).toThrow();
    });

    it('should handle undefined state gracefully', () => {
      expect(() => checkL0Invariants(undefined as any)).toThrow();
    });

    it('should handle partial state gracefully', () => {
      const partialState = {
        schemaVersion: '1.0.0'
        // Missing other fields
      } as any;

      const result = checkL0Invariants(partialState);
      expect(result.passed).toBe(false);
    });

    it('should handle state with extra fields', () => {
      const extraFields = {
        ...validState,
        extraField: 'unexpected',
        anotherExtra: 123
      };

      const result = checkL0Invariants(extraFields as any);
      expect(result.passed).toBe(true); // Extra fields ignored
    });

    it('should be deterministic (same input, same output)', () => {
      const result1 = checkL0Invariants(validState);
      const result2 = checkL0Invariants(validState);

      expect(result1).toEqual(result2);
    });

    it('should not mutate input state', () => {
      const original = createValidState();
      const copy = JSON.parse(JSON.stringify(original));

      checkL0Invariants(original);

      expect(original).toEqual(copy);
    });
  });

  describe('7. InvariantViolationError', () => {
    it('should throw InvariantViolationError when configured', () => {
      const invalidState = createValidState({
        schemaHash: 'wrong'
      });

      expect(() => {
        const result = checkL0Invariants(invalidState);
        if (!result.passed) {
          throw new InvariantViolationError(result);
        }
      }).toThrow(InvariantViolationError);
    });

    it('should include violation details in error', () => {
      const invalidState = createValidState({
        driftMagnitude: 0.9
      });

      try {
        const result = checkL0Invariants(invalidState);
        if (!result.passed) {
          throw new InvariantViolationError(result);
        }
        // If we get here, test should fail
        expect(true).toBe(false); // Force failure with clear message
      } catch (error: any) {
        expect(error.result).toBeDefined();
        expect(error.result.failedChecks).toContain('drift_magnitude');
      }
    });
  });
});
