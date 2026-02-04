/**
 * Reputation System Types
 * 
 * Types for organization reputation tracking, stake management,
 * and contribution weighting for Byzantine fault tolerance.
 */

export interface OrganizationReputation {
  orgId: string;
  reputationScore: number;      // 0.0 - 1.0
  stakePledge: number;          // Economic stake (USD)
  contributionCount: number;
  flaggedCount: number;         // Times flagged as suspicious
  consistencyScore: number;     // How consistent with network
  ageScore: number;             // How long org has existed
  volumeScore: number;          // How much legitimate usage
  lastUpdated: Date;
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
// NEW: Byzantine Filtering Types
// ═══════════════════════════════════════════════════════════

/**
 * Raw contribution data before filtering.
 */
export interface RawContribution {
  /** Organization ID (hashed) */
  orgIdHash: string;
  
  /** Contributed FP rate */
  fpRate: number;
  
  /** Number of FP events contributed */
  eventCount: number;
}

/**
 * Configuration for Byzantine actor filtering.
 */
export interface ByzantineFilterConfig {
  /** Z-score threshold for outlier detection (default: 3.0) */
  zScoreThreshold: number;
  
  /** Bottom percentile of contributors to exclude (default: 0.2 = 20%) */
  byzantineFilterPercentile: number;
  
  /** Minimum number of contributors for statistical filtering (default: 5) */
  minContributorsForFiltering: number;
  
  /** Whether to exclude orgs with zero stake (default: false) */
  requireStake: boolean;
  
  /** Whether to exclude orgs below minimum reputation (default: true) */
  requireMinimumReputation: boolean;
  
  /** Minimum reputation score to participate (default: 0.1) */
  minimumReputationScore: number;
}

/**
 * Result of Byzantine filtering operation.
 */
export interface ByzantineFilterResult {
  /** Contributors that passed all filters */
  trustedContributors: WeightedContribution[];
  
  /** Contributors filtered out as outliers (Z-score) */
  outlierFiltered: FilteredContributor[];
  
  /** Contributors filtered out by reputation percentile */
  reputationFiltered: FilteredContributor[];
  
  /** Contributors filtered for other reasons (no stake, below minimum rep) */
  otherFiltered: FilteredContributor[];
  
  /** Total number of original contributors */
  totalContributors: number;
  
  /** Number of trusted contributors after filtering */
  trustedCount: number;
  
  /** Filter rate (% excluded) */
  filterRate: number;
  
  /** Statistical summary of filtering */
  statistics: FilterStatistics;
}

/**
 * A contributor that was filtered out.
 */
export interface FilteredContributor {
  /** Organization ID (hashed) */
  orgIdHash: string;
  
  /** Contributed FP rate */
  fpRate: number;
  
  /** Reputation weight at time of filtering */
  weight: number;
  
  /** Reason for filtering */
  reason: 'statistical_outlier' | 'low_reputation' | 'no_stake' | 'below_minimum_reputation' | 'insufficient_data';
  
  /** Additional details (e.g., Z-score value) */
  details?: string;
}

/**
 * A weighted contribution for consensus calculation.
 */
export interface WeightedContribution {
  /** Organization ID (hashed) */
  orgIdHash: string;
  
  /** Contributed FP rate */
  fpRate: number;
  
  /** Reputation weight */
  weight: number;
  
  /** Number of FP events contributed */
  eventCount: number;
  
  /** Z-score of this contribution (for reference) */
  zScore: number;
  
  /** Weight factors breakdown */
  weightFactors: ContributionWeightFactors;
}

/**
 * Breakdown of weight factors for a contribution.
 */
export interface ContributionWeightFactors {
  baseReputation: number;
  stakeMultiplier: number;
  consistencyBonus: number;
  totalMultiplier: number;
}

/**
 * Statistical summary of Byzantine filtering.
 */
export interface FilterStatistics {
  /** Mean FP rate across all contributors */
  meanFpRate: number;
  
  /** Standard deviation of FP rates */
  stdDevFpRate: number;
  
  /** Median FP rate */
  medianFpRate: number;
  
  /** Mean FP rate after filtering (trusted only) */
  trustedMeanFpRate: number;
  
  /** Mean reputation weight */
  meanWeight: number;
  
  /** Weight threshold for percentile filtering */
  weightPercentileThreshold: number;
  
  /** Number of outliers detected */
  outlierCount: number;
  
  /** Number filtered by reputation */
  reputationFilteredCount: number;
}

// ═══════════════════════════════════════════════════════════
// NEW: Calibration Result Types
// ═══════════════════════════════════════════════════════════

/**
 * Complete calibration result with Byzantine filtering metadata.
 */
export interface CalibrationResultExtended {
  /** Rule ID */
  ruleId: string;
  
  /** Consensus FP rate (weighted average of trusted contributors) */
  consensusFpRate: number;
  
  /** Number of trusted contributors (after filtering) */
  trustedContributorCount: number;
  
  /** Total number of contributors (before filtering) */
  totalContributorCount: number;
  
  /** Total FP events considered */
  totalEventCount: number;
  
  /** When this calibration was calculated */
  calculatedAt: Date;
  
  /** Confidence metrics */
  confidence: CalibrationConfidence;
  
  /** Byzantine filtering summary */
  byzantineFilterSummary: ByzantineFilterSummary;
}

/**
 * Confidence metrics for calibration result.
 */
export interface CalibrationConfidence {
  /** Confidence level (0.0-1.0) based on contributor count and agreement */
  level: number;
  
  /** Confidence category */
  category: 'high' | 'medium' | 'low' | 'insufficient';
  
  /** Factors affecting confidence */
  factors: {
    /** Contributor count factor (more contributors = higher confidence) */
    contributorCountFactor: number;
    
    /** Agreement factor (lower variance = higher confidence) */
    agreementFactor: number;
    
    /** Event count factor (more events = higher confidence) */
    eventCountFactor: number;
    
    /** Reputation factor (higher average rep = higher confidence) */
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
  
  /** Percentage of contributors filtered out */
  filterRate: number;
  
  /** Number of outliers filtered */
  outliersFiltered: number;
  
  /** Number filtered by low reputation */
  lowReputationFiltered: number;
  
  /** Z-score threshold used */
  zScoreThreshold: number;
  
  /** Reputation percentile threshold used */
  reputationPercentile: number;
}
