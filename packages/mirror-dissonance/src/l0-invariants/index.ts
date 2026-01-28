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
   * Schema version and hash
   * Format: "version:hash" (e.g., "1.0:abc123")
   */
  schemaVersion: string;
  
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
  contractionWitnessScore: number;
}

/**
 * Result of L0 invariant check
 */
export interface L0Result {
  /**
   * Whether all L0 checks passed
   */
  passed: boolean;
  
  /**
   * List of failed check names (empty if all passed)
   */
  failedChecks: string[];
  
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
const EXPECTED_SCHEMA_VERSION = '1.0';
const EXPECTED_SCHEMA_HASH = 'f7a8b9c0'; // Placeholder, would be computed from actual schema

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
  const [version, hash] = state.schemaVersion.split(':');
  return version === EXPECTED_SCHEMA_VERSION && hash === EXPECTED_SCHEMA_HASH;
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
         state.driftMagnitude < DRIFT_THRESHOLD;
}

/**
 * Check if nonce is fresh (not expired)
 * 
 * @param state - State to check
 * @param nowMs - Current time in milliseconds (for testing)
 * @returns true if nonce is fresh, false otherwise
 */
function checkNonceFreshness(state: State, nowMs?: number): boolean {
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
 * @returns L0Result indicating pass/fail and details
 */
export function checkL0Invariants(state: State, nowMs?: number): L0Result {
  const startNs = process.hrtime.bigint();
  
  const failedChecks: string[] = [];
  const context: Record<string, unknown> = {};
  
  // Check 1: Schema hash
  if (!checkSchemaHash(state)) {
    failedChecks.push('schema_hash');
    context.schemaVersion = state.schemaVersion;
    context.expectedVersion = EXPECTED_SCHEMA_VERSION;
    context.expectedHash = EXPECTED_SCHEMA_HASH;
  }
  
  // Check 2: Permission bits
  if (!checkPermissionBits(state)) {
    failedChecks.push('permission_bits');
    context.permissionBits = state.permissionBits;
    context.reservedBitsMask = RESERVED_PERMISSION_BITS_MASK;
  }
  
  // Check 3: Drift magnitude
  if (!checkDriftMagnitude(state)) {
    failedChecks.push('drift_magnitude');
    context.driftMagnitude = state.driftMagnitude;
    context.driftThreshold = DRIFT_THRESHOLD;
  }
  
  // Check 4: Nonce freshness
  if (!checkNonceFreshness(state, nowMs)) {
    failedChecks.push('nonce_freshness');
    context.nonceIssuedAt = state.nonce.issuedAt;
    context.nonceAge = (nowMs ?? Date.now()) - state.nonce.issuedAt;
    context.nonceLifetime = NONCE_LIFETIME_MS;
  }
  
  // Check 5: Contraction witness
  if (!checkContractionWitness(state)) {
    failedChecks.push('contraction_witness');
    context.witnessScore = state.contractionWitnessScore;
    context.witnessThreshold = CONTRACTION_WITNESS_THRESHOLD;
  }
  
  const endNs = process.hrtime.bigint();
  const latencyNs = Number(endNs - startNs);
  
  return {
    passed: failedChecks.length === 0,
    failedChecks,
    latencyNs,
    context,
  };
}

/**
 * Error thrown when L0 invariants are violated
 */
export class InvariantViolationError extends Error {
  constructor(
    message: string,
    public readonly failedChecks: string[],
    public readonly context: Record<string, unknown>
  ) {
    super(message);
    this.name = 'InvariantViolationError';
  }
}

/**
 * Helper to create a valid state for testing
 */
export function createValidState(overrides?: Partial<State>): State {
  return {
    schemaVersion: `${EXPECTED_SCHEMA_VERSION}:${EXPECTED_SCHEMA_HASH}`,
    permissionBits: 0b0000111111111111, // All defined bits set, no reserved bits
    driftMagnitude: 0.15, // Well below threshold
    nonce: {
      value: 'test-nonce-' + Date.now(),
      issuedAt: Date.now(),
    },
    contractionWitnessScore: 1.0, // Perfect coherence
    ...overrides,
  };
}
