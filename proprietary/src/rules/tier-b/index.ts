/**
 * Tier B Rule Registry — Proprietary semantic rules
 *
 * @license Phase Mirror Pro License v1.0
 */

export { rule as MD100 } from './MD-100.js';
export { rule as MD101 } from './MD-101.js';
export { rule as MD102 } from './MD-102.js';
export { evaluateMD102Federated } from './MD-102-federated.js';

import { rule as MD100 } from './MD-100.js';
import { rule as MD101 } from './MD-101.js';
import { rule as MD102 } from './MD-102.js';
import type { RuleDefinition } from '../types.js';

export const tierBRules: RuleDefinition[] = [MD100, MD101, MD102];

// Re-export policy manifest types for consumers
export type {
  OrgPolicyManifest,
  OrgMergeQueuePolicy,
  PolicyExpectation,
  PolicyExemption,
  RepoClassification,
} from './policy-manifest.js';
export { resolveExpectationsForRepo, validateManifest } from './policy-manifest.js';
