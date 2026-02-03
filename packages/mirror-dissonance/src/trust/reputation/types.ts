/**
 * Reputation System Types
 * 
 * Types for organization reputation tracking, stake management,
 * and contribution weighting for Byzantine fault tolerance.
 */

export interface OrganizationReputation {
  orgId: string;
  reputationScore: number;      // 0.0 - 1.0
  stakePledge: number;          // Economic stake (USD)
  contributionCount: number;
  flaggedCount: number;         // Times flagged as suspicious
  consistencyScore: number;     // How consistent with network
  ageScore: number;             // How long org has existed
  volumeScore: number;          // How much legitimate usage
  lastUpdated: Date;
}

export interface StakePledge {
  orgId: string;
  amountUsd: number;
  pledgedAt: Date;
  status: 'active' | 'slashed' | 'withdrawn';
  slashReason?: string;
}

export interface ContributionWeight {
  orgId: string;
  weight: number;               // 0.0 - 1.0
  factors: {
    baseReputation: number;
    stakeMultiplier: number;
    consistencyBonus: number;
  };
}
