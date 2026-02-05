/**
 * Unit tests for ConsistencyScoreCalculator
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { ConsistencyScoreCalculator } from '../reputation/consistency-calculator.js';
import { ContributionRecord, ConsistencyScoreConfig } from '../reputation/types.js';

describe('ConsistencyScoreCalculator', () => {
  let calculator: ConsistencyScoreCalculator;
  let config: ConsistencyScoreConfig;

  beforeEach(() => {
    config = {
      decayRate: 0.01,
      maxContributionAge: 180,
      minContributionsRequired: 3,
      outlierThreshold: 0.3,
      minEventCount: 1,
      excludeOutliersFromScore: false,
      maxConsistencyBonus: 0.2,
    };
    calculator = new ConsistencyScoreCalculator(config);
  });

  describe('calculateSingleContributionScore', () => {
    it('should return 1.0 for perfect match', () => {
      const score = calculator.calculateSingleContributionScore(0.5, 0.5);
      expect(score).toBe(1.0);
    });

    it('should return 0.95 for 5% deviation', () => {
      const score = calculator.calculateSingleContributionScore(0.15, 0.10);
      expect(score).toBeCloseTo(0.95);
    });

    it('should return 0.5 for 50% deviation', () => {
      const score = calculator.calculateSingleContributionScore(0.8, 0.3);
      expect(score).toBeCloseTo(0.5);
    });

    it('should cap deviation at 1.0', () => {
      const score = calculator.calculateSingleContributionScore(1.0, 0.0);
      expect(score).toBe(0.0);
    });

    it('should handle negative differences correctly', () => {
      const score = calculator.calculateSingleContributionScore(0.3, 0.6);
      expect(score).toBeCloseTo(0.7);
    });
  });

  describe('calculateScore', () => {
    it('should return insufficient data result for fewer than minimum contributions', async () => {
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.15,
          consensusFpRate: 0.12,
          timestamp: new Date(),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.45,
          consensusFpRate: 0.50,
          timestamp: new Date(),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(false);
      expect(result.score).toBe(0.5); // Neutral score
      expect(result.unreliableReason).toContain('Only 2 contributions');
    });

    it('should calculate high consistency score for good contributor', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.15,
          consensusFpRate: 0.12,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.45,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.30,
          consensusFpRate: 0.28,
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.score).toBeGreaterThan(0.9); // High consistency
      expect(result.metrics.rulesContributed).toBe(3);
      expect(result.metrics.contributionsConsidered).toBe(3);
      expect(result.metrics.outlierCount).toBe(0);
    });

    it('should detect outliers with high deviation', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.15,
          consensusFpRate: 0.12,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.45,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.80,
          consensusFpRate: 0.30, // Large deviation (0.5)
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000),
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.metrics.outlierCount).toBe(1);
      expect(result.score).toBeLessThan(0.9); // Lower due to outlier
      expect(result.score).toBeGreaterThan(0.5); // But not terrible
    });

    it('should apply time decay correctly', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.10,
          timestamp: new Date(now - 150 * 24 * 60 * 60 * 1000), // 150 days ago (old)
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.50,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000), // 5 days ago (recent)
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.30,
          consensusFpRate: 0.30,
          timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000), // 1 day ago (very recent)
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.score).toBeCloseTo(1.0, 1); // All perfect matches, weighted by recency
      // Recent contributions should have more weight
    });

    it('should filter out old contributions beyond maxContributionAge', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.10,
          timestamp: new Date(now - 200 * 24 * 60 * 60 * 1000), // 200 days ago (too old)
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.50,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 100 * 24 * 60 * 60 * 1000), // 100 days ago
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.30,
          consensusFpRate: 0.30,
          timestamp: new Date(now - 50 * 24 * 60 * 60 * 1000), // 50 days ago
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-4',
          contributedFpRate: 0.40,
          consensusFpRate: 0.40,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000), // 10 days ago
          eventCount: 25,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.metrics.contributionsConsidered).toBe(3); // Excludes 200-day-old contribution
    });

    it('should filter out contributions with low event count', async () => {
      const calculatorWithMinEvents = new ConsistencyScoreCalculator({
        ...config,
        minEventCount: 10,
      });

      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.10,
          consensusFpRate: 0.10,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 5, // Below minimum
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.50,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
          eventCount: 15, // Above minimum
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.30,
          consensusFpRate: 0.30,
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000),
          eventCount: 20, // Above minimum
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-4',
          contributedFpRate: 0.40,
          consensusFpRate: 0.40,
          timestamp: new Date(now - 1 * 24 * 60 * 60 * 1000),
          eventCount: 25, // Above minimum
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculatorWithMinEvents.calculateScore('org-1', contributions);

      expect(result.hasMinimumData).toBe(true);
      expect(result.metrics.contributionsConsidered).toBe(3); // Excludes low-event contribution
    });

    it('should exclude outliers from score when configured', async () => {
      const calculatorExcludingOutliers = new ConsistencyScoreCalculator({
        ...config,
        excludeOutliersFromScore: true,
      });

      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.15,
          consensusFpRate: 0.12,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.45,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.80,
          consensusFpRate: 0.30, // Large outlier
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000),
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const resultWithOutliers = await calculator.calculateScore('org-1', contributions);
      const resultExcludingOutliers = await calculatorExcludingOutliers.calculateScore('org-1', contributions);

      // Score should be higher when outliers are excluded
      expect(resultExcludingOutliers.score).toBeGreaterThan(resultWithOutliers.score);
      expect(resultExcludingOutliers.metrics.outlierCount).toBe(1);
    });

    it('should compute metrics correctly', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.15,
          consensusFpRate: 0.12,
          timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.45,
          consensusFpRate: 0.50,
          timestamp: new Date(now - 20 * 24 * 60 * 60 * 1000),
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-1', // Same rule, different contribution
          contributedFpRate: 0.18,
          consensusFpRate: 0.16,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.metrics.orgId).toBe('org-1');
      expect(result.metrics.rulesContributed).toBe(2); // rule-1 and rule-2
      expect(result.metrics.contributionsConsidered).toBe(3);
      expect(result.metrics.averageDeviation).toBeGreaterThan(0);
      expect(result.metrics.deviationStdDev).toBeGreaterThan(0);
      expect(result.metrics.oldestContributionAge).toBeGreaterThan(29); // ~30 days
      expect(result.metrics.lastContributionDate.getTime()).toBeCloseTo(now - 10 * 24 * 60 * 60 * 1000, -4);
    });

    it('should return neutral score for empty contributions', async () => {
      const result = await calculator.calculateScore('org-1', []);

      expect(result.hasMinimumData).toBe(false);
      expect(result.score).toBe(0.5);
      expect(result.metrics.contributionsConsidered).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle contributions with zero deviation', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 0.5,
          consensusFpRate: 0.5,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.3,
          consensusFpRate: 0.3,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 0.7,
          consensusFpRate: 0.7,
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000),
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.score).toBeCloseTo(1.0);
      expect(result.metrics.averageDeviation).toBe(0);
      expect(result.metrics.outlierCount).toBe(0);
    });

    it('should handle contributions with maximum deviation', async () => {
      const now = Date.now();
      const contributions: ContributionRecord[] = [
        {
          orgId: 'org-1',
          ruleId: 'rule-1',
          contributedFpRate: 1.0,
          consensusFpRate: 0.0,
          timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000),
          eventCount: 10,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-2',
          contributedFpRate: 0.0,
          consensusFpRate: 1.0,
          timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
          eventCount: 15,
          deviation: 0,
          consistencyScore: 0,
        },
        {
          orgId: 'org-1',
          ruleId: 'rule-3',
          contributedFpRate: 1.0,
          consensusFpRate: 0.0,
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000),
          eventCount: 20,
          deviation: 0,
          consistencyScore: 0,
        },
      ];

      const result = await calculator.calculateScore('org-1', contributions);

      expect(result.score).toBeCloseTo(0.0, 1);
      expect(result.metrics.outlierCount).toBe(3); // All are outliers
    });
  });
});
