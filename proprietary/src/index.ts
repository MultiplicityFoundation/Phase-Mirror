/**
 * @phase-mirror/pro — Phase Mirror Pro Extensions
 *
 * Requires a valid Phase Mirror Pro license for production use.
 * @license SEE LICENSE IN LICENSE
 */

export { requirePro, hasPro, hasFeature, ProLicenseRequiredError } from './license-gate';
export type { ProLicense, LicenseContext } from './license-gate';

// Tier B rules (uncomment as implemented)
// export { semanticJobDrift } from './rules/tier-b/MD-100';
// export { crossRepoProtectionGap } from './rules/tier-b/MD-101';
// export { runnerTrustChainBreak } from './rules/tier-b/MD-102';

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
