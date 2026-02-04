/**
 * Consistency Score Calculator
 * 
 * Calculates how consistent an organization's FP rate is with
 * the network consensus. Used to update reputation scores in
 * the feedback loop.
 */

import { RawContribution } from './types.js';

export class ConsistencyScoreCalculator {
  /**
   * Calculate consistency score for an organization.
   * 
   * Score is based on how close the organization's FP rate is
   * to the consensus rate.
   * 
   * @param orgFpRate - Organization's FP rate
   * @param consensusFpRate - Network consensus FP rate
   * @param maxDeviation - Maximum acceptable deviation (default: 0.1 = 10%)
   * @returns Consistency score (0.0 - 1.0)
   */
  calculateConsistencyScore(
    orgFpRate: number,
    consensusFpRate: number,
    maxDeviation: number = 0.1
  ): number {
    const deviation = Math.abs(orgFpRate - consensusFpRate);
    
    // If deviation is 0, perfect consistency
    if (deviation === 0) {
      return 1.0;
    }
    
    // Linear decay from 1.0 to 0.0 as deviation increases
    const score = Math.max(0, 1.0 - (deviation / maxDeviation));
    
    return score;
  }
  
  /**
   * Calculate consistency scores for multiple organizations.
   * 
   * @param contributions - Organization contributions
   * @param consensusFpRate - Network consensus FP rate
   * @returns Map of orgIdHash to consistency score
   */
  calculateConsistencyScores(
    contributions: RawContribution[],
    consensusFpRate: number
  ): Map<string, number> {
    const scores = new Map<string, number>();
    
    for (const contrib of contributions) {
      const score = this.calculateConsistencyScore(
        contrib.fpRate,
        consensusFpRate
      );
      scores.set(contrib.orgIdHash, score);
    }
    
    return scores;
  }
  
  /**
   * Calculate consistency delta for reputation update.
   * 
   * Positive delta if contribution is close to consensus,
   * negative delta if far from consensus.
   * 
   * @param orgFpRate - Organization's FP rate
   * @param consensusFpRate - Network consensus FP rate
   * @returns Delta to apply to consistency score (-0.1 to +0.05)
   */
  calculateConsistencyDelta(
    orgFpRate: number,
    consensusFpRate: number
  ): number {
    const deviation = Math.abs(orgFpRate - consensusFpRate);
    
    // Very close to consensus: +0.05
    if (deviation < 0.02) {
      return 0.05;
    }
    
    // Close to consensus: +0.02
    if (deviation < 0.05) {
      return 0.02;
    }
    
    // Moderate deviation: +0.01
    if (deviation < 0.1) {
      return 0.01;
    }
    
    // Large deviation: -0.05
    if (deviation > 0.3) {
      return -0.1;
    }
    
    // Moderate-large deviation: -0.02
    if (deviation > 0.2) {
      return -0.05;
    }
    
    // Moderate-high deviation: 0
    return 0;
  }
}
