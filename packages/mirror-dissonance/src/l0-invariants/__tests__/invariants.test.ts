/**
 * Tests for L0 Invariants
 * 
 * These tests verify that L0 checks correctly validate state transitions
 * and that performance targets are met.
 */

import { 
  checkL0Invariants, 
  createValidState, 
  State,
  InvariantViolationError 
} from '../index.js';

describe('L0 Invariants', () => {
  describe('Valid State', () => {
    it('should pass all checks for a valid state', () => {
      const state = createValidState();
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
      expect(result.failedChecks).toHaveLength(0);
    });
    
    it('should complete in under 100 microseconds', () => {
      const state = createValidState();
      const result = checkL0Invariants(state);
      
      // 100 microseconds = 100000 nanoseconds
      // L0 checks should be extremely fast, even accounting for hrtime overhead
      expect(result.latencyNs).toBeLessThan(100000);
    });
  });
  
  describe('Schema Hash Check', () => {
    it('should fail when schema version is incorrect', () => {
      const state = createValidState({
        schemaVersion: '2.0:f7a8b9c0',
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
      expect(result.context.schemaVersion).toBe('2.0:f7a8b9c0');
    });
    
    it('should fail when schema hash is incorrect', () => {
      const state = createValidState({
        schemaVersion: '1.0:deadbeef',
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
    });
    
    it('should fail when schema format is invalid', () => {
      const state = createValidState({
        schemaVersion: 'invalid',
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('schema_hash');
    });
  });
  
  describe('Permission Bits Check', () => {
    it('should pass when only defined bits are set', () => {
      const state = createValidState({
        permissionBits: 0b0000111111111111, // Bits 0-11 set
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
    });
    
    it('should pass when no bits are set', () => {
      const state = createValidState({
        permissionBits: 0b0000000000000000,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
    });
    
    it('should fail when reserved bit 12 is set', () => {
      const state = createValidState({
        permissionBits: 0b0001000000000000, // Bit 12 set
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('permission_bits');
    });
    
    it('should fail when reserved bit 15 is set', () => {
      const state = createValidState({
        permissionBits: 0b1000000000000000, // Bit 15 set
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('permission_bits');
    });
    
    it('should fail when multiple reserved bits are set', () => {
      const state = createValidState({
        permissionBits: 0b1111000000000000, // All reserved bits set
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('permission_bits');
    });
  });
  
  describe('Drift Magnitude Check', () => {
    it('should pass when drift is 0.0', () => {
      const state = createValidState({
        driftMagnitude: 0.0,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
    });
    
    it('should pass when drift is just below threshold', () => {
      const state = createValidState({
        driftMagnitude: 0.299,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
    });
    
    it('should fail when drift equals threshold', () => {
      const state = createValidState({
        driftMagnitude: 0.3,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drift_magnitude');
    });
    
    it('should fail when drift exceeds threshold', () => {
      const state = createValidState({
        driftMagnitude: 0.5,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drift_magnitude');
    });
    
    it('should fail when drift is negative', () => {
      const state = createValidState({
        driftMagnitude: -0.1,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('drift_magnitude');
    });
  });
  
  describe('Nonce Freshness Check', () => {
    it('should pass when nonce was just issued', () => {
      const now = Date.now();
      const state = createValidState({
        nonce: {
          value: 'test-nonce',
          issuedAt: now,
        },
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(true);
    });
    
    it('should pass when nonce is 59 minutes old', () => {
      const now = Date.now();
      const state = createValidState({
        nonce: {
          value: 'test-nonce',
          issuedAt: now - 59 * 60 * 1000, // 59 minutes ago
        },
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(true);
    });
    
    it('should fail when nonce is exactly 1 hour old', () => {
      const now = Date.now();
      const state = createValidState({
        nonce: {
          value: 'test-nonce',
          issuedAt: now - 60 * 60 * 1000, // 1 hour ago
        },
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('nonce_freshness');
    });
    
    it('should fail when nonce is 2 hours old', () => {
      const now = Date.now();
      const state = createValidState({
        nonce: {
          value: 'test-nonce',
          issuedAt: now - 2 * 60 * 60 * 1000, // 2 hours ago
        },
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('nonce_freshness');
    });
    
    it('should fail when nonce is from the future', () => {
      const now = Date.now();
      const state = createValidState({
        nonce: {
          value: 'test-nonce',
          issuedAt: now + 1000, // 1 second in the future
        },
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('nonce_freshness');
    });
  });
  
  describe('Contraction Witness Check', () => {
    it('should pass when witness score is exactly 1.0', () => {
      const state = createValidState({
        contractionWitnessScore: 1.0,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(true);
    });
    
    it('should fail when witness score is 0.99', () => {
      const state = createValidState({
        contractionWitnessScore: 0.99,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('contraction_witness');
    });
    
    it('should fail when witness score is 0.0', () => {
      const state = createValidState({
        contractionWitnessScore: 0.0,
      });
      const result = checkL0Invariants(state);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toContain('contraction_witness');
    });
  });
  
  describe('Multiple Failures', () => {
    it('should report all failed checks', () => {
      const now = Date.now();
      const state = createValidState({
        schemaVersion: '2.0:wrong',
        permissionBits: 0b1000000000000000, // Reserved bit set
        driftMagnitude: 0.5, // Exceeds threshold
        nonce: {
          value: 'old-nonce',
          issuedAt: now - 2 * 60 * 60 * 1000, // 2 hours old
        },
        contractionWitnessScore: 0.5, // Not perfect
      });
      const result = checkL0Invariants(state, now);
      
      expect(result.passed).toBe(false);
      expect(result.failedChecks).toHaveLength(5);
      expect(result.failedChecks).toContain('schema_hash');
      expect(result.failedChecks).toContain('permission_bits');
      expect(result.failedChecks).toContain('drift_magnitude');
      expect(result.failedChecks).toContain('nonce_freshness');
      expect(result.failedChecks).toContain('contraction_witness');
    });
  });
  
  describe('InvariantViolationError', () => {
    it('should create error with message, failed checks, and context', () => {
      const error = new InvariantViolationError(
        'L0 check failed',
        ['schema_hash', 'drift_magnitude'],
        { schemaVersion: '2.0:wrong', driftMagnitude: 0.5 }
      );
      
      expect(error.message).toBe('L0 check failed');
      expect(error.failedChecks).toEqual(['schema_hash', 'drift_magnitude']);
      expect(error.context.schemaVersion).toBe('2.0:wrong');
      expect(error.name).toBe('InvariantViolationError');
    });
  });
});
