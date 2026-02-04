<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Consistency Score Algorithms Blueprint for Phase Mirror Trust Module

**Priority**: P2 (Critical Path - Reputation Layer Foundation)
**Integration Point**: `ReputationEngine.calculateContributionWeight()` in `trust/reputation/`
**Target**: Production-ready Byzantine fault tolerance through consensus-based reputation scoring

***

## Executive Summary

This blueprint provides step-by-step implementation instructions for consistency score algorithms in Phase Mirror's Trust Module. Consistency scores measure how well an organization's false positive contributions align with network consensus, enabling Byzantine fault tolerance by downweighting outliers and upweighting consistent contributors. This is the core mechanism that prevents poisoning attacks while maintaining k-anonymity.

***

## Architecture Context

### Why Consistency Scoring?

Phase Mirror's FP calibration network aggregates contributions from multiple organizations to calculate consensus FP rates for each rule. However, malicious organizations could submit false data to poison the calibration:

**Attack Scenarios Without Consistency Scoring:**

- ❌ Malicious org submits artificially high FP rates to inflate rule severity
- ❌ Collusion: multiple orgs coordinate to skew consensus
- ❌ Data poisoning: single org with high stake dominates aggregation
- ❌ No feedback mechanism to identify bad actors

**Defense With Consistency Scoring:**

- ✅ Organizations that align with consensus earn higher reputation
- ✅ Outliers automatically downweighted in future aggregations
- ✅ Byzantine fault tolerance without identifying specific bad actors
- ✅ Feedback loop: good contributors → higher weight → influence consensus


### Trust Module Integration Flow

```
┌────────────────────────────────────────────────────────────────────┐
│              Consistency Score Calculation Flow                     │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Org submits FP data for rule X                                 │
│     ↓                                                               │
│  2. FP Store records contribution                                  │
│     ↓                                                               │
│  3. Calibration Store aggregates FP rates (weighted by reputation) │
│     ↓                                                               │
│  4. Consensus FP rate calculated for rule X                        │
│     ↓                                                               │
│  5. Consistency Score Calculator:                                  │
│     a. Compare org's FP rate vs. consensus                         │
│     b. Calculate deviation (absolute difference)                   │
│     c. Apply scoring function (inverse relationship)               │
│     d. Weight by recency (decay older contributions)               │
│     e. Aggregate across all rules org contributed to               │
│     ↓                                                               │
│  6. Update OrganizationReputation.consistencyScore                 │
│     ↓                                                               │
│  7. ReputationEngine.calculateContributionWeight() uses score      │
│     ↓                                                               │
│  8. Future contributions weighted by consistency score             │
│     ↓                                                               │
│  9. Feedback loop: consistent orgs → higher weight → more influence│
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```


### Mathematical Foundation

**Core Principle**: Organizations that agree with consensus are more trustworthy.

**Consistency Score Formula:**

```
ConsistencyScore(org) = Σ(weight_i × consistency_i) / Σ(weight_i)

where:
  consistency_i = 1 - min(|org_fp_rate_i - consensus_fp_rate_i|, 1.0)
  weight_i = e^(-λ × age_days_i)  [exponential decay]
  λ = decay rate (default: 0.01 for ~70-day half-life)
```

**Properties:**

- Range: [0.0, 1.0] where 1.0 = perfect consistency
- Recency bias: Recent contributions weighted more heavily
- Bounded deviation: Maximum penalty for extreme outliers
- Rule-level granularity: Measured per rule, aggregated across org

**Example:**

```
Org contributes FP rates for 3 rules:
  Rule A: Org=0.15, Consensus=0.12 → Deviation=0.03 → Consistency=0.97
  Rule B: Org=0.45, Consensus=0.50 → Deviation=0.05 → Consistency=0.95
  Rule C: Org=0.80, Consensus=0.30 → Deviation=0.50 → Consistency=0.50 (outlier!)

Weighted average (all recent): 0.81 → Good consistency despite one outlier
```


***

## Phase 1: Core Consistency Score Types

### File: `trust/reputation/types.ts` (Additions)

Add consistency scoring types:

```typescript
// ═══════════════════════════════════════════════════════════
// Existing types (keep as-is)
// ═══════════════════════════════════════════════════════════

export interface OrganizationReputation {
  orgId: string;
  reputationScore: number;      // Overall reputation (0.0-1.0)
  stakePledge: number;           // Economic stake (USD)
  contributionCount: number;     // Total contributions
  flaggedCount: number;          // Times flagged as suspicious
  consistencyScore: number;      // Consensus alignment (0.0-1.0)
  ageScore: number;              // Account longevity (0.0-1.0)
  volumeScore: number;           // Usage volume (0.0-1.0)
  lastUpdated: Date;
  stakeStatus: 'active' | 'slashed' | 'withdrawn';
}

// ═══════════════════════════════════════════════════════════
// NEW: Consistency Scoring Types
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
```


***

## Phase 2: Consistency Score Calculator

### File: `trust/reputation/consistency-calculator.ts` (NEW)

Core consistency scoring implementation:

```typescript
import { ContributionRecord, ConsistencyMetrics, ConsistencyScoreConfig, ConsistencyScoreResult } from './types';

/**
 * Consistency Score Calculator
 * 
 * Calculates how well an organization's FP contributions align with
 * network consensus. Enables Byzantine fault tolerance by downweighting
 * outliers and upweighting consistent contributors.
 * 
 * Algorithm:
 * 1. Fetch all contributions from org (filtered by age)
 * 2. For each contribution, calculate deviation from consensus
 * 3. Apply time decay weighting (recent contributions matter more)
 * 4. Compute weighted average consistency score
 * 5. Detect outliers and compute variance metrics
 * 
 * Security Properties:
 * - Byzantine fault tolerance: Outliers automatically downweighted
 * - No identity linking: Uses aggregated consensus (preserves k-anonymity)
 * - Feedback loop: Good actors gain influence over time
 * - Sybil resistance: New orgs start with neutral score (0.5)
 * 
 * @example
 * const calculator = new ConsistencyScoreCalculator(config);
 * const result = await calculator.calculateScore('org-123', contributions);
 * 
 * if (result.hasMinimumData) {
 *   console.log('Consistency score:', result.score);
 *   console.log('Outliers detected:', result.metrics.outlierCount);
 * }
 */
export class ConsistencyScoreCalculator {
  private readonly config: ConsistencyScoreConfig;

  constructor(config?: Partial<ConsistencyScoreConfig>) {
    this.config = {
      decayRate: 0.01,              // ~70-day half-life
      maxContributionAge: 180,      // 6 months
      minContributionsRequired: 3,  // Need at least 3 data points
      outlierThreshold: 0.3,        // 30% deviation = outlier
      minEventCount: 1,             // At least 1 event per contribution
      excludeOutliersFromScore: false, // Include outliers (with low weight)
      maxConsistencyBonus: 0.2,     // Cap bonus at 0.2
      ...config,
    };
  }

  /**
   * Calculate consistency score for an organization.
   * 
   * @param orgId - Organization ID
   * @param contributions - All contribution records for this org
   * @returns Consistency score result with metrics
   */
  async calculateScore(
    orgId: string,
    contributions: ContributionRecord[]
  ): Promise<ConsistencyScoreResult> {
    // Step 1: Filter contributions by age and event count
    const filteredContributions = this.filterContributions(contributions);

    // Step 2: Check if we have minimum data
    if (filteredContributions.length < this.config.minContributionsRequired) {
      return this.createInsufficientDataResult(
        orgId,
        filteredContributions,
        `Only ${filteredContributions.length} contributions found (minimum ${this.config.minContributionsRequired} required)`
      );
    }

    // Step 3: Calculate consistency scores for each contribution
    const scoredContributions = this.scoreContributions(filteredContributions);

    // Step 4: Detect outliers
    const outliers = this.detectOutliers(scoredContributions);

    // Step 5: Apply time decay weighting
    const weights = this.calculateTimeWeights(scoredContributions);

    // Step 6: Calculate weighted average consistency score
    const overallScore = this.calculateWeightedScore(
      scoredContributions,
      weights,
      outliers
    );

    // Step 7: Compute metrics
    const metrics = this.computeMetrics(
      orgId,
      scoredContributions,
      outliers,
      overallScore
    );

    return {
      score: overallScore,
      metrics,
      contributions: scoredContributions,
      hasMinimumData: true,
    };
  }

  /**
   * Calculate consistency score for a single contribution.
   * 
   * Formula: consistency = 1 - min(|contributed - consensus|, 1.0)
   * 
   * @param contributedRate - Organization's contributed FP rate
   * @param consensusRate - Network consensus FP rate
   * @returns Consistency score (0.0-1.0)
   */
  calculateSingleContributionScore(
    contributedRate: number,
    consensusRate: number
  ): number {
    const deviation = Math.abs(contributedRate - consensusRate);
    const boundedDeviation = Math.min(deviation, 1.0);
    return 1.0 - boundedDeviation;
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Filter contributions by age and event count.
   */
  private filterContributions(
    contributions: ContributionRecord[]
  ): ContributionRecord[] {
    const now = Date.now();
    const maxAgeMs = this.config.maxContributionAge * 24 * 60 * 60 * 1000;

    return contributions.filter(contrib => {
      const age = now - contrib.timestamp.getTime();
      return (
        age <= maxAgeMs &&
        contrib.eventCount >= this.config.minEventCount
      );
    });
  }

  /**
   * Calculate consistency scores for each contribution.
   */
  private scoreContributions(
    contributions: ContributionRecord[]
  ): ContributionRecord[] {
    return contributions.map(contrib => {
      const deviation = Math.abs(
        contrib.contributedFpRate - contrib.consensusFpRate
      );
      const consistencyScore = this.calculateSingleContributionScore(
        contrib.contributedFpRate,
        contrib.consensusFpRate
      );

      return {
        ...contrib,
        deviation,
        consistencyScore,
      };
    });
  }

  /**
   * Detect outlier contributions (high deviation from consensus).
   */
  private detectOutliers(
    contributions: ContributionRecord[]
  ): Set<string> {
    const outliers = new Set<string>();

    for (const contrib of contributions) {
      if (contrib.deviation > this.config.outlierThreshold) {
        outliers.add(`${contrib.orgId}:${contrib.ruleId}:${contrib.timestamp.getTime()}`);
      }
    }

    return outliers;
  }

  /**
   * Calculate time decay weights for contributions.
   * 
   * Uses exponential decay: weight = e^(-λ × age_days)
   */
  private calculateTimeWeights(
    contributions: ContributionRecord[]
  ): Map<string, number> {
    const now = Date.now();
    const weights = new Map<string, number>();

    for (const contrib of contributions) {
      const ageDays = (now - contrib.timestamp.getTime()) / (24 * 60 * 60 * 1000);
      const weight = Math.exp(-this.config.decayRate * ageDays);
      const key = `${contrib.orgId}:${contrib.ruleId}:${contrib.timestamp.getTime()}`;
      weights.set(key, weight);
    }

    return weights;
  }

  /**
   * Calculate weighted average consistency score.
   */
  private calculateWeightedScore(
    contributions: ContributionRecord[],
    weights: Map<string, number>,
    outliers: Set<string>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const contrib of contributions) {
      const key = `${contrib.orgId}:${contrib.ruleId}:${contrib.timestamp.getTime()}`;
      const weight = weights.get(key) || 0;
      const isOutlier = outliers.has(key);

      // Optionally exclude outliers
      if (this.config.excludeOutliersFromScore && isOutlier) {
        continue;
      }

      weightedSum += contrib.consistencyScore * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return 0.5; // Neutral score if no valid contributions
    }

    return weightedSum / totalWeight;
  }

  /**
   * Compute consistency metrics.
   */
  private computeMetrics(
    orgId: string,
    contributions: ContributionRecord[],
    outliers: Set<string>,
    overallScore: number
  ): ConsistencyMetrics {
    const deviations = contributions.map(c => c.deviation);
    const averageDeviation = this.mean(deviations);
    const deviationStdDev = this.standardDeviation(deviations);

    const timestamps = contributions.map(c => c.timestamp.getTime());
    const lastContributionDate = new Date(Math.max(...timestamps));
    const oldestTimestamp = Math.min(...timestamps);
    const oldestContributionAge = (Date.now() - oldestTimestamp) / (24 * 60 * 60 * 1000);

    const uniqueRules = new Set(contributions.map(c => c.ruleId));

    return {
      orgId,
      overallScore,
      rulesContributed: uniqueRules.size,
      contributionsConsidered: contributions.length,
      averageDeviation,
      deviationStdDev,
      outlierCount: outliers.size,
      lastContributionDate,
      oldestContributionAge,
    };
  }

  /**
   * Create result for insufficient data.
   */
  private createInsufficientDataResult(
    orgId: string,
    contributions: ContributionRecord[],
    reason: string
  ): ConsistencyScoreResult {
    return {
      score: 0.5, // Neutral score
      metrics: {
        orgId,
        overallScore: 0.5,
        rulesContributed: new Set(contributions.map(c => c.ruleId)).size,
        contributionsConsidered: contributions.length,
        averageDeviation: 0,
        deviationStdDev: 0,
        outlierCount: 0,
        lastContributionDate: new Date(0),
        oldestContributionAge: 0,
      },
      contributions,
      hasMinimumData: false,
      unreliableReason: reason,
    };
  }

  /**
   * Calculate mean of array.
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * Calculate standard deviation of array.
   */
  private standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = this.mean(values);
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    const variance = this.mean(squaredDiffs);
    return Math.sqrt(variance);
  }
}

/**
 * Helper function to create default consistency score config.
 */
export function createDefaultConsistencyConfig(): ConsistencyScoreConfig {
  return {
    decayRate: 0.01,
    maxContributionAge: 180,
    minContributionsRequired: 3,
    outlierThreshold: 0.3,
    minEventCount: 1,
    excludeOutliersFromScore: false,
    maxConsistencyBonus: 0.2,
  };
}
```


***

## Phase 3: Integration with ReputationEngine

### File: `trust/reputation/reputation-engine.ts` (Updates)

Integrate consistency scoring into existing reputation engine:

```typescript
import { ConsistencyScoreCalculator } from './consistency-calculator';
import { ContributionRecord, ConsistencyScoreConfig } from './types';

export class ReputationEngine {
  private readonly consistencyCalculator: ConsistencyScoreCalculator;

  constructor(
    private readonly reputationStore: IReputationStore,
    private readonly config: ReputationEngineConfig,
    consistencyConfig?: Partial<ConsistencyScoreConfig>
  ) {
    // Initialize consistency calculator
    this.consistencyCalculator = new ConsistencyScoreCalculator(consistencyConfig);
    
    // ... existing constructor logic
  }

  /**
   * Calculate contribution weight for an organization.
   * 
   * Weight formula:
   *   weight = baseReputation × (1 + stakeMultiplier) × (1 + consistencyBonus)
   * 
   * Consistency bonus: Up to maxConsistencyBonus (default 0.2) based on consistency score.
   */
  async calculateContributionWeight(orgId: string): Promise<ContributionWeight> {
    const reputation = await this.reputationStore.getReputation(orgId);
    
    if (!reputation) {
      throw new Error(`No reputation found for organization ${orgId}`);
    }

    // Existing factors
    const baseScore = reputation.reputationScore;
    const stakeMultiplier = this.calculateStakeMultiplier(reputation.stakePledge);
    
    // NEW: Consistency bonus
    const consistencyBonus = this.calculateConsistencyBonus(reputation.consistencyScore);

    // Calculate final weight
    const weight = baseScore * (1 + stakeMultiplier) * (1 + consistencyBonus);

    return {
      orgId,
      weight,
      factors: {
        baseReputation: baseScore,
        stakeMultiplier,
        consistencyBonus, // NEW
        totalMultiplier: (1 + stakeMultiplier) * (1 + consistencyBonus),
      },
    };
  }

  /**
   * Update organization's consistency score based on contribution records.
   * 
   * Called after each calibration round to update reputation based on
   * how well org's contributions aligned with consensus.
   * 
   * @param orgId - Organization ID
   * @param contributions - Contribution records (org's FP rates + consensus)
   */
  async updateConsistencyScore(
    orgId: string,
    contributions: ContributionRecord[]
  ): Promise<void> {
    const reputation = await this.reputationStore.getReputation(orgId);
    
    if (!reputation) {
      throw new Error(`No reputation found for organization ${orgId}`);
    }

    // Calculate new consistency score
    const result = await this.consistencyCalculator.calculateScore(orgId, contributions);

    // Update reputation with new consistency score
    const updatedReputation = {
      ...reputation,
      consistencyScore: result.score,
      contributionCount: reputation.contributionCount + contributions.length,
      lastUpdated: new Date(),
    };

    await this.reputationStore.updateReputation(orgId, updatedReputation);

    // Log metrics for monitoring
    console.log(`[ReputationEngine] Updated consistency score for ${orgId}:`, {
      oldScore: reputation.consistencyScore,
      newScore: result.score,
      contributions: result.metrics.contributionsConsidered,
      outliers: result.metrics.outlierCount,
      averageDeviation: result.metrics.averageDeviation,
    });
  }

  /**
   * Batch update consistency scores for multiple organizations.
   * 
   * Called after calibration aggregation to update all contributors.
   * 
   * @param contributionsByOrg - Map of orgId to contribution records
   */
  async batchUpdateConsistencyScores(
    contributionsByOrg: Map<string, ContributionRecord[]>
  ): Promise<void> {
    const updates: Promise<void>[] = [];

    for (const [orgId, contributions] of contributionsByOrg) {
      updates.push(this.updateConsistencyScore(orgId, contributions));
    }

    await Promise.all(updates);
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Calculate consistency bonus based on consistency score.
   * 
   * Maps consistency score (0.0-1.0) to bonus (0.0-maxConsistencyBonus).
   * 
   * Linear mapping:
   *   score = 0.5 → bonus = 0.0 (neutral)
   *   score = 1.0 → bonus = maxConsistencyBonus
   *   score = 0.0 → bonus = -maxConsistencyBonus (penalty)
   */
  private calculateConsistencyBonus(consistencyScore: number): number {
    const maxBonus = this.config.consistencyBonusCap || 0.2;
    
    // Map [0.0, 1.0] → [-maxBonus, +maxBonus] with neutral point at 0.5
    const bonus = (consistencyScore - 0.5) * 2 * maxBonus;
    
    // Clamp to [-maxBonus, +maxBonus]
    return Math.max(-maxBonus, Math.min(maxBonus, bonus));
  }

  // ... existing methods (calculateStakeMultiplier, slashStake, etc.)
}

/**
 * Reputation engine configuration (extended).
 */
export interface ReputationEngineConfig {
  minStakeForParticipation: number;
  stakeMultiplierCap: number;
  consistencyBonusCap: number; // NEW: Max consistency bonus (default 0.2)
  byzantineFilterPercentile: number;
  outlierZScoreThreshold: number;
}
```


***

## Phase 4: Integration with Calibration Store

### File: `src/calibration-store/calibration-store.ts` (Updates)

Integrate consistency score updates into calibration workflow:

```typescript
import { ReputationEngine } from '../trust/reputation/reputation-engine';
import { ContributionRecord } from '../trust/reputation/types';

export class CalibrationStore implements ICalibrationStore {
  constructor(
    private readonly adapter: ICalibrationStoreAdapter,
    private readonly fpStore: IFpStore,
    private readonly reputationEngine?: ReputationEngine // NEW: Optional reputation engine
  ) {}

  /**
   * Aggregate FP rates for a rule with reputation-weighted average.
   * 
   * Now also tracks contribution records for consistency scoring.
   */
  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult> {
    // Step 1: Fetch all FP events for this rule
    const events = await this.fpStore.getFalsePositivesByRule(ruleId);

    // Step 2: Group by organization (orgIdHash → events)
    const eventsByOrg = this.groupByOrg(events);

    // Step 3: Calculate weights for each org (if reputation engine available)
    const orgWeights = new Map<string, number>();
    if (this.reputationEngine) {
      for (const orgIdHash of eventsByOrg.keys()) {
        const weight = await this.reputationEngine.calculateContributionWeight(orgIdHash);
        orgWeights.set(orgIdHash, weight.weight);
      }
    }

    // Step 4: Calculate FP rate for each org
    const orgFpRates = new Map<string, number>();
    for (const [orgIdHash, orgEvents] of eventsByOrg) {
      const fpRate = this.calculateOrgFpRate(orgEvents);
      orgFpRates.set(orgIdHash, fpRate);
    }

    // Step 5: Calculate weighted consensus
    const consensusRate = this.calculateWeightedConsensus(orgFpRates, orgWeights);

    // Step 6: Create contribution records for consistency scoring
    if (this.reputationEngine) {
      const contributions = this.createContributionRecords(
        ruleId,
        orgFpRates,
        consensusRate
      );

      // Step 7: Update consistency scores asynchronously
      this.updateConsistencyScoresAsync(contributions);
    }

    // Step 8: Return calibration result
    return {
      ruleId,
      consensusFpRate: consensusRate,
      contributorCount: eventsByOrg.size,
      totalEventCount: events.length,
      calculatedAt: new Date(),
    };
  }

  /**
   * Create contribution records from aggregation results.
   */
  private createContributionRecords(
    ruleId: string,
    orgFpRates: Map<string, number>,
    consensusRate: number
  ): ContributionRecord[] {
    const contributions: ContributionRecord[] = [];

    for (const [orgIdHash, contributedRate] of orgFpRates) {
      contributions.push({
        orgId: orgIdHash, // Using orgIdHash as orgId (k-anonymity preserved)
        ruleId,
        contributedFpRate: contributedRate,
        consensusFpRate: consensusRate,
        timestamp: new Date(),
        eventCount: 1, // TODO: Track actual event count per org
        deviation: Math.abs(contributedRate - consensusRate),
        consistencyScore: 0, // Will be calculated by ConsistencyScoreCalculator
      });
    }

    return contributions;
  }

  /**
   * Update consistency scores asynchronously (non-blocking).
   */
  private async updateConsistencyScoresAsync(
    contributions: ContributionRecord[]
  ): Promise<void> {
    if (!this.reputationEngine) return;

    // Group contributions by org
    const contributionsByOrg = new Map<string, ContributionRecord[]>();
    for (const contrib of contributions) {
      const existing = contributionsByOrg.get(contrib.orgId) || [];
      existing.push(contrib);
      contributionsByOrg.set(contrib.orgId, existing);
    }

    // Batch update (don't await - run in background)
    this.reputationEngine.batchUpdateConsistencyScores(contributionsByOrg)
      .catch(error => {
        console.error('[CalibrationStore] Error updating consistency scores:', error);
      });
  }

  /**
   * Calculate weighted consensus FP rate.
   */
  private calculateWeightedConsensus(
    orgFpRates: Map<string, number>,
    orgWeights: Map<string, number>
  ): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const [orgIdHash, fpRate] of orgFpRates) {
      const weight = orgWeights.get(orgIdHash) || 1.0; // Default weight if no reputation
      weightedSum += fpRate * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  // ... existing helper methods
}
```


***

## Phase 5: Contribution Record Storage

### File: `trust/adapters/types.ts` (Additions)

Add contribution record storage interface:

```typescript
export interface IContributionStore {
  /**
   * Store a contribution record.
   */
  storeContribution(contribution: ContributionRecord): Promise<void>;

  /**
   * Get all contribution records for an organization.
   * 
   * @param orgId - Organization ID
   * @param maxAge - Maximum age in days (optional)
   * @returns Array of contribution records
   */
  getContributions(orgId: string, maxAge?: number): Promise<ContributionRecord[]>;

  /**
   * Get contribution records for a specific rule.
   */
  getContributionsByRule(ruleId: string): Promise<ContributionRecord[]>;

  /**
   * Delete old contribution records (for data retention).
   */
  deleteOldContributions(maxAgeDays: number): Promise<number>;
}
```


### File: `trust/adapters/local/contribution-store.ts` (NEW)

Local JSON-based implementation:

```typescript
import { IContributionStore } from '../types';
import { ContributionRecord } from '../../reputation/types';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * Local file-based contribution record storage.
 * 
 * Stores contribution records in JSON file for development/testing.
 */
export class LocalContributionStore implements IContributionStore {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'contributions.json');
  }

  async storeContribution(contribution: ContributionRecord): Promise<void> {
    const contributions = await this.loadContributions();
    contributions.push(contribution);
    await this.saveContributions(contributions);
  }

  async getContributions(orgId: string, maxAge?: number): Promise<ContributionRecord[]> {
    const contributions = await this.loadContributions();
    let filtered = contributions.filter(c => c.orgId === orgId);

    if (maxAge !== undefined) {
      const cutoff = Date.now() - (maxAge * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(c => c.timestamp.getTime() >= cutoff);
    }

    return filtered;
  }

  async getContributionsByRule(ruleId: string): Promise<ContributionRecord[]> {
    const contributions = await this.loadContributions();
    return contributions.filter(c => c.ruleId === ruleId);
  }

  async deleteOldContributions(maxAgeDays: number): Promise<number> {
    const contributions = await this.loadContributions();
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    
    const remaining = contributions.filter(c => c.timestamp.getTime() >= cutoff);
    const deletedCount = contributions.length - remaining.length;

    await this.saveContributions(remaining);
    return deletedCount;
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  private async loadContributions(): Promise<ContributionRecord[]> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Deserialize dates
      return parsed.map((c: any) => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async saveContributions(contributions: ContributionRecord[]): Promise<void> {
    // Serialize dates
    const serialized = contributions.map(c => ({
      ...c,
      timestamp: c.timestamp.toISOString(),
    }));

    await fs.writeFile(
      this.filePath,
      JSON.stringify(serialized, null, 2),
      'utf-8'
    );
  }
}
```


***

## Phase 6: CLI Integration

### File: `cli/commands/reputation.ts` (NEW)

CLI commands for reputation and consistency management:

```typescript
import { Command } from 'commander';
import { ReputationEngine } from '../../trust/reputation/reputation-engine';
import { ConsistencyScoreCalculator } from '../../trust/reputation/consistency-calculator';
import { createLocalTrustAdapters } from '../../trust/adapters/local';
import { LocalContributionStore } from '../../trust/adapters/local/contribution-store';
import chalk from 'chalk';

export function createReputationCommand() {
  const cmd = new Command('reputation');
  cmd.description('Manage organization reputation and consistency scores');

  // Subcommand: Show reputation
  cmd
    .command('show')
    .description('Show reputation details for an organization')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .action(async (options) => {
      await showReputation(options);
    });

  // Subcommand: Calculate consistency
  cmd
    .command('consistency')
    .description('Calculate consistency score for an organization')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .option('--max-age <days>', 'Maximum contribution age in days', '180')
    .action(async (options) => {
      await calculateConsistency(options);
    });

  // Subcommand: Update consistency scores
  cmd
    .command('update-consistency')
    .description('Update consistency scores for all organizations')
    .action(async () => {
      await updateAllConsistencyScores();
    });

  return cmd;
}

async function showReputation(options: any) {
  const { orgId } = options;

  console.log(chalk.blue('📊 Fetching reputation...'));
  console.log(`  Org ID: ${orgId}`);
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const engine = new ReputationEngine(adapters.reputationStore, {
      minStakeForParticipation: 1000,
      stakeMultiplierCap: 1.0,
      consistencyBonusCap: 0.2,
      byzantineFilterPercentile: 0.2,
      outlierZScoreThreshold: 3.0,
    });

    const reputation = await adapters.reputationStore.getReputation(orgId);

    if (!reputation) {
      console.log(chalk.yellow('⚠️  No reputation found for this organization.'));
      process.exit(0);
    }

    console.log(chalk.green('Reputation Details:'));
    console.log();
    console.log(`  Overall Score: ${reputation.reputationScore.toFixed(3)}`);
    console.log(`  Consistency Score: ${reputation.consistencyScore.toFixed(3)}`);
    console.log(`  Age Score: ${reputation.ageScore.toFixed(3)}`);
    console.log(`  Volume Score: ${reputation.volumeScore.toFixed(3)}`);
    console.log();
    console.log(`  Stake Pledge: $${reputation.stakePledge.toFixed(2)}`);
    console.log(`  Stake Status: ${reputation.stakeStatus}`);
    console.log();
    console.log(`  Contributions: ${reputation.contributionCount}`);
    console.log(`  Flagged: ${reputation.flaggedCount} times`);
    console.log();
    console.log(`  Last Updated: ${reputation.lastUpdated.toISOString()}`);

    // Calculate contribution weight
    const weight = await engine.calculateContributionWeight(orgId);
    console.log();
    console.log(chalk.blue('Contribution Weight:'));
    console.log(`  Final Weight: ${weight.weight.toFixed(4)}`);
    console.log(`  Base Reputation: ${weight.factors.baseReputation.toFixed(3)}`);
    console.log(`  Stake Multiplier: ${weight.factors.stakeMultiplier.toFixed(3)}`);
    console.log(`  Consistency Bonus: ${weight.factors.consistencyBonus.toFixed(3)}`);
    console.log(`  Total Multiplier: ${weight.factors.totalMultiplier.toFixed(3)}`);

  } catch (error) {
    console.error(chalk.red('Error fetching reputation:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function calculateConsistency(options: any) {
  const { orgId, maxAge } = options;

  console.log(chalk.blue('🔍 Calculating consistency score...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Max Age: ${maxAge} days`);
  console.log();

  try {
    const contributionStore = new LocalContributionStore('.trust-data');
    const calculator = new ConsistencyScoreCalculator({
      maxContributionAge: parseInt(maxAge),
    });

    const contributions = await contributionStore.getContributions(
      orgId,
      parseInt(maxAge)
    );

    console.log(`Found ${contributions.length} contributions`);
    console.log();

    const result = await calculator.calculateScore(orgId, contributions);

    if (!result.hasMinimumData) {
      console.log(chalk.yellow('⚠️  Insufficient data for reliable consistency score'));
      console.log(chalk.yellow(`  Reason: ${result.unreliableReason}`));
      console.log();
      console.log(`  Returning neutral score: ${result.score.toFixed(3)}`);
      process.exit(0);
    }

    console.log(chalk.green('✅ Consistency Score Calculated!'));
    console.log();
    console.log(`  Overall Score: ${result.score.toFixed(3)}`);
    console.log();
    console.log('Metrics:');
    console.log(`  Rules Contributed: ${result.metrics.rulesContributed}`);
    console.log(`  Contributions Considered: ${result.metrics.contributionsConsidered}`);
    console.log(`  Average Deviation: ${result.metrics.averageDeviation.toFixed(4)}`);
    console.log(`  Deviation Std Dev: ${result.metrics.deviationStdDev.toFixed(4)}`);
    console.log(`  Outliers Detected: ${result.metrics.outlierCount}`);
    console.log(`  Last Contribution: ${result.metrics.lastContributionDate.toISOString()}`);
    console.log(`  Oldest Contribution: ${result.metrics.oldestContributionAge.toFixed(1)} days ago`);

    // Show outlier details if any
    if (result.metrics.outlierCount > 0) {
      console.log();
      console.log(chalk.yellow('⚠️  Outliers Detected:'));
      const outliers = result.contributions.filter(c => c.deviation > 0.3);
      for (const outlier of outliers.slice(0, 5)) {
        console.log(`    Rule ${outlier.ruleId}: contributed=${outlier.contributedFpRate.toFixed(3)}, consensus=${outlier.consensusFpRate.toFixed(3)}, deviation=${outlier.deviation.toFixed(3)}`);
      }
      if (outliers.length > 5) {
        console.log(`    ... and ${outliers.length - 5} more`);
      }
    }

  } catch (error) {
    console.error(chalk.red('Error calculating consistency:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function updateAllConsistencyScores() {
  console.log(chalk.blue('🔄 Updating consistency scores for all organizations...'));
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const contributionStore = new LocalContributionStore('.trust-data');
    const engine = new ReputationEngine(adapters.reputationStore, {
      minStakeForParticipation: 1000,
      stakeMultiplierCap: 1.0,
      consistencyBonusCap: 0.2,
      byzantineFilterPercentile: 0.2,
      outlierZScoreThreshold: 3.0,
    });

    // Get all organizations (would need to add method to list all)
    // For now, demonstrate with placeholder
    console.log(chalk.yellow('Note: Full implementation requires IReputationStore.listAll() method'));
    console.log();
    console.log('Batch update would process:');
    console.log('  1. Fetch all organization IDs');
    console.log('  2. For each org, fetch contributions');
    console.log('  3. Calculate consistency score');
    console.log('  4. Update reputation record');

  } catch (error) {
    console.error(chalk.red('Error updating consistency scores:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}
```

**Usage:**

```bash
# Show reputation with consistency score
pnpm cli reputation show --org-id acme-corp-123

# Calculate consistency score
pnpm cli reputation consistency --org-id acme-corp-123 --max-age 90

# Update all consistency scores (batch)
pnpm cli reputation update-consistency
```


***

## Phase 7: Unit Tests

### File: `trust/__tests__/consistency-calculator.test.ts` (NEW)

Comprehensive test suite:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ConsistencyScoreCalculator } from '../reputation/consistency-calculator';
import { ContributionRecord } from '../reputation/types';

describe('ConsistencyScoreCalculator', () => {
  let calculator: ConsistencyScoreCalculator;

  beforeEach(() => {
    calculator = new ConsistencyScoreCalculator({
      decayRate: 0.01,
      maxContributionAge: 180,
      minContributionsRequired: 3,
      outlierThreshold: 0.3,
      minEventCount: 1,
      excludeOutliersFromScore: false,
      maxConsistencyBonus: 0.2,
    });
  });

  describe('calculateSingleContributionScore', () => {
    it('returns 1.0 for perfect match', () => {
      const score = calculator.calculateSingleContributionScore(0.5, 0.5);
      expect(score).toBe(1.0);
    });

    it('returns 0.95 for 5% deviation', () => {
      const score = calculator.calculateSingleContributionScore(0.50, 0.45);
      expect(score).toBeCloseTo(0.95, 2);
    });

    it('returns 0.0 for maximum deviation', () => {
      const score = calculator.calculateSingleContributionScore(1.0, 0.0);
      expect(score).toBe(0.0);
    });

    it('caps deviation at 1.0', () => {
      const score = calculator.calculateSingleContributionScore(2.0, 0.0);
      expect(score).toBe(0.0);
    });
  });

  describe('calculateScore', () => {
    it('calculates score for consistent contributions', async () => {
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-123',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.12,
          timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          eventCount: 5,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-123',
          ruleId: 'rule-2',
          contributedFpRate: 0.25,
          consensusFpRate: 0.23,
          timestamp: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
          eventCount: 8,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-123',
          ruleId: 'rule-3',
          contributedFpRate: 0.50,
          consensusFpRate: 0.52,
          timestamp: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          eventCount: 12,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-123', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.score).toBeGreaterThan(0.9); // High consistency
      expect(result.metrics.contributionsConsidered).toBe(3);
      expect(result.metrics.outlierCount).toBe(0);
    });

    it('detects outliers', async () => {
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-456',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.12,
          timestamp: new Date(),
          eventCount: 5,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-456',
          ruleId: 'rule-2',
          contributedFpRate: 0.25,
          consensusFpRate: 0.23,
          timestamp: new Date(),
          eventCount: 8,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-456',
          ruleId: 'rule-3',
          contributedFpRate: 0.90, // Outlier!
          consensusFpRate: 0.20,
          timestamp: new Date(),
          eventCount: 12,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-456', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.metrics.outlierCount).toBe(1);
      expect(result.score).toBeLessThan(0.9); // Lower due to outlier
    });

    it('applies time decay weighting', async () => {
      const recentContribution: ContributionRecord = {
        orgId: 'org-789',
        ruleId: 'rule-1',
        contributedFpRate: 0.10,
        consensusFpRate: 0.12,
        timestamp: new Date(), // Recent
        eventCount: 5,
        deviation: 0,
        consistencyScore: 0,
      };

      const oldContribution: ContributionRecord = {
        orgId: 'org-789',
        ruleId: 'rule-2',
        contributedFpRate: 0.90, // Very inconsistent
        consensusFpRate: 0.20,
        timestamp: new Date(Date.now() - 150 * 24 * 60 * 60 * 1000), // 150 days ago
        eventCount: 8,
        deviation: 0,
        consistencyScore: 0,
      };

      const middleContribution: ContributionRecord = {
        orgId: 'org-789',
        ruleId: 'rule-3',
        contributedFpRate: 0.15,
        consensusFpRate: 0.18,
        timestamp: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000), // 50 days ago
        eventCount: 10,
        deviation: 0,
        consistencyScore: 0,
      };

      const result = await calculator.calculateScore('org-789', [
        recentContribution,
        oldContribution,
        middleContribution,
      ]);

      // Old bad contribution should have less impact due to time decay
      expect(result.hasMinimumData).toBe(true);
      expect(result.score).toBeGreaterThan(0.7); // Not too hurt by old outlier
    });

    it('returns insufficient data for too few contributions', async () => {
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-new',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.12,
          timestamp: new Date(),
          eventCount: 5,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-new', contributions);

      expect(result.hasMinimumData).toBe(false);
      expect(result.score).toBe(0.5); // Neutral score
      expect(result.unreliableReason).toContain('Only 1 contributions found');
    });

    it('filters out contributions older than maxAge', async () => {
      const oldContributions: ContributionRecord[] = [
        {
          orgId: 'org-old',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.12,
          timestamp: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000), // 200 days ago
          eventCount: 5,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-old',
          ruleId: 'rule-2',
          contributedFpRate: 0.25,
          consensusFpRate: 0.23,
          timestamp: new Date(Date.now() - 190 * 24 * 60 * 60 * 1000), // 190 days ago
          eventCount: 8,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-old',
          ruleId: 'rule-3',
          contributedFpRate: 0.50,
          consensusFpRate: 0.52,
          timestamp: new Date(Date.now() - 185 * 24 * 60 * 60 * 1000), // 185 days ago
          eventCount: 12,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-old', oldContributions);

      // All contributions filtered out (older than 180 days)
      expect(result.hasMinimumData).toBe(false);
      expect(result.unreliableReason).toContain('0 contributions found');
    });

    it('excludes outliers from score when configured', async () => {
      const strictCalculator = new ConsistencyScoreCalculator({
        decayRate: 0.01,
        maxContributionAge: 180,
        minContributionsRequired: 3,
        outlierThreshold: 0.3,
        minEventCount: 1,
        excludeOutliersFromScore: true, // Strict mode
        maxConsistencyBonus: 0.2,
      });

      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-strict',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.12,
          timestamp: new Date(),
          eventCount: 5,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-strict',
          ruleId: 'rule-2',
          contributedFpRate: 0.25,
          consensusFpRate: 0.23,
          timestamp: new Date(),
          eventCount: 8,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-strict',
          ruleId: 'rule-3',
          contributedFpRate: 0.90, // Outlier
          consensusFpRate: 0.20,
          timestamp: new Date(),
          eventCount: 12,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await strictCalculator.calculateScore('org-strict', contributions);

      // Outlier excluded, so score should be very high (only good contributions)
      expect(result.score).toBeGreaterThan(0.95);
      expect(result.metrics.outlierCount).toBe(1);
    });
  });
});
```


***

## Phase 8: Documentation

### File: `docs/trust-module/consistency-scoring.md` (NEW)

User-facing documentation:

```markdown
# Consistency Scoring

## Overview

Consistency scoring is Phase Mirror's mechanism for Byzantine fault tolerance in the false positive calibration network. Organizations that contribute FP rates aligned with network consensus earn higher reputation scores, while outliers are automatically downweighted. This creates a feedback loop that incentivizes accurate reporting without requiring identity disclosure.

## Why Consistency Scoring?

Without consistency scoring, malicious organizations could poison FP calibration by submitting false data:

| Attack | Without Consistency | With Consistency |
|--------|---------------------|------------------|
| **Data Poisoning** | Single malicious org with high stake can skew consensus | Outlier automatically downweighted in future aggregations |
| **Collusion** | Multiple orgs coordinate to manipulate rates | Each org's consistency measured independently; colluding orgs detected as outliers |
| **False Positives Inflation** | Attacker submits artificially high FP rates | High deviation from consensus → low consistency → low weight |
| **No Feedback** | Bad actors undetected until manual review | Automatic feedback loop: bad reporting → lower reputation → less influence |

## How It Works

### Step 1: Contribution

Organization submits FP data for a rule:
```

Rule: no-unused-vars
Org FP Rate: 0.15 (15% false positive rate)

```

### Step 2: Consensus Calculation

Calibration Store aggregates all organizations' contributions (weighted by reputation):
```

Org A: 0.15 (weight: 1.2)
Org B: 0.12 (weight: 1.0)
Org C: 0.18 (weight: 0.8)
Org D: 0.90 (weight: 0.5) ← Outlier!

Weighted Consensus: 0.16

```

### Step 3: Consistency Measurement

Calculate deviation from consensus for each org:
```

Org A: |0.15 - 0.16| = 0.01 → Consistency = 0.99 ✅ Excellent
Org B: |0.12 - 0.16| = 0.04 → Consistency = 0.96 ✅ Good
Org C: |0.18 - 0.16| = 0.02 → Consistency = 0.98 ✅ Excellent
Org D: |0.90 - 0.16| = 0.74 → Consistency = 0.26 ❌ Poor (outlier)

```

### Step 4: Reputation Update

Update each organization's consistency score (weighted by recency):
```

Org A: Previous consistency = 0.92, New = 0.93 (improved)
Org B: Previous consistency = 0.88, New = 0.89
Org C: Previous consistency = 0.95, New = 0.95
Org D: Previous consistency = 0.60, New = 0.55 (declined)

```

### Step 5: Future Weighting

Next calibration round uses updated reputation:
```

Org A: Base reputation × (1 + stake) × (1 + 0.086) = Higher weight
Org B: Base reputation × (1 + stake) × (1 + 0.078) = Higher weight
Org C: Base reputation × (1 + stake) × (1 + 0.100) = Highest weight
Org D: Base reputation × (1 + stake) × (1 + 0.020) = Lower weight

```

**Feedback Loop**: Consistent orgs gain more influence, outliers lose influence.

## Consistency Score Formula

### Single Contribution

For a single contribution:
```

consistency = 1 - min(|contributed_rate - consensus_rate|, 1.0)

```

**Properties:**
- Range: [0.0, 1.0]
- 1.0 = perfect match
- 0.0 = maximum deviation (≥100%)
- Bounded: Deviation capped at 1.0

**Examples:**
```

Contributed: 0.15, Consensus: 0.15 → Deviation: 0.00 → Consistency: 1.00
Contributed: 0.15, Consensus: 0.20 → Deviation: 0.05 → Consistency: 0.95
Contributed: 0.15, Consensus: 0.50 → Deviation: 0.35 → Consistency: 0.65
Contributed: 0.15, Consensus: 1.50 → Deviation: 1.35 (capped at 1.0) → Consistency: 0.00

```

### Aggregated Score (Multiple Contributions)

For multiple contributions over time:
```

consistency_score = Σ(weight_i × consistency_i) / Σ(weight_i)

where:
weight_i = e^(-λ × age_days_i)
λ = decay rate (default: 0.01)

```

**Time Decay:**
- Recent contributions weighted more heavily
- Exponential decay with ~70-day half-life (λ = 0.01)
- Old contributions fade but never disappear

**Example:**
```

Contribution A: 30 days old, consistency = 0.95, weight = 0.74
Contribution B: 60 days old, consistency = 0.80, weight = 0.55
Contribution C: 90 days old, consistency = 0.60, weight = 0.41

Weighted score = (0.95×0.74 + 0.80×0.55 + 0.60×0.41) / (0.74+0.55+0.41)
= 1.39 / 1.70
= 0.818

```

## Configuration

### Default Settings

```typescript
{
  decayRate: 0.01,              // ~70-day half-life for time weighting
  maxContributionAge: 180,      // Only consider contributions from last 6 months
  minContributionsRequired: 3,  // Need at least 3 data points for reliable score
  outlierThreshold: 0.3,        // Deviation > 30% flagged as outlier
  minEventCount: 1,             // At least 1 FP event per contribution
  excludeOutliersFromScore: false, // Include outliers (but downweight them)
  maxConsistencyBonus: 0.2,     // Cap consistency bonus at 20%
}
```


### Tuning Parameters

**`decayRate`** - Controls how quickly old contributions fade:

- Lower (e.g., 0.005): Longer memory (~140-day half-life)
- Higher (e.g., 0.02): Shorter memory (~35-day half-life)
- Recommendation: 0.01 for balance between recency and history

**`maxContributionAge`** - Maximum age of contributions to consider:

- Lower (e.g., 90): Only recent data counts
- Higher (e.g., 365): Include older history
- Recommendation: 180 days (6 months) for good balance

**`outlierThreshold`** - Deviation threshold for outlier detection:

- Lower (e.g., 0.2): Stricter outlier detection
- Higher (e.g., 0.5): More lenient
- Recommendation: 0.3 (30% deviation) as reasonable threshold

**`excludeOutliersFromScore`** - Whether to exclude outliers:

- `false` (default): Include outliers but downweight them (Byzantine-tolerant)
- `true`: Exclude outliers completely (strict mode, risk of losing valid data)


## Reputation Integration

Consistency score is one factor in overall reputation:

```
contribution_weight = base_reputation × (1 + stake_multiplier) × (1 + consistency_bonus)
```

**Consistency Bonus Calculation:**

```
consistency_bonus = (consistency_score - 0.5) × 2 × maxConsistencyBonus

Examples:
  consistency_score = 1.0 → bonus = +0.20 (maximum)
  consistency_score = 0.75 → bonus = +0.10
  consistency_score = 0.5 → bonus = 0.00 (neutral)
  consistency_score = 0.25 → bonus = -0.10 (penalty)
  consistency_score = 0.0 → bonus = -0.20 (maximum penalty)
```

**Neutral Point**: Consistency score of 0.5 provides no bonus or penalty.

**Example Weights:**

```
Org A: base=0.8, stake_mult=0.5, consistency_bonus=0.10
  weight = 0.8 × (1 + 0.5) × (1 + 0.10) = 1.32

Org B: base=0.8, stake_mult=0.5, consistency_bonus=-0.05
  weight = 0.8 × (1 + 0.5) × (1 - 0.05) = 1.14

Org A has 16% more influence than Org B due to consistency!
```


## Cold Start Problem

**Challenge**: New organizations have no contribution history, so consistency score cannot be calculated.

**Solution**: New orgs start with neutral score (0.5):

- No bonus or penalty initially
- Must contribute to at least `minContributionsRequired` rules before score is reliable
- Gradual reputation building as more contributions are made

**Timeline:**

```
Contribution 1: Score = 0.5 (neutral, unreliable)
Contribution 2: Score = 0.5 (neutral, unreliable)
Contribution 3: Score = calculated (reliable, used for weighting)
Contribution 10: Score = mature (high confidence)
```


## Outlier Detection

Outliers are contributions with high deviation from consensus (> `outlierThreshold`).

**Why Detect Outliers?**

- Identify potential Byzantine actors
- Flag suspicious patterns for manual review
- Provide visibility into data quality

**Not Automatically Excluded:**

- Outliers may be legitimate (org has different codebase characteristics)
- Excluding outliers risks losing valid minority perspectives
- Instead, outliers are downweighted but still contribute

**Outlier Metrics:**

```
Outlier Count: Number of contributions flagged as outliers
Outlier Rate: outlier_count / total_contributions
Average Deviation: Mean deviation across all contributions
Deviation Std Dev: Variance in deviation (consistency of consistency)
```

**Example:**

```
Org with many outliers:
  Outlier Count: 8 / 20 contributions (40%)
  Average Deviation: 0.25
  → Likely data quality issue or malicious

Org with few outliers:
  Outlier Count: 1 / 20 contributions (5%)
  Average Deviation: 0.05
  → Healthy, one-off anomaly acceptable
```


## CLI Commands

### Show Reputation

```bash
pnpm cli reputation show --org-id your-org-123

# Output:
Reputation Details:
  Overall Score: 0.850
  Consistency Score: 0.923
  Age Score: 0.800
  Volume Score: 0.650

Contribution Weight:
  Final Weight: 1.2456
  Base Reputation: 0.850
  Stake Multiplier: 0.200
  Consistency Bonus: 0.085  ← Derived from consistency score
```


### Calculate Consistency

```bash
pnpm cli reputation consistency --org-id your-org-123 --max-age 90

# Output:
✅ Consistency Score Calculated!

  Overall Score: 0.923

Metrics:
  Rules Contributed: 15
  Contributions Considered: 18
  Average Deviation: 0.045
  Deviation Std Dev: 0.032
  Outliers Detected: 1
  Last Contribution: 2026-02-01T10:30:00.000Z
  Oldest Contribution: 87.3 days ago

⚠️  Outliers Detected:
    Rule no-any: contributed=0.650, consensus=0.120, deviation=0.530
```


### Update Consistency Scores

```bash
# Batch update all organizations after calibration
pnpm cli reputation update-consistency

# Output:
🔄 Updating consistency scores for all organizations...
  Updated 47 organizations
  Average consistency: 0.856
  Outliers flagged: 3
```


## Best Practices

### For Contributors

1. **Submit Accurate Data**: Report true FP rates from your codebase
2. **Contribute Regularly**: Consistency score improves with more data points
3. **Investigate Outliers**: If flagged as outlier, investigate why your rates differ
4. **Avoid Gaming**: Attempting to match consensus without accurate data will be detected over time

### For Operators

1. **Monitor Outlier Rates**: High outlier rates across network indicate potential attack
2. **Tune Thresholds**: Adjust `outlierThreshold` based on network characteristics
3. **Review Flagged Orgs**: Manually investigate organizations with consistently low consistency
4. **Gradual Rollout**: Start with low `maxConsistencyBonus`, increase as confidence grows

### For Auditors

1. **Track Consistency Trends**: Monitor how consistency scores change over time
2. **Analyze Outlier Patterns**: Look for collusion (multiple orgs with same outlier pattern)
3. **Validate Consensus**: Ensure consensus FP rates are reasonable for each rule
4. **Cold Start Monitoring**: Track how new orgs' consistency evolves after initial contributions

## Troubleshooting

### "Insufficient data for reliable consistency score"

**Cause:** Organization has fewer than `minContributionsRequired` contributions.

**Solution:** Continue contributing FP data. After 3+ contributions, score will be calculated.

### "Consistency score unexpectedly low"

**Possible Causes:**

1. Your FP rates genuinely differ from network consensus (different codebase characteristics)
2. Bug in FP detection causing incorrect rates
3. Network consensus is skewed by Byzantine actors

**Investigation Steps:**

```bash
# Check your contribution details
pnpm cli reputation consistency --org-id your-org-123

# Compare your rates to consensus for specific rules
pnpm cli calibration show --rule-id no-unused-vars

# Review your FP detection configuration
pnpm cli fp-store stats --org-id your-org-123
```


### "Flagged as outlier for specific rule"

**Cause:** Your contributed FP rate deviates significantly from consensus (> 30%).

**Actions:**

1. **Validate your data**: Ensure FP events are correctly detected
2. **Check rule configuration**: Your linter settings may differ from network
3. **Accept legitimate difference**: If accurate, contribute more data to establish pattern
4. **Report bug**: If you believe consensus is wrong, report to Phase Mirror team

### "Consistency score not updating"

**Possible Causes:**

1. Contributions are older than `maxContributionAge` (180 days)
2. Calibration not running (consensus not being calculated)
3. Bug in consistency score calculator

**Debugging:**

```bash
# Check when last contribution was made
pnpm cli reputation show --org-id your-org-123

# Verify contributions are being stored
pnpm cli fp-store list --org-id your-org-123 --limit 10

# Manually trigger consistency calculation
pnpm cli reputation consistency --org-id your-org-123
```


## Security Considerations

### Byzantine Fault Tolerance

Consistency scoring provides BFT properties:

- **Minority Attack**: Small number of malicious orgs cannot significantly skew consensus
- **Collusion Resistance**: Colluding orgs detected as outliers, downweighted
- **Self-Healing**: Feedback loop gradually excludes bad actors from influence
- **No Identity Linking**: Consensus calculated at aggregate level (preserves k-anonymity)


### Privacy Preservation

Consistency scoring does not compromise k-anonymity:

- Organization IDs hashed before aggregation (`orgIdHash`)
- Consensus calculated over aggregated data (no individual rates exposed)
- Consistency score measured per org, but comparison is against anonymous consensus
- No org can determine which other orgs contributed to consensus


### Attack Vectors

**Gradual Poisoning:**

- Attack: Start with accurate data to build consistency, then gradually submit false data
- Defense: Time decay ensures recent contributions matter most; gradual shift detected

**Consensus Manipulation:**

- Attack: Coordinate multiple orgs to submit same false rate, become new consensus
- Defense: Requires majority of network weight (difficult with stake requirements + verification)

**Outlier Flooding:**

- Attack: Submit many outlier contributions to desensitize outlier detection
- Defense: Outliers reduce consistency score, reducing future influence


## FAQ

**Q: Does consistency scoring mean I must always match consensus?**
A: No. Legitimate differences in codebase characteristics will result in different FP rates. Consistency scoring measures *typical* alignment, not perfect matching. Occasional outliers are acceptable.

**Q: What if consensus is wrong?**
A: If your data is accurate and consistently differs, continue contributing. Over time, if your perspective is valid, it will influence consensus. Minority perspectives are downweighted but not excluded.

**Q: Can I see other organizations' consistency scores?**
A: No. Consistency scores are private to each organization. You can only see your own score and aggregate network statistics.

**Q: How quickly does consistency score adapt to new behavior?**
A: With default settings (~70-day half-life), significant changes are detectable within 2-3 months. Recent contributions have disproportionate impact.

**Q: What's a "good" consistency score?**
A: 0.80+ is good, 0.90+ is excellent, 0.50 is neutral (new orgs), <0.40 indicates potential issues.

**Q: Can I opt out of consistency scoring?**
A: No. Consistency scoring is fundamental to Byzantine fault tolerance. However, you can choose not to contribute FP data.

## Support

For consistency scoring questions:

- GitHub Issues: https://github.com/PhaseMirror/Phase-Mirror/issues
- Email: support@phasemirror.com
- Low consistency score investigation: reputation@phasemirror.com

```

***

## Success Criteria

### Definition of Done

- [ ] `ConsistencyScoreCalculator` class fully implemented with scoring algorithms
- [ ] Integration with `ReputationEngine.calculateContributionWeight()` complete
- [ ] `CalibrationStore` creates contribution records and updates consistency scores
- [ ] `IContributionStore` interface and `LocalContributionStore` implementation
- [ ] CLI `reputation` command with show, consistency, update-consistency subcommands
- [ ] **91+ existing tests + 12+ consistency calculator tests = 103+ total tests passing**
- [ ] User-facing documentation in `docs/trust-module/consistency-scoring.md`
- [ ] TypeScript compilation succeeds with no errors
- [ ] CodeQL security scan passes (no new vulnerabilities)
- [ ] End-to-end test: contribute FP → calculate consensus → update consistency → verify weight change

### Integration Test Checklist

End-to-end consistency scoring workflow:

```bash
# Setup: Create test org and verify identity
pnpm cli verify --method github_org \
  --org-id test-org-consistency \
  --github-org github \
  --public-key abc123...

# Test 1: Submit FP data for multiple rules
# (Requires FP Store integration - simulate via direct store)
node -e "
const { FpStore } = require('./dist');
const fpStore = new FpStore(adapter);

// Submit FP events for 3 rules
await fpStore.recordFalsePositive({
  ruleId: 'rule-1',
  filePath: '/test.ts',
  orgIdNonce: '<nonce>',
  timestamp: new Date(),
  metadata: { orgId: 'test-org-consistency' }
});
// ... repeat for rule-2, rule-3
"

# Test 2: Run calibration (calculates consensus)
pnpm cli calibration aggregate --rule-id rule-1

# Test 3: Check consistency score
pnpm cli reputation consistency --org-id test-org-consistency

# Expected: Score calculated based on deviation from consensus

# Test 4: Verify weight calculation includes consistency bonus
pnpm cli reputation show --org-id test-org-consistency

# Expected: Consistency Bonus field populated

# Test 5: Submit outlier data
# (Simulate FP rate that deviates significantly from consensus)

# Test 6: Recalculate consistency
pnpm cli reputation consistency --org-id test-org-consistency

# Expected: Lower consistency score, outlier detected

# Test 7: Verify reduced weight in next calibration
pnpm cli reputation show --org-id test-org-consistency

# Expected: Lower contribution weight due to reduced consistency bonus
```


***

## Next Steps After P2 Completion

Once consistency scoring is production-ready:

1. **P3: Age \& Volume Scoring** - Implement remaining reputation factors (organization age, contribution volume)
2. **P3: Byzantine Filtering** - Implement `filterByzantineActors()` with statistical outlier detection
3. **P3: Full FP Calibration Integration** - Complete end-to-end weighted aggregation with all reputation factors
4. **P4: Automated Consistency Updates** - Background job to update consistency scores after each calibration
5. **P4: Consistency Trend Analysis** - Track how consistency evolves over time for anomaly detection
6. **P5: Multi-Rule Consistency Patterns** - Detect collusion via correlated outlier patterns across rules

***

## Copilot Implementation Prompts

### Prompt 1: Implement ConsistencyScoreCalculator

```
Implement the ConsistencyScoreCalculator class in trust/reputation/consistency-calculator.ts with:
- Constructor accepting ConsistencyScoreConfig
- calculateScore method: filter contributions by age/event count, score each contribution, detect outliers, apply time decay, compute weighted average
- calculateSingleContributionScore method: consistency = 1 - min(|contributed - consensus|, 1.0)
- Private helpers: filterContributions, scoreContributions, detectOutliers, calculateTimeWeights, calculateWeightedScore, computeMetrics
- Use exponential decay for time weighting: weight = e^(-λ × age_days)
- Return ConsistencyScoreResult with score, metrics, contributions, hasMinimumData

Follow Phase Mirror patterns from trust/ directory.
Add comprehensive JSDoc comments explaining Byzantine
<span style="display:none">[^1][^10][^11][^12][^13][^14][^15][^16][^17][^18][^2][^3][^4][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: if-phase-mirror-had-a-ui-ux-wh-42aRj49CSACSlpWdD.YCfA.md
[^2]: lets-analyze-the-phase-mirror-zcQHcEC1RSa.hpTZS8CnrQ.md
[^3]: should-we-create-a-phase-mirro-g0nIu619SN20l__3R5jUmA.md
[^4]: lets-analyze-the-phase-mirror-KxbpLF05TkmkJ5C3R17zHw.md
[^5]: lets-do-a-research-study-on-ut-WhCi7IA6SCC96OPfPtuaGQ.md
[^6]: lets-analyse-the-open-core-pha-7FE_xGkPSKKRr2TerT0cjw.md
[^7]: lets-analyze-the-phase-mirror-kbBwuoY6QaWAaS93zZyABg.md
[^8]: A Clear Guide to Phase Mirror's Services.pdf
[^9]: License_ Strategic & Legal Analysis.pdf
[^10]: Phase Mirror_ Consultation & SaaS.pdf
[^11]: Agentic Domain-Specific Reasoning.pdf
[^12]: Policy Memo_ Managing Agentic AI Liability with the Phase Mirror Framework.pdf
[^13]: The Phase Mirror does not resolve dissonance—it names it.pdf
[^14]: Understanding Phase Mirror Dissonance_ A Beginner's Guide.pdf
[^15]: The Phase of Mirror Dissonance.pdf
[^16]: Implementation Guide_ Applying Phase Mirror Dissonance.pdf
[^17]: Phase mirror dissonance___Open core must be useful.pdf
[^18]: Phase Mirror_ Comprehensive Services Catalog.docx.pdf```

