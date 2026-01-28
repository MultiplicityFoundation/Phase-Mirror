/**
 * Decision thresholds for Mirror Dissonance Protocol
 */

export interface Thresholds {
  blockOnCritical: boolean;
  maxCriticalViolations: number;
  maxHighViolations: number;
  maxMediumViolations: number;
  circuitBreakerThreshold: number; // max blocks per hour before circuit breaker trips
  strictMode: boolean;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  blockOnCritical: true,
  maxCriticalViolations: 0,
  maxHighViolations: 3,
  maxMediumViolations: 10,
  circuitBreakerThreshold: 100,
  strictMode: false,
};

export const STRICT_THRESHOLDS: Thresholds = {
  blockOnCritical: true,
  maxCriticalViolations: 0,
  maxHighViolations: 0,
  maxMediumViolations: 5,
  circuitBreakerThreshold: 50,
  strictMode: true,
};

export function getThresholds(strict: boolean = false): Thresholds {
  return strict ? STRICT_THRESHOLDS : DEFAULT_THRESHOLDS;
}

export function shouldBlock(
  criticalCount: number,
  highCount: number,
  mediumCount: number,
  thresholds: Thresholds
): boolean {
  if (thresholds.blockOnCritical && criticalCount > thresholds.maxCriticalViolations) {
    return true;
  }

  if (highCount > thresholds.maxHighViolations) {
    return true;
  }

  if (mediumCount > thresholds.maxMediumViolations) {
    return true;
  }

  return false;
}
