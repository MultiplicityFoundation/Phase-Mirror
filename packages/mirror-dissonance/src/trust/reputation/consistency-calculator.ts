/**
 * Consistency Score Calculator
 * 
 * Calculates how well an organization's FP contributions align with
 * network consensus. Enables Byzantine fault tolerance by downweighting
 * outliers and upweighting consistent contributors.
 */

import { ContributionRecord, ConsistencyMetrics, ConsistencyScoreConfig, ConsistencyScoreResult } from './types.js';

/**
 * Consistency Score Calculator
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
 * const result = calculator.calculateScore('org-123', contributions);
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
   * Note: Method is async to allow for future extensibility (e.g., database lookups)
   * while maintaining consistent interface with other Trust Module components.
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
    const weights = new Map<string, number>();
    const now = Date.now();

    for (const contrib of contributions) {
      const ageMs = now - contrib.timestamp.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
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
      
      // Optionally exclude outliers
      if (this.config.excludeOutliersFromScore && outliers.has(key)) {
        continue;
      }

      weightedSum += contrib.consistencyScore * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      return 0.5; // Neutral score if no contributions
    }

    return weightedSum / totalWeight;
  }

  /**
   * Compute detailed consistency metrics.
   */
  private computeMetrics(
    orgId: string,
    contributions: ContributionRecord[],
    outliers: Set<string>,
    overallScore: number
  ): ConsistencyMetrics {
    if (contributions.length === 0) {
      return {
        orgId,
        overallScore,
        rulesContributed: 0,
        contributionsConsidered: 0,
        averageDeviation: 0,
        deviationStdDev: 0,
        outlierCount: 0,
        lastContributionDate: new Date(0),
        oldestContributionAge: 0,
      };
    }

    // Calculate unique rules
    const uniqueRules = new Set(contributions.map(c => c.ruleId));

    // Calculate average deviation
    const deviations = contributions.map(c => c.deviation);
    const averageDeviation = deviations.reduce((sum, d) => sum + d, 0) / deviations.length;

    // Calculate standard deviation of deviations
    const variance = deviations.reduce((sum, d) => {
      return sum + Math.pow(d - averageDeviation, 2);
    }, 0) / deviations.length;
    const deviationStdDev = Math.sqrt(variance);

    // Find last contribution date
    const lastContributionDate = new Date(
      Math.max(...contributions.map(c => c.timestamp.getTime()))
    );

    // Calculate oldest contribution age
    const oldestTimestamp = Math.min(...contributions.map(c => c.timestamp.getTime()));
    const now = Date.now();
    const oldestContributionAge = (now - oldestTimestamp) / (24 * 60 * 60 * 1000);

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
   * Create result for insufficient data case.
   */
  private createInsufficientDataResult(
    orgId: string,
    contributions: ContributionRecord[],
    reason: string
  ): ConsistencyScoreResult {
    return {
      score: 0.5, // Neutral score for new orgs
      metrics: {
        orgId,
        overallScore: 0.5,
        rulesContributed: 0,
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
}
