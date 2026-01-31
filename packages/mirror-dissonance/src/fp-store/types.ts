/**
 * Types for FP Calibration Service - Day 8
 * Enhanced False Positive Event tracking with windowed statistics
 */

export interface FPEvent {
  eventId: string;           // UUID
  ruleId: string;            // e.g., "MD-001"
  ruleVersion: string;       // e.g., "1.2.0"
  findingId: string;         // Hash of finding content
  outcome: 'block' | 'warn' | 'pass';
  suppressionTicket?: string;
  reviewedBy?: string;
  reviewedAt?: Date;
  isFalsePositive: boolean;  // Explicit marking
  timestamp: Date;
  context: {
    repo: string;
    branch: string;
    eventType: 'pull_request' | 'merge_group' | 'drift';
  };
}

export interface FPWindow {
  ruleId: string;
  ruleVersion: string;
  windowSize: number;
  events: FPEvent[];
  statistics: {
    total: number;
    falsePositives: number;
    truePositives: number;
    pending: number;           // Not yet reviewed
    observedFPR: number;       // FP / (total - pending)
  };
}

export interface FPStoreConfig {
  tableName: string;
  region: string;
  ttlDays?: number;            // Default: 90
}

/**
 * FPStore interface for managing false positive events
 */
export interface FPStore {
  /**
   * Record a new FP event
   */
  recordEvent(event: FPEvent): Promise<void>;
  
  /**
   * Mark a finding as a false positive
   */
  markFalsePositive(findingId: string, reviewedBy: string, ticket: string): Promise<void>;
  
  /**
   * Get a time window of events by count
   */
  getWindowByCount(ruleId: string, count: number): Promise<FPWindow>;
  
  /**
   * Get a time window of events since a given date
   */
  getWindowBySince(ruleId: string, since: Date): Promise<FPWindow>;
}
