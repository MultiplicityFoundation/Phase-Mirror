/**
 * Core Domain Errors — ADR-030
 *
 * Typed errors for L0 invariant violations and infrastructure degradation.
 * These cross-cut the entire core library and are consumed by CLI, MCP, and
 * any future surface.
 *
 * Rules:
 * - L0InvariantViolation → always exit 1 (fail-closed, all tiers)
 * - OracleDegradedError  → exit 2 (degraded, free tier) or 1 (paid tier)
 * - Store operations MUST throw these on failure — never return [] or null
 *
 * @see docs/adr/ADR-030-error-propagation-degraded-modes.md
 */

/**
 * Degradation reasons — each maps to an infrastructure dependency.
 */
export type DegradationReason =
  | 'FP_STORE_UNAVAILABLE'
  | 'DRIFT_BASELINE_MISSING'
  | 'NONCE_PARAMETER_MISSING'
  | 'RULE_REGISTRY_LOAD_FAILED'
  | 'CONSENT_STORE_UNAVAILABLE'
  | 'CALIBRATION_STORE_UNAVAILABLE';

/**
 * Pricing tiers that determine fail behavior for infrastructure errors.
 */
export type ServiceTier = 'community' | 'team' | 'business' | 'enterprise';

/**
 * Thrown when non-L0 infrastructure is unavailable.
 *
 * `canProceed` is determined by tier:
 *   - community (free CLI): true  → exit 2 (degraded, non-blocking)
 *   - team/business/enterprise:   false → exit 1 (hard fail + ops escalation)
 */
export class OracleDegradedError extends Error {
  public readonly name = 'OracleDegradedError' as const;

  constructor(
    public readonly reason: DegradationReason,
    public readonly canProceed: boolean,
    public readonly evidence: Record<string, unknown>,
    public readonly tier: ServiceTier,
  ) {
    super(`Oracle degraded: ${reason}`);
  }
}

/**
 * Thrown when an L0 invariant is violated.
 *
 * L0 violations always hard-fail (exit 1) regardless of tier.
 * They MUST NOT be caught and silently swallowed — the error propagation
 * contract mandates fail-closed behavior at every layer.
 */
export class L0InvariantViolation extends Error {
  public readonly name = 'L0InvariantViolation' as const;

  constructor(
    public readonly invariantId: string,
    public readonly evidence: Record<string, unknown>,
  ) {
    super(`L0 invariant violated: ${invariantId}`);
  }
}
