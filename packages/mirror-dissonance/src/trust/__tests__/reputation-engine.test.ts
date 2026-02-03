/**
 * Unit tests for ReputationEngine
 */

import { ReputationEngine, ReputationEngineConfig } from '../reputation/reputation-engine.js';
import { OrganizationReputation, StakePledge } from '../reputation/types.js';
import { IReputationStoreAdapter } from '../adapters/types.js';

// Mock reputation store
class MockReputationStore implements IReputationStoreAdapter {
  private reputations = new Map<string, OrganizationReputation>();
  private pledges = new Map<string, StakePledge>();

  async getReputation(orgId: string): Promise<OrganizationReputation | null> {
    return this.reputations.get(orgId) || null;
  }

  async updateReputation(reputation: OrganizationReputation): Promise<void> {
    this.reputations.set(reputation.orgId, reputation);
  }

  async getStakePledge(orgId: string): Promise<StakePledge | null> {
    return this.pledges.get(orgId) || null;
  }

  async updateStakePledge(pledge: StakePledge): Promise<void> {
    this.pledges.set(pledge.orgId, pledge);
  }

  async listReputationsByScore(minScore: number): Promise<OrganizationReputation[]> {
    return Array.from(this.reputations.values())
      .filter((r) => r.reputationScore >= minScore)
      .sort((a, b) => b.reputationScore - a.reputationScore);
  }

  // Test helpers
  clear() {
    this.reputations.clear();
    this.pledges.clear();
  }

  setReputation(reputation: OrganizationReputation) {
    this.reputations.set(reputation.orgId, reputation);
  }

  setPledge(pledge: StakePledge) {
    this.pledges.set(pledge.orgId, pledge);
  }
}

describe('ReputationEngine', () => {
  let store: MockReputationStore;
  let engine: ReputationEngine;
  let config: ReputationEngineConfig;

  beforeEach(() => {
    store = new MockReputationStore();
    config = {
      minStakeForParticipation: 1000,
      stakeMultiplierCap: 1.0,
      consistencyBonusCap: 0.2,
      byzantineFilterPercentile: 0.2,
      outlierZScoreThreshold: 3.0,
    };
    engine = new ReputationEngine(store, config);
  });

  afterEach(() => {
    store.clear();
  });

  describe('calculateContributionWeight', () => {
    it('should return minimum weight for org with no reputation', async () => {
      const weight = await engine.calculateContributionWeight('new-org');

      expect(weight.orgId).toBe('new-org');
      expect(weight.weight).toBe(0.1);
      expect(weight.factors.baseReputation).toBe(0.1);
      expect(weight.factors.stakeMultiplier).toBe(0.0);
      expect(weight.factors.consistencyBonus).toBe(0.0);
    });

    it('should calculate weight based on reputation score', async () => {
      store.setReputation({
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 0,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const weight = await engine.calculateContributionWeight('org-1');

      expect(weight.orgId).toBe('org-1');
      expect(weight.factors.baseReputation).toBe(0.8);
      expect(weight.weight).toBeGreaterThan(0.8);
    });

    it('should apply stake multiplier correctly', async () => {
      store.setReputation({
        orgId: 'org-2',
        reputationScore: 0.5,
        stakePledge: 1000, // Meets minimum stake
        contributionCount: 5,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const weight = await engine.calculateContributionWeight('org-2');

      expect(weight.factors.stakeMultiplier).toBe(1.0); // At minimum stake
      expect(weight.weight).toBe(1.0); // 0.5 base + 1.0 stake + 0.1 consistency = capped at 1.0
    });

    it('should cap stake multiplier', async () => {
      store.setReputation({
        orgId: 'org-3',
        reputationScore: 0.5,
        stakePledge: 5000, // 5x minimum stake
        contributionCount: 5,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const weight = await engine.calculateContributionWeight('org-3');

      expect(weight.factors.stakeMultiplier).toBe(1.0); // Capped at config.stakeMultiplierCap
    });

    it('should apply consistency bonus', async () => {
      store.setReputation({
        orgId: 'org-4',
        reputationScore: 0.6,
        stakePledge: 0,
        contributionCount: 20,
        flaggedCount: 0,
        consistencyScore: 0.9, // High consistency
        ageScore: 0.8,
        volumeScore: 0.7,
        lastUpdated: new Date(),
      });

      const weight = await engine.calculateContributionWeight('org-4');

      expect(weight.factors.consistencyBonus).toBeCloseTo(0.18); // 0.9 * 0.2 cap
      expect(weight.weight).toBeCloseTo(0.78); // 0.6 + 0.0 + 0.18
    });

    it('should cap final weight at 1.0', async () => {
      store.setReputation({
        orgId: 'org-5',
        reputationScore: 0.9,
        stakePledge: 1000,
        contributionCount: 50,
        flaggedCount: 0,
        consistencyScore: 1.0,
        ageScore: 1.0,
        volumeScore: 1.0,
        lastUpdated: new Date(),
      });

      const weight = await engine.calculateContributionWeight('org-5');

      expect(weight.weight).toBe(1.0); // Capped at 1.0
    });
  });

  describe('updateReputation', () => {
    it('should create new reputation record for new org', async () => {
      await engine.updateReputation('new-org', {
        reputationScore: 0.7,
        contributionCount: 5,
      });

      const reputation = await store.getReputation('new-org');
      expect(reputation).not.toBeNull();
      expect(reputation!.orgId).toBe('new-org');
      expect(reputation!.reputationScore).toBe(0.7);
      expect(reputation!.contributionCount).toBe(5);
      expect(reputation!.stakePledge).toBe(0); // Default
    });

    it('should update existing reputation record', async () => {
      const initial: OrganizationReputation = {
        orgId: 'org-1',
        reputationScore: 0.5,
        stakePledge: 500,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.3,
        volumeScore: 0.2,
        lastUpdated: new Date('2024-01-01'),
      };
      store.setReputation(initial);

      await engine.updateReputation('org-1', {
        contributionCount: 15,
        consistencyScore: 0.8,
      });

      const updated = await store.getReputation('org-1');
      expect(updated!.contributionCount).toBe(15);
      expect(updated!.consistencyScore).toBe(0.8);
      expect(updated!.reputationScore).toBe(0.5); // Unchanged
      expect(updated!.lastUpdated.getTime()).toBeGreaterThan(initial.lastUpdated.getTime());
    });
  });

  describe('slashStake', () => {
    it('should slash active stake and update reputation', async () => {
      store.setReputation({
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 1000,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.7,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      store.setPledge({
        orgId: 'org-1',
        amountUsd: 1000,
        pledgedAt: new Date(),
        status: 'active',
      });

      await engine.slashStake('org-1', 'Submitted false data');

      const pledge = await store.getStakePledge('org-1');
      expect(pledge!.status).toBe('slashed');
      expect(pledge!.slashReason).toBe('Submitted false data');

      const reputation = await store.getReputation('org-1');
      expect(reputation!.reputationScore).toBe(0.0); // Zeroed out
      expect(reputation!.flaggedCount).toBeGreaterThan(0);
    });

    it('should throw error if no active stake found', async () => {
      await expect(engine.slashStake('org-1', 'reason')).rejects.toThrow(
        'No active stake found for org: org-1'
      );
    });

    it('should throw error if stake already slashed', async () => {
      store.setPledge({
        orgId: 'org-1',
        amountUsd: 1000,
        pledgedAt: new Date(),
        status: 'slashed',
      });

      await expect(engine.slashStake('org-1', 'reason')).rejects.toThrow(
        'No active stake found'
      );
    });
  });

  describe('canParticipateInNetwork', () => {
    it('should return false for org with no reputation', async () => {
      const canParticipate = await engine.canParticipateInNetwork('new-org');
      expect(canParticipate).toBe(false);
    });

    it('should return false if stake below minimum', async () => {
      store.setReputation({
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 500, // Below minimum of 1000
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.7,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const canParticipate = await engine.canParticipateInNetwork('org-1');
      expect(canParticipate).toBe(false);
    });

    it('should return false if reputation is zero (slashed)', async () => {
      store.setReputation({
        orgId: 'org-1',
        reputationScore: 0.0, // Slashed
        stakePledge: 1000,
        contributionCount: 10,
        flaggedCount: 5,
        consistencyScore: 0.0,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const canParticipate = await engine.canParticipateInNetwork('org-1');
      expect(canParticipate).toBe(false);
    });

    it('should return true for org meeting all requirements', async () => {
      store.setReputation({
        orgId: 'org-1',
        reputationScore: 0.7,
        stakePledge: 1500, // Above minimum
        contributionCount: 20,
        flaggedCount: 0,
        consistencyScore: 0.8,
        ageScore: 0.6,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      });

      const canParticipate = await engine.canParticipateInNetwork('org-1');
      expect(canParticipate).toBe(true);
    });
  });

  describe('getReputation', () => {
    it('should return null for non-existent org', async () => {
      const reputation = await engine.getReputation('non-existent');
      expect(reputation).toBeNull();
    });

    it('should return existing reputation', async () => {
      const expected: OrganizationReputation = {
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 1000,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.7,
        ageScore: 0.5,
        volumeScore: 0.5,
        lastUpdated: new Date(),
      };
      store.setReputation(expected);

      const reputation = await engine.getReputation('org-1');
      expect(reputation).toEqual(expected);
    });
  });
});
