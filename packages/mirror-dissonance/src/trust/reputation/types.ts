/**
 * Reputation System Types
 * 
 * Types for organization reputation tracking, stake management,
 * and contribution weighting for Byzantine fault tolerance.
 */

export interface OrganizationReputation {
  orgId: string;
  reputationScore: number;      // Overall reputation (0.0-1.0)
  stakePledge: number;          // Economic stake (USD)
  contributionCount: number;    // Total contributions
  flaggedCount: number;         // Times flagged as suspicious
  consistencyScore: number;     // Consensus alignment (0.0-1.0)
  ageScore: number;             // Account longevity (0.0-1.0)
  volumeScore: number;          // Usage volume (0.0-1.0)
  lastUpdated: Date;
  stakeStatus: 'active' | 'slashed' | 'withdrawn';
}

export interface StakePledge {
  orgId: string;
  amountUsd: number;
  pledgedAt: Date;
  status: 'active' | 'slashed' | 'withdrawn';
  slashReason?: string;
}

export interface ContributionWeight {
  orgId: string;
  weight: number;               // 0.0 - 1.0
  factors: {
    baseReputation: number;
    stakeMultiplier: number;
    consistencyBonus: number;
  };
}

// ═══════════════════════════════════════════════════════════
// Consistency Scoring Types
// ═══════════════════════════════════════════════════════════

/**
 * Contribution record for consistency scoring.
 * 
 * Tracks an organization's FP rate contribution for a specific rule
 * along with the consensus rate at the time of contribution.
 */
export interface ContributionRecord {
  /** Organization ID (for linking to reputation) */
  orgId: string;
  
  /** Rule ID this contribution is for */
  ruleId: string;
  
  /** FP rate contributed by this organization (0.0-1.0) */
  contributedFpRate: number;
  
  /** Consensus FP rate at time of contribution (0.0-1.0) */
  consensusFpRate: number;
  
  /** When this contribution was made */
  timestamp: Date;
  
  /** Number of FP events contributed (for confidence weighting) */
  eventCount: number;
  
  /** Absolute deviation from consensus */
  deviation: number;
  
  /** Consistency score for this contribution (1 - deviation) */
  consistencyScore: number;
}

/**
 * Aggregated consistency metrics for an organization.
 */
export interface ConsistencyMetrics {
  /** Organization ID */
  orgId: string;
  
  /** Overall consistency score (0.0-1.0) */
  overallScore: number;
  
  /** Number of rules contributed to */
  rulesContributed: number;
  
  /** Number of contributions considered (after filtering) */
  contributionsConsidered: number;
  
  /** Average deviation from consensus across all rules */
  averageDeviation: number;
  
  /** Standard deviation of deviations (consistency variance) */
  deviationStdDev: number;
  
  /** Number of outlier contributions (deviation > threshold) */
  outlierCount: number;
  
  /** Most recent contribution timestamp */
  lastContributionDate: Date;
  
  /** Age of oldest contribution considered (days) */
  oldestContributionAge: number;
}

/**
 * Configuration for consistency score calculation.
 */
export interface ConsistencyScoreConfig {
  /** Decay rate for exponential time weighting (default: 0.01) */
  decayRate: number;
  
  /** Maximum age of contributions to consider in days (default: 180) */
  maxContributionAge: number;
  
  /** Minimum number of contributions required for score (default: 3) */
  minContributionsRequired: number;
  
  /** Deviation threshold for outlier detection (default: 0.3) */
  outlierThreshold: number;
  
  /** Minimum event count per contribution to consider (default: 1) */
  minEventCount: number;
  
  /** Whether to exclude outliers from score calculation (default: false) */
  excludeOutliersFromScore: boolean;
  
  /** Cap on maximum consistency bonus (default: 0.2) */
  maxConsistencyBonus: number;
}

/**
 * Result of consistency score calculation.
 */
export interface ConsistencyScoreResult {
  /** Calculated consistency score (0.0-1.0) */
  score: number;
  
  /** Detailed metrics */
  metrics: ConsistencyMetrics;
  
  /** Contribution records used in calculation */
  contributions: ContributionRecord[];
  
  /** Whether org has sufficient data for reliable score */
  hasMinimumData: boolean;
  
  /** Reason if score is unreliable */
  unreliableReason?: string;
}

/**
 * Consensus FP rate for a rule.
 */
export interface ConsensusFpRate {
  /** Rule ID */
  ruleId: string;
  
  /** Consensus FP rate (weighted average across orgs) */
  consensusRate: number;
  
  /** Number of organizations that contributed */
  contributorCount: number;
  
  /** Total event count across all contributors */
  totalEventCount: number;
  
  /** Standard deviation of contributed rates */
  rateStdDev: number;
  
  /** When this consensus was calculated */
  calculatedAt: Date;
}

// ═══════════════════════════════════════════════════════════
// Byzantine Filter Types
// ═══════════════════════════════════════════════════════════

/**
 * Raw contribution data before filtering.
 */
export interface RawContribution {
  /** Organization ID hash */
  orgIdHash: string;
  
  /** FP rate contributed */
  fpRate: number;
  
  /** Number of FP events */
  eventCount: number;
}

/**
 * Weighted contribution after Byzantine filtering.
 */
export interface WeightedContribution {
  /** Organization ID hash */
  orgIdHash: string;
  
  /** FP rate */
  fpRate: number;
  
  /** Weight assigned to this contribution */
  weight: number;
  
  /** Number of FP events */
  eventCount: number;
  
  /** Z-score for statistical outlier detection */
  zScore: number;
  
  /** Breakdown of weight factors */
  weightFactors: ContributionWeightFactors;
}

/**
 * Breakdown of contribution weight factors.
 */
export interface ContributionWeightFactors {
  /** Base reputation component */
  baseReputation: number;
  
  /** Stake multiplier component */
  stakeMultiplier: number;
  
  /** Consistency bonus component */
  consistencyBonus: number;
  
  /** Total multiplier (sum of all factors) */
  totalMultiplier: number;
}

/**
 * Contributor that was filtered out by Byzantine filter.
 */
export interface FilteredContributor {
  /** Organization ID hash */
  orgIdHash: string;
  
  /** FP rate that was filtered */
  fpRate: number;
  
  /** Weight that was assigned */
  weight: number;
  
  /** Reason for filtering */
  reason: 'statistical_outlier' | 'low_reputation' | 'no_stake' | 'below_minimum_reputation' | 'insufficient_data';
  
  /** Additional details */
  details: string;
}

/**
 * Statistical summary of Byzantine filtering.
 */
export interface FilterStatistics {
  /** Mean FP rate of all valid contributions */
  meanFpRate: number;
  
  /** Standard deviation of FP rates */
  stdDevFpRate: number;
  
  /** Median FP rate */
  medianFpRate: number;
  
  /** Mean FP rate of trusted contributors only */
  trustedMeanFpRate: number;
  
  /** Mean weight across all contributors */
  meanWeight: number;
  
  /** Weight percentile threshold used for filtering */
  weightPercentileThreshold: number;
  
  /** Number of outliers filtered */
  outlierCount: number;
  
  /** Number filtered due to low reputation */
  reputationFilteredCount: number;
}

/**
 * Configuration for Byzantine filter.
 */
export interface ByzantineFilterConfig {
  /** Z-score threshold for outlier detection (default: 3.0) */
  zScoreThreshold: number;
  
  /** Filter out bottom X percentile by reputation (default: 0.2) */
  byzantineFilterPercentile: number;
  
  /** Minimum contributors needed for statistical filtering (default: 5) */
  minContributorsForFiltering: number;
  
  /** Require economic stake (default: false) */
  requireStake: boolean;
  
  /** Require minimum reputation score (default: true) */
  requireMinimumReputation: boolean;
  
  /** Minimum reputation score threshold (default: 0.1) */
  minimumReputationScore: number;
}

/**
 * Result of Byzantine filtering.
 */
export interface ByzantineFilterResult {
  /** Trusted contributors after filtering */
  trustedContributors: WeightedContribution[];
  
  /** Contributors filtered as outliers */
  outlierFiltered: FilteredContributor[];
  
  /** Contributors filtered due to low reputation */
  reputationFiltered: FilteredContributor[];
  
  /** Contributors filtered for other reasons */
  otherFiltered: FilteredContributor[];
  
  /** Total number of contributors before filtering */
  totalContributors: number;
  
  /** Number of trusted contributors after filtering */
  trustedCount: number;
  
  /** Filter rate (proportion filtered out) */
  filterRate: number;
  
  /** Statistical summary */
  statistics: FilterStatistics;
}

/**
 * Confidence metrics for calibration result.
 */
export interface CalibrationConfidence {
  /** Overall confidence level (0.0-1.0) */
  level: number;
  
  /** Categorical confidence rating */
  category: 'high' | 'medium' | 'low' | 'insufficient';
  
  /** Breakdown of confidence factors */
  factors: {
    contributorCountFactor: number;
    agreementFactor: number;
    eventCountFactor: number;
    reputationFactor: number;
  };
  
  /** Reason if confidence is low */
  lowConfidenceReason?: string;
}

/**
 * Summary of Byzantine filtering for calibration result.
 */
export interface ByzantineFilterSummary {
  /** Whether Byzantine filtering was applied */
  filteringApplied: boolean;
  
  /** Proportion of contributors filtered out */
  filterRate: number;
  
  /** Number of outliers filtered */
  outliersFiltered: number;
  
  /** Number filtered due to low reputation */
  lowReputationFiltered: number;
  
  /** Z-score threshold used */
  zScoreThreshold: number;
  
  /** Reputation percentile threshold used */
  reputationPercentile: number;
}

/**
 * Extended calibration result with Byzantine fault tolerance.
 */
export interface CalibrationResultExtended {
  /** Rule ID */
  ruleId: string;
  
  /** Consensus FP rate (weighted average) */
  consensusFpRate: number;
  
  /** Number of trusted contributors */
  trustedContributorCount: number;
  
  /** Total number of contributors before filtering */
  totalContributorCount: number;
  
  /** Total number of FP events */
  totalEventCount: number;
  
  /** When this was calculated */
  calculatedAt: Date;
  
  /** Confidence metrics */
  confidence: CalibrationConfidence;
  
  /** Byzantine filter summary */
  byzantineFilterSummary: ByzantineFilterSummary;
}
