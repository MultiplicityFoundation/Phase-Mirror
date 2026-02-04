/**
 * Unit tests for ByzantineFilter
 */

import { ByzantineFilter } from '../reputation/byzantine-filter.js';
import {
  RawContribution,
  ContributionWeight,
} from '../reputation/types.js';

describe('ByzantineFilter', () => {
  describe('constructor', () => {
    it('should use default configuration when no config provided', () => {
      const filter = new ByzantineFilter();
      expect(filter).toBeDefined();
    });

    it('should accept partial configuration and merge with defaults', () => {
      const filter = new ByzantineFilter({
        zScoreThreshold: 2.5,
        byzantineFilterPercentile: 0.3,
      });
      expect(filter).toBeDefined();
    });
  });

  describe('filterContributors', () => {
    it('should filter out statistical outliers with high Z-scores', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.052, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.058, eventCount: 100 },
        { orgIdHash: 'org6', fpRate: 0.95, eventCount: 100 }, // Extreme outlier
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.75, factors: { baseReputation: 0.75, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.65, factors: { baseReputation: 0.65, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.6, factors: { baseReputation: 0.6, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org6', { orgId: 'org6', weight: 0.85, factors: { baseReputation: 0.85, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }], // High weight but outlier
      ]);

      // Use lower Z-score threshold to catch this outlier
      const filter = new ByzantineFilter({
        zScoreThreshold: 2.0,
      });
      const result = await filter.filterContributors(contributions, weights);

      // org6 should be filtered as outlier despite high weight
      expect(result.outlierFiltered.length).toBe(1);
      expect(result.outlierFiltered[0].orgIdHash).toBe('org6');
      expect(result.outlierFiltered[0].reason).toBe('statistical_outlier');
    });

    it('should filter out bottom percentile by reputation weight', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.052, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.058, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.9, factors: { baseReputation: 0.9, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.2, factors: { baseReputation: 0.2, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.15, factors: { baseReputation: 0.15, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        byzantineFilterPercentile: 0.2, // Bottom 20%
      });

      const result = await filter.filterContributors(contributions, weights);

      // org5 (lowest weight) should be filtered
      expect(result.reputationFiltered.length).toBe(1);
      expect(result.reputationFiltered[0].orgIdHash).toBe('org5');
      expect(result.reputationFiltered[0].reason).toBe('low_reputation');
    });

    it('should filter out contributors below minimum reputation', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.05, factors: { baseReputation: 0.05, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        requireMinimumReputation: true,
        minimumReputationScore: 0.1,
      });

      const result = await filter.filterContributors(contributions, weights);

      // org2 should be filtered for being below minimum
      expect(result.otherFiltered.length).toBe(1);
      expect(result.otherFiltered[0].orgIdHash).toBe('org2');
      expect(result.otherFiltered[0].reason).toBe('below_minimum_reputation');
    });

    it('should filter out contributors with no stake when required', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.8, factors: { baseReputation: 0.7, stakeMultiplier: 0.1, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.5, factors: { baseReputation: 0.5, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        requireStake: true,
      });

      const result = await filter.filterContributors(contributions, weights);

      // org2 should be filtered for no stake
      expect(result.otherFiltered.length).toBe(1);
      expect(result.otherFiltered[0].orgIdHash).toBe('org2');
      expect(result.otherFiltered[0].reason).toBe('no_stake');
    });

    it('should handle insufficient contributors gracefully', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.75, factors: { baseReputation: 0.75, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        minContributorsForFiltering: 5,
      });

      const result = await filter.filterContributors(contributions, weights);

      // Should return all valid contributors without statistical filtering
      expect(result.trustedContributors.length).toBe(2);
      expect(result.outlierFiltered.length).toBe(0);
      expect(result.reputationFiltered.length).toBe(0);
    });

    it('should filter out contributors with missing weights', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        // org2 is missing
      ]);

      const filter = new ByzantineFilter();
      const result = await filter.filterContributors(contributions, weights);

      // org2 should be filtered for missing weight
      expect(result.otherFiltered.length).toBe(1);
      expect(result.otherFiltered[0].orgIdHash).toBe('org2');
      expect(result.otherFiltered[0].reason).toBe('insufficient_data');
    });

    it('should calculate correct filter rate', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.052, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.058, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.9, factors: { baseReputation: 0.9, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.2, factors: { baseReputation: 0.2, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.15, factors: { baseReputation: 0.15, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        byzantineFilterPercentile: 0.2, // Bottom 20%
      });

      const result = await filter.filterContributors(contributions, weights);

      expect(result.totalContributors).toBe(5);
      expect(result.trustedCount).toBe(4);
      expect(result.filterRate).toBeCloseTo(0.2); // 20% filtered
    });

    it('should include Z-scores in trusted contributors', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.052, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.058, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.9, factors: { baseReputation: 0.9, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.6, factors: { baseReputation: 0.6, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.5, factors: { baseReputation: 0.5, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter({
        byzantineFilterPercentile: 0.2,
      });

      const result = await filter.filterContributors(contributions, weights);

      // All trusted contributors should have Z-score calculated
      result.trustedContributors.forEach(contrib => {
        expect(contrib.zScore).toBeDefined();
        expect(typeof contrib.zScore).toBe('number');
      });
    });

    it('should include weight factors breakdown', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { 
          orgId: 'org1', 
          weight: 0.95, 
          factors: { 
            baseReputation: 0.8, 
            stakeMultiplier: 0.1, 
            consistencyBonus: 0.05 
          } 
        }],
      ]);

      const filter = new ByzantineFilter({
        minContributorsForFiltering: 1, // Allow single contributor for test
      });

      const result = await filter.filterContributors(contributions, weights);

      expect(result.trustedContributors.length).toBe(1);
      expect(result.trustedContributors[0].weightFactors.baseReputation).toBe(0.8);
      expect(result.trustedContributors[0].weightFactors.stakeMultiplier).toBe(0.1);
      expect(result.trustedContributors[0].weightFactors.consistencyBonus).toBe(0.05);
      // Total multiplier should be sum of all factors: 0.8 + 0.1 + 0.05 = 0.95
      expect(result.trustedContributors[0].weightFactors.totalMultiplier).toBeCloseTo(0.95);
    });
  });

  describe('calculateWeightedConsensus', () => {
    it('should calculate correct weighted average', () => {
      const filter = new ByzantineFilter();
      
      const trustedContributors = [
        {
          orgIdHash: 'org1',
          fpRate: 0.05,
          weight: 0.8,
          eventCount: 100,
          zScore: 0,
          weightFactors: { baseReputation: 0.8, stakeMultiplier: 0, consistencyBonus: 0, totalMultiplier: 0 }
        },
        {
          orgIdHash: 'org2',
          fpRate: 0.10,
          weight: 0.2,
          eventCount: 100,
          zScore: 0,
          weightFactors: { baseReputation: 0.2, stakeMultiplier: 0, consistencyBonus: 0, totalMultiplier: 0 }
        },
      ];

      const consensus = filter.calculateWeightedConsensus(trustedContributors);

      // Expected: (0.05 * 0.8 + 0.10 * 0.2) / (0.8 + 0.2) = 0.06
      expect(consensus).toBeCloseTo(0.06);
    });

    it('should return 0 for empty contributors', () => {
      const filter = new ByzantineFilter();
      const consensus = filter.calculateWeightedConsensus([]);
      expect(consensus).toBe(0);
    });

    it('should handle single contributor', () => {
      const filter = new ByzantineFilter();
      
      const trustedContributors = [
        {
          orgIdHash: 'org1',
          fpRate: 0.05,
          weight: 1.0,
          eventCount: 100,
          zScore: 0,
          weightFactors: { baseReputation: 1.0, stakeMultiplier: 0, consistencyBonus: 0, totalMultiplier: 0 }
        },
      ];

      const consensus = filter.calculateWeightedConsensus(trustedContributors);
      expect(consensus).toBe(0.05);
    });

    it('should give higher weight to higher reputation contributors', () => {
      const filter = new ByzantineFilter();
      
      const trustedContributors = [
        {
          orgIdHash: 'org1',
          fpRate: 0.05,
          weight: 0.9, // High reputation
          eventCount: 100,
          zScore: 0,
          weightFactors: { baseReputation: 0.9, stakeMultiplier: 0, consistencyBonus: 0, totalMultiplier: 0 }
        },
        {
          orgIdHash: 'org2',
          fpRate: 0.20,
          weight: 0.1, // Low reputation
          eventCount: 100,
          zScore: 0,
          weightFactors: { baseReputation: 0.1, stakeMultiplier: 0, consistencyBonus: 0, totalMultiplier: 0 }
        },
      ];

      const consensus = filter.calculateWeightedConsensus(trustedContributors);

      // Result should be closer to 0.05 than 0.20 due to weighting
      expect(consensus).toBeGreaterThan(0.05);
      expect(consensus).toBeLessThan(0.10);
    });
  });

  describe('statistics', () => {
    it('should calculate correct statistical summary', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.06, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.055, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.052, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.058, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.9, factors: { baseReputation: 0.9, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.6, factors: { baseReputation: 0.6, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.5, factors: { baseReputation: 0.5, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter();
      const result = await filter.filterContributors(contributions, weights);

      expect(result.statistics).toBeDefined();
      expect(result.statistics.meanFpRate).toBeCloseTo(0.055);
      expect(result.statistics.stdDevFpRate).toBeGreaterThan(0);
      expect(result.statistics.medianFpRate).toBeCloseTo(0.055);
      expect(result.statistics.trustedMeanFpRate).toBeGreaterThan(0);
      expect(result.statistics.meanWeight).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty contributions', async () => {
      const filter = new ByzantineFilter();
      const result = await filter.filterContributors([], new Map());

      expect(result.trustedContributors.length).toBe(0);
      expect(result.totalContributors).toBe(0);
      expect(result.trustedCount).toBe(0);
    });

    it('should handle zero standard deviation (all same FP rate)', async () => {
      const contributions: RawContribution[] = [
        { orgIdHash: 'org1', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org2', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org3', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org4', fpRate: 0.05, eventCount: 100 },
        { orgIdHash: 'org5', fpRate: 0.05, eventCount: 100 },
      ];

      const weights = new Map<string, ContributionWeight>([
        ['org1', { orgId: 'org1', weight: 0.9, factors: { baseReputation: 0.9, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org2', { orgId: 'org2', weight: 0.8, factors: { baseReputation: 0.8, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org3', { orgId: 'org3', weight: 0.7, factors: { baseReputation: 0.7, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org4', { orgId: 'org4', weight: 0.6, factors: { baseReputation: 0.6, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
        ['org5', { orgId: 'org5', weight: 0.5, factors: { baseReputation: 0.5, stakeMultiplier: 0.0, consistencyBonus: 0.0 } }],
      ]);

      const filter = new ByzantineFilter();
      const result = await filter.filterContributors(contributions, weights);

      // Should not filter any as outliers (Z-score would be 0 for all)
      expect(result.outlierFiltered.length).toBe(0);
      expect(result.statistics.stdDevFpRate).toBe(0);
    });
  });
});
