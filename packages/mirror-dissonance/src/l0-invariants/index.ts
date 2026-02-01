/**
 * L0 Invariants - Foundation Tier
 * 
 * These checks are so cheap (<100ns p99) that running them is always better
 * than not running them. They catch critical failures before expensive L1 checks.
 * 
 * Design principles:
 * - No allocations (stack-only operations)
 * - No I/O (pure computation)
 * - Fail-closed (invalid states are rejected, never logged-and-continued)
 * - Always-on (no configuration to disable)
 * 
 * See ADR-003: Hierarchical PMD Compute
 */

/**
 * State represents a transition in the system.
 * L0 checks validate the foundation properties of this state.
 */
export interface State {
  /**
   * Schema version (e.g., "1.0.0")
   */
  schemaVersion: string;
  
  /**
   * Schema hash for validation
   */
  schemaHash: string;
  
  /**
   * Permission bitfield (16 bits)
   * Bits 0-11: Defined permissions
   * Bits 12-15: Reserved (must be 0)
   */
  permissionBits: number;
  
  /**
   * Drift magnitude (0.0 to 1.0)
   * Measures divergence from expected behavior
   */
  driftMagnitude: number;
  
  /**
   * Nonce for replay protection
   */
  nonce: {
    value: string;
    issuedAt: number; // Unix timestamp in milliseconds
  };
  
  /**
   * Contraction witness score (0.0 to 1.0)
   * Cached proof of state coherence
   */
  contractionWitnessScore?: number;
}

/**
 * Result of L0 invariant check
 */
export interface InvariantCheckResult {
  /**
   * Whether all L0 checks passed
   */
  passed: boolean;
  
  /**
   * List of failed check names (empty if all passed)
   */
  failedChecks: string[];
  
  /**
   * Detailed violation messages for failed checks
   */
  violations?: Record<string, string>;
}

/**
 * Legacy result type for backwards compatibility
 */
export interface L0Result extends InvariantCheckResult {
  /**
   * Time taken to run all checks (nanoseconds)
   */
  latencyNs: number;
  
  /**
   * Detailed context for failures (for logging/debugging)
   */
  context: Record<string, unknown>;
}

/**
 * Expected schema version and hash
 * This is the known-good schema that the system expects
 */
const EXPECTED_SCHEMA_VERSION = '1.0.0';
const EXPECTED_SCHEMA_HASH = 'f7a8b9c0d1e2f3g4'; // Placeholder, would be computed from actual schema

/**
 * Permission bit layout:
 * - Bits 0-11: Defined permissions (12 permissions)
 * - Bits 12-15: Reserved (must be 0)
 */
const RESERVED_PERMISSION_BITS_MASK = 0b1111000000000000;

/**
 * Drift magnitude threshold
 * Values above this trigger L1 escalation
 */
const DRIFT_THRESHOLD = 0.3;

/**
 * Nonce lifetime in milliseconds (1 hour)
 * See ADR-005: Nonce Rotation & Fail-Closed Availability
 */
const NONCE_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Contraction witness threshold
 * Score must be 1.0 (perfect coherence) to pass
 */
const CONTRACTION_WITNESS_THRESHOLD = 1.0;

/**
 * Check if schema version and hash match expected values
 * 
 * @param state - State to check
 * @returns true if schema is valid, false otherwise
 */
function checkSchemaHash(state: State): boolean {
  if (!state.schemaHash || !state.schemaVersion) {
    return false;
  }
  return state.schemaVersion === EXPECTED_SCHEMA_VERSION && 
         state.schemaHash === EXPECTED_SCHEMA_HASH;
}

/**
 * Check if permission bits are valid
 * Reserved bits (12-15) must be 0
 * 
 * @param state - State to check
 * @returns true if permissions are valid, false otherwise
 */
function checkPermissionBits(state: State): boolean {
  // Check if any reserved bits are set
  const hasReservedBits = (state.permissionBits & RESERVED_PERMISSION_BITS_MASK) !== 0;
  return !hasReservedBits;
}

/**
 * Check if drift magnitude is within acceptable bounds
 * 
 * @param state - State to check
 * @returns true if drift is acceptable, false otherwise
 */
function checkDriftMagnitude(state: State): boolean {
  return state.driftMagnitude >= 0.0 && 
         state.driftMagnitude <= DRIFT_THRESHOLD;
}

/**
 * Check if nonce is fresh (not expired)
 * 
 * @param state - State to check
 * @param nowMs - Current time in milliseconds (for testing)
 * @returns true if nonce is fresh, false otherwise
 */
function checkNonceFreshness(state: State, nowMs?: number): boolean {
  if (!state.nonce || !state.nonce.value || state.nonce.value.length < 64) {
    return false;
  }
  const now = nowMs ?? Date.now();
  const age = now - state.nonce.issuedAt;
  return age >= 0 && age < NONCE_LIFETIME_MS;
}

/**
 * Check if contraction witness is valid
 * Score must be exactly 1.0 (perfect coherence)
 * 
 * @param state - State to check
 * @returns true if witness is valid, false otherwise
 */
function checkContractionWitness(state: State): boolean {
  if (state.contractionWitnessScore === undefined) {
    return true; // Optional field, skip check if not present
  }
  return state.contractionWitnessScore === CONTRACTION_WITNESS_THRESHOLD;
}

/**
 * Run all L0 invariant checks on a state
 * 
 * This is the main entry point for L0 validation.
 * It runs all checks and returns a result.
 * 
 * Performance target: p99 < 100ns
 * 
 * @param state - State to validate
 * @param nowMs - Current time in milliseconds (for testing)
 * @returns InvariantCheckResult indicating pass/fail and details
 */
export function checkL0Invariants(state: State, nowMs?: number): InvariantCheckResult {
  const failedChecks: string[] = [];
  const violations: Record<string, string> = {};
  
  // Check 1: Schema hash
  if (!checkSchemaHash(state)) {
    failedChecks.push('schema_hash');
    violations.schema_hash = `Schema hash mismatch. Expected version: ${EXPECTED_SCHEMA_VERSION}, hash: ${EXPECTED_SCHEMA_HASH}`;
  }
  
  // Check 2: Permission bits
  if (!checkPermissionBits(state)) {
    failedChecks.push('permission_bits');
    violations.permission_bits = `Reserved bits are set. Permission bits: ${state.permissionBits.toString(2).padStart(16, '0')}`;
  }
  
  // Check 3: Drift magnitude
  if (!checkDriftMagnitude(state)) {
    failedChecks.push('drift_magnitude');
    violations.drift_magnitude = `Drift magnitude exceeds threshold. Value: ${state.driftMagnitude}, threshold: ${DRIFT_THRESHOLD}`;
  }
  
  // Check 4: Nonce freshness
  if (!checkNonceFreshness(state, nowMs)) {
    failedChecks.push('nonce_freshness');
    if (!state.nonce) {
      violations.nonce_freshness = `Nonce is missing`;
    } else {
      const age = (nowMs ?? Date.now()) - state.nonce.issuedAt;
      if (age < 0) {
        violations.nonce_freshness = `Nonce timestamp is in the future`;
      } else if (!state.nonce.value || state.nonce.value.length < 64) {
        violations.nonce_freshness = `Nonce value is missing or too short`;
      } else {
        violations.nonce_freshness = `Nonce is expired or stale. Age: ${age}ms, lifetime: ${NONCE_LIFETIME_MS}ms`;
      }
    }
  }
  
  // Check 5: Contraction witness (optional check)
  if (state.contractionWitnessScore !== undefined && !checkContractionWitness(state)) {
    failedChecks.push('contraction_witness');
    violations.contraction_witness = `Contraction witness score is not perfect. Score: ${state.contractionWitnessScore}, required: ${CONTRACTION_WITNESS_THRESHOLD}`;
  }
  
  return {
    passed: failedChecks.length === 0,
    failedChecks,
    violations: failedChecks.length > 0 ? violations : undefined,
  };
}

/**
 * Error thrown when L0 invariants are violated
 */
export class InvariantViolationError extends Error {
  public readonly result: InvariantCheckResult;
  
  constructor(result: InvariantCheckResult) {
    const message = `L0 Invariant Violation: ${result.failedChecks.join(', ')}`;
    super(message);
    this.name = 'InvariantViolationError';
    this.result = result;
  }
}

/**
 * Helper to create a valid state for testing
 */
export function createValidState(overrides?: Partial<State>): State {
  const defaults: State = {
    schemaVersion: EXPECTED_SCHEMA_VERSION,
    schemaHash: EXPECTED_SCHEMA_HASH,
    permissionBits: 0b0000111111111111, // All defined bits set, no reserved bits
    driftMagnitude: 0.15, // Well below threshold
    nonce: {
      value: 'a'.repeat(64), // Valid 64-char nonce
      issuedAt: Date.now(),
    },
    contractionWitnessScore: 1.0, // Perfect coherence
  };
  
  return {
    ...defaults,
    ...overrides,
    // Handle nested nonce overrides properly
    nonce: {
      ...defaults.nonce,
      ...(overrides?.nonce || {}),
    },
  };
}

// Export new flexible validator API
export {
  L0Validator,
  type L0ValidatorConfig,
  type L0ValidationInput,
  type L0ValidationResult,
} from './validator.js';
