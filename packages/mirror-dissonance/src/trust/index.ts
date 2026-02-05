/**
 * Trust Module - Public API
 * 
 * Cryptographic Trust Architecture for Phase Mirror's network effect.
 * Provides identity verification, reputation tracking, and Byzantine fault tolerance.
 */

// Identity types and interfaces
export {
  VerificationMethod,
  OrganizationIdentity,
  IdentityVerificationResult,
  IGitHubVerifier,
  IStripeVerifier,
} from './identity/types.js';

// Identity verifiers
export { GitHubVerifier } from './identity/github-verifier.js';
export { StripeVerifier } from './identity/stripe-verifier.js';

// Revenue tracking (optional)
export {
  RevenueTrackingService,
  RevenueStats,
  RevenueVerifiedOrg,
} from './identity/revenue-tracking.js';

// Nonce binding
export {
  NonceBinding,
  NonceBindingResult,
  NonceVerificationResult,
  NonceBindingService,
} from './identity/nonce-binding.js';

// Reputation types
export {
  OrganizationReputation,
  StakePledge,
  ContributionWeight,
  ContributionRecord,
  ConsistencyMetrics,
  ConsistencyScoreConfig,
  ConsistencyScoreResult,
  ConsensusFpRate,
} from './reputation/types.js';

// Reputation engine
export {
  ReputationEngine,
  ReputationEngineConfig,
} from './reputation/reputation-engine.js';

// Consistency score calculator
export { ConsistencyScoreCalculator } from './reputation/consistency-calculator.js';

// Weight calculator utilities
export {
  calculateWeight,
  filterByzantineActors,
} from './reputation/weight-calculator.js';

// Byzantine filter
export { ByzantineFilter } from './reputation/byzantine-filter.js';

// Adapter interfaces
export {
  IIdentityStoreAdapter,
  IReputationStoreAdapter,
} from './adapters/types.js';

// Local adapters
export {
  createLocalTrustAdapters,
  TrustAdapters as LocalTrustAdapters,
} from './adapters/local/index.js';

// AWS adapters
export {
  createAWSTrustAdapters,
  TrustAdapters as AWSTrustAdapters,
} from './adapters/aws/index.js';
