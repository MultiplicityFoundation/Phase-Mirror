/**
 * Proprietary Rule Type Definitions
 *
 * These interfaces define the contract for Tier B (and above) rules.
 * They extend the open-core concepts with Pro-specific fields like
 * fpTolerance, promotionCriteria, and structured evidence.
 *
 * TODO: Once open-core exports RuleDefinition/Finding from
 * @mirror-dissonance/core, import base types from there and extend.
 *
 * @license Phase Mirror Pro License v1.0
 */

import type { LicenseContext } from '../license-gate.js';

// ─── Analysis Context ────────────────────────────────────────────────

export interface FileEntry {
  path: string;
  content?: string;
}

export interface AnalysisContext extends LicenseContext {
  repositoryName?: string;
  owner?: string;
  commitSha?: string;
  branch?: string;
  files?: FileEntry[];
  repo?: { owner: string; name: string };
  mode?: 'pullrequest' | 'push' | 'schedule' | 'manual';
  [key: string]: unknown;
}

// ─── Finding ─────────────────────────────────────────────────────────

export interface FindingEvidence {
  path: string;
  line: number;
  context: Record<string, unknown>;
}

export interface Finding {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'block' | 'high' | 'warn' | 'pass';
  title: string;
  description: string;
  evidence: FindingEvidence[];
  remediation: string;
  adrReferences?: string[];
}

// ─── Rule Definition ─────────────────────────────────────────────────

export interface FPToleranceConfig {
  ceiling: number;
  window: number;
}

export interface PromotionCriteria {
  minWindowN: number;
  maxObservedFPR: number;
  minRedTeamCases: number;
  minDaysInWarn: number;
  requiredApprovers: string[];
}

export interface RuleDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  tier: 'A' | 'B';
  severity: 'block' | 'high' | 'warn' | 'pass';
  category: string;
  fpTolerance: FPToleranceConfig;
  promotionCriteria: PromotionCriteria;
  adrReferences: string[];
  evaluate: (context: AnalysisContext) => Promise<Finding[]>;
}
