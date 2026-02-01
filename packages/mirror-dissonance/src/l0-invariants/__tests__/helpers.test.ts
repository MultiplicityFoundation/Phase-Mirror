/**
 * L0 Invariants Helper Function Tests
 */

import { createValidState } from '../index';

describe('createValidState Helper', () => {
  it('should create a valid state with defaults', () => {
    const state = createValidState();

    expect(state.schemaVersion).toBeDefined();
    expect(state.schemaHash).toBeDefined();
    expect(state.permissionBits).toBeDefined();
    expect(state.driftMagnitude).toBeDefined();
    expect(state.nonce).toBeDefined();
    expect(state.nonce.value).toBeDefined();
    expect(state.nonce.issuedAt).toBeDefined();
  });

  it('should accept partial overrides', () => {
    const state = createValidState({
      driftMagnitude: 0.25,
      permissionBits: 0b0000_0001_0001_0001
    });

    expect(state.driftMagnitude).toBe(0.25);
    expect(state.permissionBits).toBe(0b0000_0001_0001_0001);
  });

  it('should generate fresh nonce timestamp', () => {
    const before = Date.now();
    const state = createValidState();
    const after = Date.now();

    expect(state.nonce.issuedAt).toBeGreaterThanOrEqual(before);
    expect(state.nonce.issuedAt).toBeLessThanOrEqual(after);
  });

  it('should allow complete override', () => {
    const customState = {
      schemaVersion: '2.0.0',
      schemaHash: 'custom-hash',
      permissionBits: 0b0000_1111_0000_1111,
      driftMagnitude: 0.1,
      nonce: {
        value: 'b'.repeat(64),
        issuedAt: 1000000000000
      },
      contractionWitnessScore: 0.5
    };

    const state = createValidState(customState);

    expect(state).toEqual(customState);
  });

  it('should create unique states on each call', () => {
    const state1 = createValidState();
    
    // Add a small delay to ensure timestamps differ
    const delay = () => new Promise(resolve => setTimeout(resolve, 1));
    
    return delay().then(() => {
      const state2 = createValidState();
      
      // Timestamps should differ
      expect(state1.nonce.issuedAt).toBeLessThan(state2.nonce.issuedAt);
    });
  });
});
