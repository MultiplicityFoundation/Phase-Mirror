/**
 * @phase-mirror/pro — Phase Mirror Pro Extensions
 *
 * Requires a valid Phase Mirror Pro license for production use.
 * @license SEE LICENSE IN LICENSE
 */

export { requirePro, hasPro, hasFeature, ProLicenseRequiredError } from './license-gate.js';
export type { ProLicense, LicenseContext } from './license-gate.js';

// Tier B rule type contracts
export type {
  RuleDefinition,
  Finding,
  AnalysisContext,
  FindingEvidence,
  FPToleranceConfig,
  PromotionCriteria,
} from './rules/types.js';

// Tier B rules
export { rule as semanticJobDrift } from './rules/tier-b/MD-100.js';
export { rule as crossRepoProtectionGap } from './rules/tier-b/MD-101.js';
export { MD100, MD101, tierBRules } from './rules/tier-b/index.js';
// export { runnerTrustChainBreak } from './rules/tier-b/MD-102';

// Policy manifest types + utilities
export type {
  OrgPolicyManifest,
  PolicyExpectation,
  PolicyExemption,
  RepoClassification,
} from './rules/tier-b/policy-manifest.js';
export {
  resolveExpectationsForRepo,
  validateManifest,
} from './rules/tier-b/policy-manifest.js';

// Cross-repo types (MD-101)
export type {
  OrgContext,
  RepoGovernanceState,
} from './rules/tier-b/MD-101.js';

// Production infrastructure (uncomment as implemented)
// export { DynamoDBFPStore } from './infra/fp-store/dynamodb';
// export { RedisFPStore } from './infra/fp-store/redis';
// export { DynamoDBBlockCounter } from './infra/block-counter/dynamodb';

// Compliance packs (uncomment as implemented)
// export { soc2Pack } from './compliance/soc2';
// export { hipaaPack } from './compliance/hipaa';

// Calibration (uncomment as implemented)
// export { CalibrationAggregator } from './calibration/aggregator';
// export { MultiTenantConsent } from './calibration/consent';
