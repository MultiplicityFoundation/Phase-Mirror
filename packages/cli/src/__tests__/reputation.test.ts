/**
 * Tests for the reputation command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mock data ────────────────────────────────────────────────────────
const mockReputation = {
  orgId: 'test-org',
  reputationScore: 0.85,
  consistencyScore: 0.9,
  stakePledge: 5000,
  stakeStatus: 'active',
  contributionCount: 12,
  flaggedCount: 1,
  ageScore: 0.7,
  volumeScore: 0.8,
  lastUpdated: new Date('2026-01-01'),
};

const mockStakePledge = {
  orgId: 'test-org',
  amountUsd: 5000,
  pledgedAt: new Date('2026-01-01'),
  status: 'active' as const,
};

const mockConsistencyResult = {
  score: 0.85,
  hasMinimumData: true,
  metrics: {
    rulesContributed: 5,
    contributionsConsidered: 10,
    averageDeviation: 0.05,
    deviationStdDev: 0.02,
    outlierCount: 0,
    lastContributionDate: new Date('2026-06-01'),
    oldestContributionAge: 30,
  },
};

// ── Mock fns ─────────────────────────────────────────────────────────
const mockGetReputation = jest.fn<() => Promise<any>>().mockResolvedValue(mockReputation);
const mockCalculateContributionWeight = jest.fn<() => Promise<any>>().mockResolvedValue({
  weight: 0.9, factors: { baseReputation: 0.85, stakeMultiplier: 1.0, consistencyBonus: 0.05 },
});
const mockCanParticipate = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockUpdateReputation = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockSlashStake = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

const mockListReputationsByScore = jest.fn<() => Promise<any[]>>().mockResolvedValue([mockReputation]);
const mockUpdateStakePledge = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetStakePledge = jest.fn<() => Promise<any>>().mockResolvedValue(mockStakePledge);

const mockCalculateScore = jest.fn<() => Promise<any>>().mockResolvedValue(mockConsistencyResult);

// Must include L0InvariantViolation & OracleDegradedError because
// ../lib/errors.ts (imported transitively) re-exports them from core
class MockL0InvariantViolation extends Error {
  constructor(public invariantId: string, public evidence: Record<string, unknown>) {
    super(`L0 invariant violated: ${invariantId}`); this.name = 'L0InvariantViolation';
  }
}
class MockOracleDegradedError extends Error {
  constructor(public reason: string, public canProceed: boolean) {
    super(`Oracle degraded: ${reason}`); this.name = 'OracleDegradedError';
  }
}

jest.unstable_mockModule('@mirror-dissonance/core', () => ({
  ReputationEngine: jest.fn().mockImplementation(() => ({
    getReputation: mockGetReputation,
    calculateContributionWeight: mockCalculateContributionWeight,
    canParticipateInNetwork: mockCanParticipate,
    updateReputation: mockUpdateReputation,
    slashStake: mockSlashStake,
  })),
  ConsistencyScoreCalculator: jest.fn().mockImplementation(() => ({
    calculateScore: mockCalculateScore,
  })),
  createLocalTrustAdapters: jest.fn().mockReturnValue({
    reputationStore: {
      listReputationsByScore: mockListReputationsByScore,
      updateStakePledge: mockUpdateStakePledge,
      getStakePledge: mockGetStakePledge,
    },
  }),
  L0InvariantViolation: MockL0InvariantViolation,
  OracleDegradedError: MockOracleDegradedError,
}));

// Mock ora
jest.unstable_mockModule('ora', () => ({
  default: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    fail: jest.fn(),
    text: '',
  }),
}));

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { reputationCommand } = await import('../commands/reputation.js');

describe('reputation command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply default mocks after clearAllMocks
    mockGetReputation.mockResolvedValue(mockReputation);
    mockListReputationsByScore.mockResolvedValue([mockReputation]);
    mockGetStakePledge.mockResolvedValue(mockStakePledge);
    mockCalculateScore.mockResolvedValue(mockConsistencyResult);
    process.env.PHASE_MIRROR_DATA_DIR = '.test-data-rep';
  });

  describe('show', () => {
    it('displays reputation for an org', async () => {
      await reputationCommand.show({ orgId: 'test-org' });

      expect(mockGetReputation).toHaveBeenCalledWith('test-org');
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('lists all reputations', async () => {
      await reputationCommand.list({});

      expect(mockListReputationsByScore).toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('calculateConsistency', () => {
    it('prints warning when no mockData flag', async () => {
      await reputationCommand.calculateConsistency({ orgId: 'test-org' });

      // Without mockData, it returns early without calling calculateScore
      expect(mockCalculateScore).not.toHaveBeenCalled();
    });

    it('calculates consistency score with mock data', async () => {
      await reputationCommand.calculateConsistency({ orgId: 'test-org', mockData: true });

      expect(mockCalculateScore).toHaveBeenCalled();
    });
  });

  describe('showStake', () => {
    it('shows stake info for an org', async () => {
      await reputationCommand.showStake({ orgId: 'test-org' });

      expect(mockGetStakePledge).toHaveBeenCalledWith('test-org');
      expect(logSpy).toHaveBeenCalled();
    });

    it('handles missing stake pledge', async () => {
      mockGetStakePledge.mockResolvedValue(null);

      await reputationCommand.showStake({ orgId: 'unknown-org' });

      expect(logSpy).toHaveBeenCalled();
    });
  });
});
