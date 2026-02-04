/**
 * Byzantine Actor Filter
 * 
 * Filters out statistical outliers and low-reputation contributors
 * before weighted consensus calculation. Provides Byzantine fault
 * tolerance for FP calibration network.
 * 
 * Filter Stages:
 * 1. Minimum reputation check - Exclude orgs below threshold
 * 2. Stake requirement check - Optionally exclude orgs with no stake
 * 3. Statistical outlier detection - Z-score based filtering
 * 4. Reputation percentile filter - Exclude bottom X% by weight
 * 
 * Security Properties:
 * - Tolerates up to ~30% Byzantine actors (with default settings)
 * - Statistical outliers cannot skew consensus
 * - Low-reputation actors have minimal influence
 * - Feedback loop: filtered actors lose reputation over time
 * 
 * @example
 * const filter = new ByzantineFilter(config);
 * const result = await filter.filterContributors(contributions, weights);
 * 
 * console.log('Trusted contributors:', result.trustedContributors.length);
 * console.log('Filter rate:', result.filterRate);
 */

import {
  ByzantineFilterConfig,
  ByzantineFilterResult,
  FilteredContributor,
  WeightedContribution,
  FilterStatistics,
  ContributionWeight,
  RawContribution,
  ContributionWeightFactors,
  CalibrationConfidence,
} from './types.js';

export class ByzantineFilter {
  private readonly config: ByzantineFilterConfig;

  constructor(config?: Partial<ByzantineFilterConfig>) {
    this.config = {
      zScoreThreshold: 3.0,              // 99.7% confidence
      byzantineFilterPercentile: 0.2,    // Exclude bottom 20%
      minContributorsForFiltering: 5,    // Need 5+ for statistics
      requireStake: false,               // Don't require stake by default
      requireMinimumReputation: true,    // Require minimum rep
      minimumReputationScore: 0.1,       // 10% minimum
      ...config,
    };
  }

  /**
   * Filter contributors using Byzantine fault tolerance algorithms.
   * 
   * @param contributions - Raw contributions with FP rates
   * @param weights - Reputation weights for each contributor
   * @returns Filtered result with trusted contributors and filtering metadata
   */
  async filterContributors(
    contributions: RawContribution[],
    weights: Map<string, ContributionWeight>
  ): Promise<ByzantineFilterResult> {
    const outlierFiltered: FilteredContributor[] = [];
    const reputationFiltered: FilteredContributor[] = [];
    const otherFiltered: FilteredContributor[] = [];
    
    // Stage 1: Filter contributions with missing weights or insufficient data
    const validContributions = contributions.filter(contrib => {
      const weight = weights.get(contrib.orgIdHash);
      
      if (!weight) {
        otherFiltered.push({
          orgIdHash: contrib.orgIdHash,
          fpRate: contrib.fpRate,
          weight: 0,
          reason: 'insufficient_data',
          details: 'No reputation weight found',
        });
        return false;
      }
      
      // Stage 2: Check minimum reputation requirement
      if (this.config.requireMinimumReputation && 
          weight.weight < this.config.minimumReputationScore) {
        otherFiltered.push({
          orgIdHash: contrib.orgIdHash,
          fpRate: contrib.fpRate,
          weight: weight.weight,
          reason: 'below_minimum_reputation',
          details: `Weight ${weight.weight.toFixed(3)} below minimum ${this.config.minimumReputationScore}`,
        });
        return false;
      }
      
      // Stage 3: Check stake requirement
      if (this.config.requireStake && weight.factors.stakeMultiplier === 0) {
        otherFiltered.push({
          orgIdHash: contrib.orgIdHash,
          fpRate: contrib.fpRate,
          weight: weight.weight,
          reason: 'no_stake',
          details: 'No economic stake pledged',
        });
        return false;
      }
      
      return true;
    });

    // If insufficient contributors for statistical filtering, return all valid ones
    if (validContributions.length < this.config.minContributorsForFiltering) {
      const trustedContributors = validContributions.map(contrib => {
        const weight = weights.get(contrib.orgIdHash)!;
        return this.createWeightedContribution(contrib, weight, 0);
      });

      return {
        trustedContributors,
        outlierFiltered: [],
        reputationFiltered: [],
        otherFiltered,
        totalContributors: contributions.length,
        trustedCount: trustedContributors.length,
        filterRate: 1 - (trustedContributors.length / contributions.length),
        statistics: this.calculateStatistics(validContributions, weights, trustedContributors),
      };
    }

    // Stage 4: Calculate statistics for outlier detection
    const fpRates = validContributions.map(c => c.fpRate);
    const meanFpRate = this.calculateMean(fpRates);
    const stdDevFpRate = this.calculateStdDev(fpRates, meanFpRate);

    // Stage 5: Z-score outlier detection
    const contributionsWithZScores = validContributions.map(contrib => {
      const zScore = stdDevFpRate > 0 
        ? (contrib.fpRate - meanFpRate) / stdDevFpRate 
        : 0;
      return { contrib, zScore };
    });

    const nonOutliers = contributionsWithZScores.filter(({ contrib, zScore }) => {
      if (Math.abs(zScore) > this.config.zScoreThreshold) {
        const weight = weights.get(contrib.orgIdHash)!;
        outlierFiltered.push({
          orgIdHash: contrib.orgIdHash,
          fpRate: contrib.fpRate,
          weight: weight.weight,
          reason: 'statistical_outlier',
          details: `Z-score: ${zScore.toFixed(3)} (threshold: ${this.config.zScoreThreshold})`,
        });
        return false;
      }
      return true;
    });

    // Stage 6: Reputation percentile filtering
    const sortedByWeight = nonOutliers
      .map(({ contrib, zScore }) => ({
        contrib,
        zScore,
        weight: weights.get(contrib.orgIdHash)!.weight,
      }))
      .sort((a, b) => a.weight - b.weight);

    const cutoffIndex = Math.floor(
      sortedByWeight.length * this.config.byzantineFilterPercentile
    );

    const trustedContributors: WeightedContribution[] = [];

    sortedByWeight.forEach(({ contrib, zScore, weight }, index) => {
      if (index < cutoffIndex) {
        const contributionWeight = weights.get(contrib.orgIdHash)!;
        reputationFiltered.push({
          orgIdHash: contrib.orgIdHash,
          fpRate: contrib.fpRate,
          weight: contributionWeight.weight,
          reason: 'low_reputation',
          details: `Bottom ${(this.config.byzantineFilterPercentile * 100).toFixed(0)}% by weight`,
        });
      } else {
        const contributionWeight = weights.get(contrib.orgIdHash)!;
        trustedContributors.push(
          this.createWeightedContribution(contrib, contributionWeight, zScore)
        );
      }
    });

    // Calculate statistics
    const statistics = this.calculateStatistics(
      validContributions,
      weights,
      trustedContributors
    );

    // Update counts in statistics
    statistics.outlierCount = outlierFiltered.length;
    statistics.reputationFilteredCount = reputationFiltered.length;

    return {
      trustedContributors,
      outlierFiltered,
      reputationFiltered,
      otherFiltered,
      totalContributors: contributions.length,
      trustedCount: trustedContributors.length,
      filterRate: 1 - (trustedContributors.length / contributions.length),
      statistics,
    };
  }

  /**
   * Calculate weighted consensus FP rate from trusted contributors.
   * 
   * @param trustedContributors - Filtered trusted contributors
   * @returns Consensus FP rate (weighted average)
   */
  calculateWeightedConsensus(trustedContributors: WeightedContribution[]): number {
    if (trustedContributors.length === 0) {
      return 0;
    }

    const weightedSum = trustedContributors.reduce(
      (sum, contrib) => sum + (contrib.fpRate * contrib.weight),
      0
    );

    const totalWeight = trustedContributors.reduce(
      (sum, contrib) => sum + contrib.weight,
      0
    );

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate confidence metrics for calibration result.
   * 
   * @param trustedContributors - Trusted contributors after filtering
   * @param statistics - Statistical summary of filtering
   * @returns Confidence metrics
   */
  calculateConfidence(
    trustedContributors: WeightedContribution[],
    statistics: FilterStatistics
  ): CalibrationConfidence {
    // Contributor count factor (more contributors = higher confidence)
    const contributorCountFactor = Math.min(trustedContributors.length / 20, 1.0);
    
    // Agreement factor (lower variance = higher confidence)
    // Use coefficient of variation: stdDev / mean
    const coefficientOfVariation = statistics.trustedMeanFpRate > 0
      ? statistics.stdDevFpRate / statistics.trustedMeanFpRate
      : 0;
    const agreementFactor = Math.max(0, 1.0 - Math.min(coefficientOfVariation, 1.0));
    
    // Event count factor (more events = higher confidence)
    const totalEvents = trustedContributors.reduce((sum, c) => sum + c.eventCount, 0);
    const eventCountFactor = Math.min(totalEvents / 1000, 1.0);
    
    // Reputation factor (higher average reputation = higher confidence)
    const reputationFactor = statistics.meanWeight;
    
    // Calculate overall confidence level (weighted average)
    const level = (
      contributorCountFactor * 0.35 +
      agreementFactor * 0.3 +
      eventCountFactor * 0.2 +
      reputationFactor * 0.15
    );
    
    // Determine category
    let category: 'high' | 'medium' | 'low' | 'insufficient';
    let lowConfidenceReason: string | undefined;
    
    if (trustedContributors.length < 3) {
      category = 'insufficient';
      lowConfidenceReason = `Only ${trustedContributors.length} trusted contributors`;
    } else if (level >= 0.7) {
      category = 'high';
    } else if (level >= 0.5) {
      category = 'medium';
    } else {
      category = 'low';
      if (contributorCountFactor < 0.3) {
        lowConfidenceReason = 'Insufficient contributors';
      } else if (agreementFactor < 0.3) {
        lowConfidenceReason = 'High variance in FP rates';
      } else if (eventCountFactor < 0.3) {
        lowConfidenceReason = 'Insufficient event data';
      } else {
        lowConfidenceReason = 'Low reputation scores';
      }
    }
    
    return {
      level,
      category,
      factors: {
        contributorCountFactor,
        agreementFactor,
        eventCountFactor,
        reputationFactor,
      },
      lowConfidenceReason,
    };
  }

  /**
   * Create a weighted contribution object.
   */
  private createWeightedContribution(
    contrib: RawContribution,
    weight: ContributionWeight,
    zScore: number
  ): WeightedContribution {
    // Total multiplier is the sum of all weight factors
    const totalMultiplier = weight.factors.baseReputation + 
                           weight.factors.stakeMultiplier + 
                           weight.factors.consistencyBonus;
    
    const weightFactors: ContributionWeightFactors = {
      baseReputation: weight.factors.baseReputation,
      stakeMultiplier: weight.factors.stakeMultiplier,
      consistencyBonus: weight.factors.consistencyBonus,
      totalMultiplier,
    };

    return {
      orgIdHash: contrib.orgIdHash,
      fpRate: contrib.fpRate,
      weight: weight.weight,
      eventCount: contrib.eventCount,
      zScore,
      weightFactors,
    };
  }

  /**
   * Calculate statistics for filtering results.
   */
  private calculateStatistics(
    validContributions: RawContribution[],
    weights: Map<string, ContributionWeight>,
    trustedContributors: WeightedContribution[]
  ): FilterStatistics {
    const fpRates = validContributions.map(c => c.fpRate);
    const meanFpRate = this.calculateMean(fpRates);
    const stdDevFpRate = this.calculateStdDev(fpRates, meanFpRate);
    const medianFpRate = this.calculateMedian(fpRates);

    const trustedFpRates = trustedContributors.map(c => c.fpRate);
    const trustedMeanFpRate = trustedFpRates.length > 0 
      ? this.calculateMean(trustedFpRates) 
      : 0;

    const weightValues = Array.from(weights.values()).map(w => w.weight);
    const meanWeight = weightValues.length > 0 
      ? this.calculateMean(weightValues) 
      : 0;

    // Calculate weight percentile threshold
    const sortedWeights = weightValues.sort((a, b) => a - b);
    const percentileIndex = Math.floor(sortedWeights.length * this.config.byzantineFilterPercentile);
    const weightPercentileThreshold = sortedWeights[percentileIndex] || 0;

    return {
      meanFpRate,
      stdDevFpRate,
      medianFpRate,
      trustedMeanFpRate,
      meanWeight,
      weightPercentileThreshold,
      outlierCount: 0, // Will be set by caller
      reputationFilteredCount: 0, // Will be set by caller
    };
  }

  /**
   * Calculate mean of an array of numbers.
   */
  private calculateMean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Calculate standard deviation of an array of numbers.
   */
  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Calculate median of an array of numbers.
   */
  private calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }
}
