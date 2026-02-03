/**
 * Weight Calculator
 * 
 * Utility functions for calculating contribution weights
 * based on reputation factors.
 */

import { OrganizationReputation, ContributionWeight } from './types.js';

/**
 * Calculate normalized weight from reputation factors
 */
export function calculateWeight(
  reputation: OrganizationReputation,
  config: {
    stakeMultiplierCap: number;
    consistencyBonusCap: number;
    minStakeForParticipation: number;
  }
): number {
  const baseReputation = reputation.reputationScore;
  
  const stakeRatio = Math.min(
    reputation.stakePledge / config.minStakeForParticipation,
    1.0
  );
  const stakeMultiplier = stakeRatio * config.stakeMultiplierCap;
  
  const consistencyBonus = reputation.consistencyScore * config.consistencyBonusCap;
  
  return Math.min(baseReputation + stakeMultiplier + consistencyBonus, 1.0);
}

/**
 * Filter out Byzantine actors below percentile threshold
 */
export function filterByzantineActors(
  weights: ContributionWeight[],
  percentileThreshold: number
): ContributionWeight[] {
  if (weights.length === 0) {
    return [];
  }

  const sorted = [...weights].sort((a, b) => a.weight - b.weight);
  const cutoffIndex = Math.floor(weights.length * percentileThreshold);
  
  return sorted.slice(cutoffIndex);
}
