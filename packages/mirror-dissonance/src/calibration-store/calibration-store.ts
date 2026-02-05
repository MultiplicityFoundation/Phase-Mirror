/**
 * Calibration Store
 * 
 * Orchestrates FP rate calibration with Byzantine fault tolerance.
 * Integrates identity verification, reputation weighting, and statistical
 * filtering to produce secure consensus FP rates.
 * 
 * Calibration Flow:
 * 1. Fetch FP events for rule from FpStore
 * 2. Group events by organization (using orgIdHash)
 * 3. Fetch reputation weights from ReputationEngine
 * 4. Apply Byzantine filtering (outliers + low reputation)
 * 5. Calculate weighted consensus
 * 6. Update contributor consistency scores
 * 7. Store and return calibration result
 * 
 * @example
 * const store = new CalibrationStore(adapter, fpStore, reputationEngine);
 * const result = await store.aggregateFPsByRule('no-unused-vars');
 * 
 * console.log('Consensus FP rate:', result.consensusFpRate);
 * console.log('Confidence:', result.confidence.category);
 */

import { IFPStore } from '../fp-store/store.js';
import { ReputationEngine } from '../trust/reputation/reputation-engine.js';
import { ByzantineFilter } from '../trust/reputation/byzantine-filter.js';
import { ConsistencyScoreCalculator } from '../trust/reputation/consistency-calculator.js';
import { 
  CalibrationResultExtended,
  ByzantineFilterConfig,
  RawContribution,
  ContributionWeight,
} from '../trust/reputation/types.js';
import { ICalibrationStoreAdapter } from './adapter-types.js';
import { FalsePositiveEvent } from '../../schemas/types.js';

export interface ICalibrationStore {
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResultExtended>;
  getCalibrationResult(ruleId: string): Promise<CalibrationResultExtended | null>;
  aggregateAllRules(): Promise<CalibrationResultExtended[]>;
}

export class CalibrationStore implements ICalibrationStore {
  private readonly byzantineFilter: ByzantineFilter;
  private readonly consistencyCalculator: ConsistencyScoreCalculator;

  constructor(
    private readonly adapter: ICalibrationStoreAdapter,
    private readonly fpStore: IFPStore,
    private readonly reputationEngine: ReputationEngine,
    byzantineConfig?: Partial<ByzantineFilterConfig>
  ) {
    this.byzantineFilter = new ByzantineFilter(byzantineConfig);
    this.consistencyCalculator = new ConsistencyScoreCalculator();
  }

  /**
   * Aggregate FP rates for a rule with Byzantine filtering.
   * 
   * @param ruleId - Rule ID to aggregate
   * @returns Calibration result with consensus FP rate and confidence
   */
  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResultExtended> {
    console.log(`[CalibrationStore] Aggregating FPs for rule: ${ruleId}`);

    // Step 1: Fetch FP events
    const events = await this.fpStore.getFalsePositivesByRule(ruleId);
    console.log(`[CalibrationStore] Found ${events.length} FP events`);

    if (events.length === 0) {
      return this.createEmptyResult(ruleId);
    }

    // Step 2: Group by organization and calculate per-org FP rates
    const orgContributions = this.calculateOrgContributions(events);
    console.log(`[CalibrationStore] ${orgContributions.length} organizations contributed`);

    if (orgContributions.length === 0) {
      return this.createEmptyResult(ruleId);
    }

    // Step 3: Fetch reputation weights
    const weights = await this.fetchReputationWeights(
      orgContributions.map(c => c.orgIdHash)
    );
    console.log(`[CalibrationStore] Fetched ${weights.size} reputation weights`);

    // Step 4: Apply Byzantine filtering
    const filterResult = await this.byzantineFilter.filterContributors(
      orgContributions,
      weights
    );
    console.log(`[CalibrationStore] Byzantine filtering: ${filterResult.trustedCount}/${filterResult.totalContributors} trusted (${(filterResult.filterRate * 100).toFixed(1)}% filtered)`);

    // Step 5: Calculate weighted consensus
    const consensusFpRate = this.byzantineFilter.calculateWeightedConsensus(
      filterResult.trustedContributors
    );
    console.log(`[CalibrationStore] Consensus FP rate: ${(consensusFpRate * 100).toFixed(2)}%`);

    // Step 6: Calculate confidence
    const confidence = this.byzantineFilter.calculateConfidence(
      filterResult.trustedContributors,
      filterResult.statistics
    );
    console.log(`[CalibrationStore] Confidence: ${confidence.category} (${(confidence.level * 100).toFixed(1)}%)`);

    // Step 7: Update consistency scores (async, non-blocking)
    this.updateConsistencyScoresAsync(
      ruleId,
      orgContributions,
      consensusFpRate
    );

    // Step 8: Create and store result
    const result: CalibrationResultExtended = {
      ruleId,
      consensusFpRate,
      trustedContributorCount: filterResult.trustedCount,
      totalContributorCount: filterResult.totalContributors,
      totalEventCount: events.length,
      calculatedAt: new Date(),
      confidence,
      byzantineFilterSummary: {
        filteringApplied: filterResult.totalContributors >= 5,
        filterRate: filterResult.filterRate,
        outliersFiltered: filterResult.outlierFiltered.length,
        lowReputationFiltered: filterResult.reputationFiltered.length,
        zScoreThreshold: this.byzantineFilter.zScoreThreshold,
        reputationPercentile: this.byzantineFilter['config'].byzantineFilterPercentile,
      },
    };

    await this.adapter.storeCalibrationResult(result);
    console.log(`[CalibrationStore] Calibration result stored for ${ruleId}`);

    return result;
  }

  /**
   * Get stored calibration result for a rule.
   */
  async getCalibrationResult(ruleId: string): Promise<CalibrationResultExtended | null> {
    return await this.adapter.getCalibrationResult(ruleId);
  }

  /**
   * Aggregate FPs for multiple rules (batch operation).
   */
  async aggregateAllRules(): Promise<CalibrationResultExtended[]> {
    // Get unique rule IDs from FP store
    // This is a simplified implementation - in production you'd need
    // a way to list all rules from the FP store
    console.log('[CalibrationStore] Batch aggregation not yet implemented');
    return [];
  }

  /**
   * Calculate per-organization contributions from FP events.
   */
  private calculateOrgContributions(events: FalsePositiveEvent[]): RawContribution[] {
    // Group by organization
    const orgStats = new Map<string, { fpCount: number; totalCount: number }>();
    
    for (const event of events) {
      if (!event.orgIdHash) {
        continue; // Skip events without orgIdHash
      }
      
      if (!orgStats.has(event.orgIdHash)) {
        orgStats.set(event.orgIdHash, { fpCount: 0, totalCount: 0 });
      }
      
      const stats = orgStats.get(event.orgIdHash)!;
      stats.totalCount++;
      
      // Count as FP if explicitly marked in context
      // The event is already a false positive event, so we consider it as FP
      stats.fpCount++;
    }
    
    // Calculate FP rates
    const contributions: RawContribution[] = [];
    for (const [orgIdHash, stats] of orgStats.entries()) {
      const fpRate = stats.totalCount > 0 ? stats.fpCount / stats.totalCount : 0;
      contributions.push({
        orgIdHash,
        fpRate,
        eventCount: stats.totalCount,
      });
    }
    
    return contributions;
  }

  /**
   * Fetch reputation weights for organizations.
   */
  private async fetchReputationWeights(
    orgIdHashes: string[]
  ): Promise<Map<string, ContributionWeight>> {
    const weights = new Map<string, ContributionWeight>();
    
    for (const orgIdHash of orgIdHashes) {
      try {
        const weight = await this.reputationEngine.calculateContributionWeight(orgIdHash);
        weights.set(orgIdHash, weight);
      } catch (error) {
        console.warn(`[CalibrationStore] Failed to fetch weight for ${orgIdHash}:`, error);
        // Continue with other orgs
      }
    }
    
    return weights;
  }

  /**
   * Update consistency scores asynchronously (non-blocking).
   */
  private updateConsistencyScoresAsync(
    ruleId: string,
    contributions: RawContribution[],
    consensusFpRate: number
  ): void {
    // Run async without awaiting
    (async () => {
      try {
        for (const contrib of contributions) {
          const delta = this.consistencyCalculator.calculateConsistencyDelta(
            contrib.fpRate,
            consensusFpRate
          );
          
          if (delta !== 0) {
            const currentReputation = await this.reputationEngine.getReputation(contrib.orgIdHash);
            if (currentReputation) {
              const newConsistencyScore = Math.max(
                0,
                Math.min(1.0, currentReputation.consistencyScore + delta)
              );
              
              await this.reputationEngine.updateReputation(contrib.orgIdHash, {
                consistencyScore: newConsistencyScore,
              });
            }
          }
        }
        console.log(`[CalibrationStore] Updated consistency scores for ${contributions.length} orgs`);
      } catch (error) {
        console.error('[CalibrationStore] Failed to update consistency scores:', error);
      }
    })();
  }

  /**
   * Create an empty calibration result.
   */
  private createEmptyResult(ruleId: string): CalibrationResultExtended {
    return {
      ruleId,
      consensusFpRate: 0,
      trustedContributorCount: 0,
      totalContributorCount: 0,
      totalEventCount: 0,
      calculatedAt: new Date(),
      confidence: {
        level: 0,
        category: 'insufficient',
        factors: {
          contributorCountFactor: 0,
          agreementFactor: 0,
          eventCountFactor: 0,
          reputationFactor: 0,
        },
        lowConfidenceReason: 'No FP events found',
      },
      byzantineFilterSummary: {
        filteringApplied: false,
        filterRate: 0,
        outliersFiltered: 0,
        lowReputationFiltered: 0,
        zScoreThreshold: this.byzantineFilter.zScoreThreshold,
        reputationPercentile: 0.2,
      },
    };
  }
}
