/**
 * Reputation Engine
 * 
 * Core reputation management system for Byzantine fault tolerance.
 * Calculates contribution weights, manages stakes, and filters malicious actors.
 */

import { OrganizationReputation, ContributionWeight, StakePledge } from './types.js';
import { IReputationStoreAdapter } from '../adapters/types.js';

export interface ReputationEngineConfig {
  minStakeForParticipation: number;   // Default: 1000 USD
  stakeMultiplierCap: number;          // Default: 1.0 (at $1000)
  consistencyBonusCap: number;         // Default: 0.2
  byzantineFilterPercentile: number;   // Default: 0.2 (exclude bottom 20%)
  outlierZScoreThreshold: number;      // Default: 3.0
}

export class ReputationEngine {
  constructor(
    private store: IReputationStoreAdapter,
    private config: ReputationEngineConfig
  ) {}

  /**
   * Calculate contribution weight based on reputation
   * Low reputation orgs have minimal impact on aggregation
   */
  async calculateContributionWeight(orgId: string): Promise<ContributionWeight> {
    const reputation = await this.getReputation(orgId);
    
    if (!reputation) {
      // New org with no reputation - minimum weight
      return {
        orgId,
        weight: 0.1,
        factors: {
          baseReputation: 0.1,
          stakeMultiplier: 0.0,
          consistencyBonus: 0.0,
        },
      };
    }

    // Calculate base reputation factor
    const baseReputation = reputation.reputationScore;

    // Calculate stake multiplier
    const stakeRatio = Math.min(
      reputation.stakePledge / this.config.minStakeForParticipation,
      1.0
    );
    const stakeMultiplier = stakeRatio * this.config.stakeMultiplierCap;

    // Calculate consistency bonus
    const consistencyBonus = reputation.consistencyScore * this.config.consistencyBonusCap;

    // Final weight is base + multipliers
    const weight = Math.min(baseReputation + stakeMultiplier + consistencyBonus, 1.0);

    return {
      orgId,
      weight,
      factors: {
        baseReputation,
        stakeMultiplier,
        consistencyBonus,
      },
    };
  }

  /**
   * Get organization reputation
   */
  async getReputation(orgId: string): Promise<OrganizationReputation | null> {
    return await this.store.getReputation(orgId);
  }

  /**
   * Update reputation based on contribution behavior
   */
  async updateReputation(
    orgId: string,
    update: Partial<OrganizationReputation>
  ): Promise<void> {
    const existing = await this.store.getReputation(orgId);
    
    if (!existing) {
      // Create new reputation record
      const newReputation: OrganizationReputation = {
        orgId,
        reputationScore: 0.5,  // Start at neutral
        stakePledge: 0,
        contributionCount: 0,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.1,
        volumeScore: 0.0,
        lastUpdated: new Date(),
        ...update,
      };
      await this.store.updateReputation(newReputation);
    } else {
      // Update existing record
      const updated: OrganizationReputation = {
        ...existing,
        ...update,
        lastUpdated: new Date(),
      };
      await this.store.updateReputation(updated);
    }
  }

  /**
   * Slash stake for detected malicious behavior
   */
  async slashStake(orgId: string, reason: string): Promise<void> {
    const pledge = await this.store.getStakePledge(orgId);
    
    if (!pledge || pledge.status !== 'active') {
      throw new Error(`No active stake found for org: ${orgId}`);
    }

    const slashedPledge: StakePledge = {
      ...pledge,
      status: 'slashed',
      slashReason: reason,
    };

    await this.store.updateStakePledge(slashedPledge);

    // Also update reputation
    const currentReputation = await this.getReputation(orgId);
    await this.updateReputation(orgId, {
      reputationScore: 0.0,  // Zero out reputation
      flaggedCount: (currentReputation?.flaggedCount ?? 0) + 1,
    });
  }

  /**
   * Check if org meets minimum requirements for network participation
   */
  async canParticipateInNetwork(orgId: string): Promise<boolean> {
    const reputation = await this.getReputation(orgId);
    
    if (!reputation) {
      return false;  // No reputation record
    }

    // Check minimum stake requirement
    if (reputation.stakePledge < this.config.minStakeForParticipation) {
      return false;
    }

    // Check reputation is not zero (not slashed)
    if (reputation.reputationScore === 0.0) {
      return false;
    }

    return true;
  }
}
