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

export interface CalibrationConfidence {
  level: number; // 0.0 - 1.0
  category: 'high' | 'medium' | 'low' | 'insufficient';
  factors: {
    contributorCountFactor: number;
    agreementFactor: number;
    eventCountFactor: number;
    reputationFactor: number;
  };
  lowConfidenceReason?: string;
}

export interface ByzantineFilterSummary {
  filteringApplied: boolean;
  filterRate: number;
  outliersFiltered: number;
  lowReputationFiltered: number;
  zScoreThreshold: number;
  reputationPercentile: number;
}

export interface CalibrationResultExtended {
  ruleId: string;
  consensusFpRate: number;
  trustedContributorCount: number;
  totalContributorCount: number;
  totalEventCount: number;
  calculatedAt: Date;
  confidence: CalibrationConfidence;
  byzantineFilterSummary: ByzantineFilterSummary;
}

export interface RawContribution {
  orgIdHash: string;
  fpRate: number;
  eventCount: number;
}

export interface ByzantineFilterConfig {
  zScoreThreshold: number;
  byzantineFilterPercentile: number;
  minContributorsForFiltering: number;
  requireStake: boolean;
  requireMinimumReputation: boolean;
  minimumReputationScore: number;
}

export interface FilteredContributor {
  orgIdHash: string;
  fpRate: number;
  weight: number;
  reason: 'insufficient_data' | 'below_minimum_reputation' | 'no_stake' | 'statistical_outlier' | 'low_reputation';
  details: string;
}

export interface ContributionWeightFactors {
  baseReputation: number;
  stakeMultiplier: number;
  consistencyBonus: number;
  totalMultiplier: number;
}

export interface WeightedContribution {
  orgIdHash: string;
  fpRate: number;
  weight: number;
  eventCount: number;
  zScore: number;
  weightFactors: ContributionWeightFactors;
}

export interface FilterStatistics {
  meanFpRate: number;
  stdDevFpRate: number;
  medianFpRate: number;
  trustedMeanFpRate: number;
  meanWeight: number;
  weightPercentileThreshold: number;
  outlierCount: number;
  reputationFilteredCount: number;
}

export interface ByzantineFilterResult {
  trustedContributors: WeightedContribution[];
  outlierFiltered: FilteredContributor[];
  reputationFiltered: FilteredContributor[];
  otherFiltered: FilteredContributor[];
  totalContributors: number;
  trustedCount: number;
  filterRate: number;
  statistics: FilterStatistics;
}
