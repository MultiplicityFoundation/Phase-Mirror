/**
 * Schema definitions for Mirror Dissonance Protocol
 */

export interface MachineDecision {
  outcome: 'allow' | 'block' | 'warn';
  reasons: string[];
  metadata: {
    timestamp: string;
    mode: string;
    rulesEvaluated: string[];
  };
}

export interface RuleViolation {
  ruleId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  context: Record<string, unknown>;
}

export interface OracleInput {
  mode: 'pull_request' | 'merge_group' | 'drift' | 'calibration';
  strict?: boolean;
  dryRun?: boolean;
  baselineFile?: string;
  context: {
    repositoryName?: string;
    prNumber?: number;
    commitSha?: string;
    branch?: string;
    author?: string;
  };
}

export interface OracleOutput {
  machineDecision: MachineDecision;
  violations: RuleViolation[];
  summary: string;
  report: {
    rulesChecked: number;
    violationsFound: number;
    criticalIssues: number;
  };
}

export interface FalsePositiveEvent {
  id: string;
  findingId: string;
  ruleId: string;
  timestamp: string;
  resolvedBy: string;
  context: Record<string, unknown>;
  orgIdHash?: string;
  consent?: ConsentType;
}

export interface BlockCounterEntry {
  bucketKey: string;
  timestamp: number;
  count: number;
  ttl: number;
}

export interface NonceConfig {
  value: string;
  loadedAt: string;
  source: string;
}

/**
 * Phase 2: FP Calibration Service Types
 */

export type ConsentType = 'explicit' | 'implicit' | 'none';

export interface ConsentRecord {
  orgId: string;
  consentType: ConsentType;
  grantedAt: string;
  expiresAt?: string;
  scope: string[];
}

export interface IngestEvent {
  orgId: string;
  ruleId: string;
  isFalsePositive: boolean;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AnonymizedIngestEvent {
  orgIdHash: string;
  ruleId: string;
  isFalsePositive: boolean;
  timestamp: string;
  consent: ConsentType;
}

export interface CalibrationQuery {
  ruleId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CalibrationResult {
  ruleId: string;
  totalFPs: number;
  orgCount: number;
  averageFPsPerOrg: number;
  meetsKAnonymity: boolean;
}

export interface KAnonymityError {
  error: 'INSUFFICIENT_K_ANONYMITY';
  message: string;
  requiredK: number;
  actualK: number;
}
