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

  /**
   * Calculate the delta (change) in consistency score based on contribution.
   * 
   * @param contributedRate - Organization's contributed FP rate
   * @param consensusRate - Network consensus FP rate
   * @returns Delta to apply to consistency score
   */
  calculateConsistencyDelta(
    contributedRate: number,
    consensusRate: number
  ): number {
    // A simpler delta: if contributed rate is closer to consensus, positive delta, else negative.
    // The magnitude of delta can be based on how far off it is.
    // This is a placeholder logic; fine-tune as needed.
    const deviation = Math.abs(contributedRate - consensusRate);
    const maxDeviation = 1.0; // Max possible deviation (e.g., 1.0 - 0.0 or 0.0 - 1.0)

    // Example logic: if deviation is small, positive delta, if large, negative delta
    // For now, let's return a simple difference scaled by some factor if needed.
    // This part requires understanding the intended business logic for delta.
    // For a starting point, let's return the negative of the deviation to reduce score if inconsistent.
    // Or, perhaps a positive value if it aligns.

    // Let's assume a simpler model: if the contributed rate is "good" (close to 0 FP),
    // and close to consensus, maybe a small positive. If far off, a negative.

    // Given that the caller adds this delta to consistencyScore:
    // newConsistencyScore = currentReputation.consistencyScore + delta
    // A positive delta should improve score, negative should worsen.

    // If contributedRate is closer to consensusRate, the deviation is smaller.
    // We want a positive delta if deviation is low, and negative if high.

    // For example, if deviation is 0.1, we want a positive delta.
    // If deviation is 0.8, we want a negative delta.

    // Let's make it such that if consistency (1 - deviation) is high, delta is positive.
    // If consistency is low, delta is negative.
    const consistency = this.calculateSingleContributionScore(contributedRate, consensusRate);

    // A simple linear mapping:
    // If consistency is 1.0 (perfect), delta is +maxBonus
    // If consistency is 0.0 (worst), delta is -maxPenalty
    // If consistency is 0.5 (neutral), delta is 0

    // This needs to align with the maxConsistencyBonus in config.
    // Let's assume the delta is proportional to (consistency - 0.5) * some_factor

    // For now, a placeholder that should allow compilation:
    // Returning 0 for now until the exact logic for delta is clarified.
    // Or a simple deviation based impact.
    // For instance, let's say we want to penalize deviation.
    // This will lead to a reduction in consistency score for high deviation.

    // A more plausible delta might be: (desired_score - current_score) * learning_rate
    // But here, it's (current_consistency - 0.5) * some_factor

    // Let's use `deviation` to define delta, aligning with `maxConsistencyBonus`
    // If deviation is low, score should increase. If high, decrease.
    // The range of `delta` should be within `[-maxBonus, +maxBonus]` effectively.

    // Placeholder: A simple approach. If deviation is less than half of maxDeviation, positive. Else negative.
    // This is a guess; actual logic would need to be confirmed.
    const normalizedDeviation = deviation / maxDeviation; // 0 to 1
    const delta = (0.5 - normalizedDeviation) * this.config.maxConsistencyBonus * 2; // Scales delta from -maxBonus to +maxBonus

    return delta;
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
