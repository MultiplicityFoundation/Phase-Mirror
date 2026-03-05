/**
 * @phase-mirror/pro — Phase Mirror Pro Extensions
 *
 * Requires a valid Phase Mirror Pro license for production use.
 * @license SEE LICENSE IN LICENSE
 */
export { requirePro, hasPro, hasFeature, ProLicenseRequiredError } from './license-gate.js';
export type { ProLicense, LicenseContext } from './license-gate.js';
export type { RuleDefinition, Finding, AnalysisContext, FindingEvidence, FPToleranceConfig, PromotionCriteria, } from './rules/types.js';
export { rule as semanticJobDrift } from './rules/tier-b/MD-100.js';
export { rule as crossRepoProtectionGap } from './rules/tier-b/MD-101.js';
export { rule as mergeQueueTrustChainBreak } from './rules/tier-b/MD-102.js';
export { MD100, MD101, MD102, tierBRules } from './rules/tier-b/index.js';
export { evaluateMD102Federated } from './rules/tier-b/MD-102-federated.js';
export type { OrgPolicyManifest, OrgMergeQueuePolicy, PolicyExpectation, PolicyExemption, RepoClassification, } from './rules/tier-b/policy-manifest.js';
export { resolveExpectationsForRepo, validateManifest, } from './rules/tier-b/policy-manifest.js';
export type { OrgContext, RepoGovernanceState, } from './rules/tier-b/MD-101.js';
export type { OrgAggregatorConfig, OrgAggregator, GovernanceCacheAdapter, } from './federation/org-aggregator.js';
export { GitHubClient, DynamoDBGovernanceCache, NotFoundError, RateLimitError, fetchLiveOrgState, persistOrgState, loadCachedOrgState, buildOrgContext, } from './federation/org-aggregator.js';
