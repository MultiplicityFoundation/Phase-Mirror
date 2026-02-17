/**
 * CLI commands for reputation and consistency management
 * 
 * Provides command-line interface for managing organization reputation,
 * consistency scores, and stake pledges.
 */

import chalk from 'chalk';
import { table } from 'table';
import { 
  ReputationEngine, 
  ConsistencyScoreCalculator,
  ContributionRecord,
  OrganizationReputation
} from '@mirror-dissonance/core';
import { createLocalTrustAdapters } from '@mirror-dissonance/core';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';

/**
 * Get the data directory for trust adapters
 * Uses environment variable or default to .phase-mirror-data
 */
function getDataDir(): string {
  return process.env.PHASE_MIRROR_DATA_DIR || '.phase-mirror-data';
}

/**
 * Initialize reputation engine with default config
 */
function initializeEngine() {
  const dataDir = getDataDir();
  const adapters = createLocalTrustAdapters(dataDir);
  
  const config = {
    minStakeForParticipation: 1000,
    stakeMultiplierCap: 1.0,
    consistencyBonusCap: 0.2,
    byzantineFilterPercentile: 0.2,
    outlierZScoreThreshold: 3.0,
  };
  
  return new ReputationEngine(adapters.reputationStore, config);
}

/**
 * Initialize consistency score calculator with default config
 */
function initializeCalculator() {
  return new ConsistencyScoreCalculator({
    decayRate: 0.01,
    maxContributionAge: 180,
    minContributionsRequired: 3,
    outlierThreshold: 0.3,
    minEventCount: 1,
    excludeOutliersFromScore: false,
    maxConsistencyBonus: 0.2,
  });
}

/**
 * Show reputation details for an organization
 */
async function show(options: {
  orgId: string;
  verbose?: boolean;
}): Promise<void> {
  try {
    const engine = initializeEngine();
    
    logger.info(chalk.cyan('\n📊 Reputation Details\n'));
    
    const reputation = await engine.getReputation(options.orgId);
    
    if (!reputation) {
      logger.info(chalk.yellow(`No reputation data found for organization: ${options.orgId}\n`));
      logger.info(chalk.dim('💡 Create reputation data with "reputation update" command.\n'));
      return;
    }
    
    // Display reputation details
    console.log(`  Organization ID: ${chalk.bold(reputation.orgId)}`);
    console.log(`  Reputation Score: ${chalk.bold(reputation.reputationScore.toFixed(3))} ${getScoreEmoji(reputation.reputationScore)}`);
    console.log(`  Consistency Score: ${reputation.consistencyScore.toFixed(3)}`);
    console.log(`  Stake Pledge: $${reputation.stakePledge.toLocaleString()}`);
    console.log(`  Stake Status: ${getStakeStatusBadge(reputation.stakeStatus)}`);
    console.log(`  Contribution Count: ${reputation.contributionCount}`);
    console.log(`  Flagged Count: ${reputation.flaggedCount}`);
    console.log(`  Age Score: ${reputation.ageScore.toFixed(3)}`);
    console.log(`  Volume Score: ${reputation.volumeScore.toFixed(3)}`);
    console.log(`  Last Updated: ${reputation.lastUpdated.toISOString()}`);
    
    if (options.verbose) {
      // Calculate contribution weight
      const weight = await engine.calculateContributionWeight(options.orgId);
      
      logger.info(chalk.cyan('\n🔢 Contribution Weight Breakdown:'));
      console.log(`  Final Weight: ${chalk.bold(weight.weight.toFixed(3))}`);
      console.log(`  Base Reputation: ${weight.factors.baseReputation.toFixed(3)}`);
      console.log(`  Stake Multiplier: ${weight.factors.stakeMultiplier.toFixed(3)}`);
      console.log(`  Consistency Bonus: ${weight.factors.consistencyBonus.toFixed(3)}`);
      
      // Check network participation eligibility
      const canParticipate = await engine.canParticipateInNetwork(options.orgId);
      console.log(`  Can Participate: ${canParticipate ? chalk.green('Yes ✓') : chalk.red('No ✗')}`);
    }
    
    console.log('');
  } catch (error) {
    throw new CLIError(
      `Failed to show reputation: ${error instanceof Error ? error.message : String(error)}`,
      'REPUTATION_SHOW_ERROR'
    );
  }
}

/**
 * List organizations by reputation score
 */
async function list(options: {
  minScore?: number;
  sortBy?: 'reputation' | 'consistency' | 'stake';
  limit?: number;
}): Promise<void> {
  try {
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    
    logger.info(chalk.cyan('\n📋 Organization Reputations\n'));
    
    const minScore = options.minScore ?? 0.0;
    let reputations = await adapters.reputationStore.listReputationsByScore(minScore);
    
    if (reputations.length === 0) {
      logger.info(chalk.yellow('No reputation data found.\n'));
      return;
    }
    
    // Sort by requested field
    if (options.sortBy === 'consistency') {
      reputations.sort((a: OrganizationReputation, b: OrganizationReputation) => b.consistencyScore - a.consistencyScore);
    } else if (options.sortBy === 'stake') {
      reputations.sort((a: OrganizationReputation, b: OrganizationReputation) => b.stakePledge - a.stakePledge);
    }
    // Default sort is already by reputation score
    
    // Apply limit
    if (options.limit) {
      reputations = reputations.slice(0, options.limit);
    }
    
    // Prepare table data
    const tableData = [
      [
        chalk.bold('Org ID'),
        chalk.bold('Rep Score'),
        chalk.bold('Consistency'),
        chalk.bold('Stake'),
        chalk.bold('Contribs'),
        chalk.bold('Status')
      ]
    ];
    
    for (const rep of reputations) {
      const status = getStakeStatusBadge(rep.stakeStatus);
      
      tableData.push([
        rep.orgId,
        rep.reputationScore.toFixed(3),
        rep.consistencyScore.toFixed(3),
        `$${rep.stakePledge.toLocaleString()}`,
        rep.contributionCount.toString(),
        status
      ]);
    }
    
    console.log(table(tableData));
    logger.info(chalk.dim(`\nTotal: ${reputations.length} organization(s)\n`));
    
  } catch (error) {
    throw new CLIError(
      `Failed to list reputations: ${error instanceof Error ? error.message : String(error)}`,
      'REPUTATION_LIST_ERROR'
    );
  }
}

/**
 * Calculate consistency score for an organization
 */
async function calculateConsistency(options: {
  orgId: string;
  mockData?: boolean;
}): Promise<void> {
  try {
    const calculator = initializeCalculator();
    
    logger.info(chalk.cyan('\n🎯 Calculating Consistency Score\n'));
    
    // In a real implementation, you would fetch contributions from a contribution store
    // For demo purposes, we'll use mock data
    const contributions = options.mockData ? getMockContributions(options.orgId) : [];
    
    if (!options.mockData) {
      logger.info(chalk.yellow('⚠️  No contribution data available. Use --mock-data flag for demo.\n'));
      return;
    }
    
    const result = await calculator.calculateScore(options.orgId, contributions);
    
    if (!result.hasMinimumData) {
      logger.info(chalk.yellow(`⚠️  Insufficient data: ${result.unreliableReason}\n`));
      logger.info(chalk.dim(`Score (neutral): ${result.score.toFixed(3)}\n`));
      return;
    }
    
    // Display results
    logger.success(chalk.green(`✓ Consistency Score: ${chalk.bold(result.score.toFixed(3))} (${(result.score * 100).toFixed(1)}%)\n`));
    
    logger.info(chalk.cyan('📈 Metrics:'));
    console.log(`  Rules Contributed: ${result.metrics.rulesContributed}`);
    console.log(`  Contributions Considered: ${result.metrics.contributionsConsidered}`);
    console.log(`  Average Deviation: ${(result.metrics.averageDeviation * 100).toFixed(2)}%`);
    console.log(`  Deviation Std Dev: ${(result.metrics.deviationStdDev * 100).toFixed(2)}%`);
    console.log(`  Outliers Detected: ${result.metrics.outlierCount}`);
    console.log(`  Last Contribution: ${result.metrics.lastContributionDate.toLocaleDateString()}`);
    console.log(`  Oldest Contribution Age: ${Math.round(result.metrics.oldestContributionAge)} days`);
    
    console.log('');
    
  } catch (error) {
    throw new CLIError(
      `Failed to calculate consistency: ${error instanceof Error ? error.message : String(error)}`,
      'CONSISTENCY_CALC_ERROR'
    );
  }
}

/**
 * Update reputation for an organization
 */
async function update(options: {
  orgId: string;
  reputationScore?: number;
  consistencyScore?: number;
  contributionCount?: number;
  flaggedCount?: number;
  ageScore?: number;
  volumeScore?: number;
}): Promise<void> {
  try {
    const engine = initializeEngine();
    
    logger.info(chalk.cyan('\n✏️  Updating Reputation\n'));
    
    const updates: Partial<OrganizationReputation> = {};
    
    if (options.reputationScore !== undefined) {
      updates.reputationScore = options.reputationScore;
    }
    if (options.consistencyScore !== undefined) {
      updates.consistencyScore = options.consistencyScore;
    }
    if (options.contributionCount !== undefined) {
      updates.contributionCount = options.contributionCount;
    }
    if (options.flaggedCount !== undefined) {
      updates.flaggedCount = options.flaggedCount;
    }
    if (options.ageScore !== undefined) {
      updates.ageScore = options.ageScore;
    }
    if (options.volumeScore !== undefined) {
      updates.volumeScore = options.volumeScore;
    }
    
    await engine.updateReputation(options.orgId, updates);
    
    logger.success(chalk.green('✓ Reputation updated successfully\n'));
    
    // Show updated reputation
    await show({ orgId: options.orgId });
    
  } catch (error) {
    throw new CLIError(
      `Failed to update reputation: ${error instanceof Error ? error.message : String(error)}`,
      'REPUTATION_UPDATE_ERROR'
    );
  }
}

/**
 * Manage stake pledge
 */
async function pledgeStake(options: {
  orgId: string;
  amount: number;
}): Promise<void> {
  try {
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    const engine = initializeEngine();
    
    logger.info(chalk.cyan('\n💰 Creating Stake Pledge\n'));
    
    const pledge = {
      orgId: options.orgId,
      amountUsd: options.amount,
      pledgedAt: new Date(),
      status: 'active' as const,
    };
    
    await adapters.reputationStore.updateStakePledge(pledge);
    
    // Update reputation with new stake amount
    await engine.updateReputation(options.orgId, {
      stakePledge: options.amount,
      stakeStatus: 'active',
    });
    
    logger.success(chalk.green(`✓ Stake pledge of $${options.amount.toLocaleString()} created successfully\n`));
    
    console.log(`  Organization: ${options.orgId}`);
    console.log(`  Amount: $${options.amount.toLocaleString()}`);
    console.log(`  Status: ${getStakeStatusBadge('active')}`);
    console.log(`  Pledged At: ${pledge.pledgedAt.toISOString()}`);
    console.log('');
    
  } catch (error) {
    throw new CLIError(
      `Failed to pledge stake: ${error instanceof Error ? error.message : String(error)}`,
      'STAKE_PLEDGE_ERROR'
    );
  }
}

/**
 * Slash organization stake
 */
async function slashStake(options: {
  orgId: string;
  reason: string;
}): Promise<void> {
  try {
    const engine = initializeEngine();
    
    logger.info(chalk.cyan('\n⚠️  Slashing Stake\n'));
    
    await engine.slashStake(options.orgId, options.reason);
    
    logger.success(chalk.red('✓ Stake slashed successfully\n'));
    
    console.log(`  Organization: ${options.orgId}`);
    console.log(`  Reason: ${options.reason}`);
    logger.info(chalk.dim('⚠️  This organization can no longer participate in the network.\n'));
    
  } catch (error) {
    throw new CLIError(
      `Failed to slash stake: ${error instanceof Error ? error.message : String(error)}`,
      'STAKE_SLASH_ERROR'
    );
  }
}

/**
 * Show stake pledge details
 */
async function showStake(options: {
  orgId: string;
}): Promise<void> {
  try {
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    
    logger.info(chalk.cyan('\n💰 Stake Pledge Details\n'));
    
    const pledge = await adapters.reputationStore.getStakePledge(options.orgId);
    
    if (!pledge) {
      logger.info(chalk.yellow(`No stake pledge found for organization: ${options.orgId}\n`));
      return;
    }
    
    console.log(`  Organization: ${pledge.orgId}`);
    console.log(`  Amount: $${pledge.amountUsd.toLocaleString()}`);
    console.log(`  Status: ${getStakeStatusBadge(pledge.status)}`);
    console.log(`  Pledged At: ${pledge.pledgedAt.toISOString()}`);
    
    if (pledge.status === 'slashed' && pledge.slashReason) {
      logger.info(chalk.red(`\n⚠️  SLASHED`));
      console.log(`  Reason: ${pledge.slashReason}`);
    }
    
    console.log('');
    
  } catch (error) {
    throw new CLIError(
      `Failed to show stake: ${error instanceof Error ? error.message : String(error)}`,
      'STAKE_SHOW_ERROR'
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get emoji for reputation score
 */
function getScoreEmoji(score: number): string {
  if (score >= 0.9) return '🌟';
  if (score >= 0.7) return '✨';
  if (score >= 0.5) return '⭐';
  if (score >= 0.3) return '💫';
  return '⚠️';
}

/**
 * Get colored badge for stake status
 */
function getStakeStatusBadge(status: 'active' | 'slashed' | 'withdrawn'): string {
  switch (status) {
    case 'active':
      return chalk.green('Active');
    case 'slashed':
      return chalk.red('Slashed');
    case 'withdrawn':
      return chalk.yellow('Withdrawn');
  }
}

/**
 * Generate mock contribution data for demo purposes
 */
function getMockContributions(orgId: string): ContributionRecord[] {
  const now = Date.now();
  
  return [
    {
      orgId,
      ruleId: 'semgrep-rule-1',
      contributedFpRate: 0.15,
      consensusFpRate: 0.12,
      timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      eventCount: 100,
      deviation: 0.03,
      consistencyScore: 0.97,
    },
    {
      orgId,
      ruleId: 'semgrep-rule-2',
      contributedFpRate: 0.45,
      consensusFpRate: 0.48,
      timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      eventCount: 150,
      deviation: 0.03,
      consistencyScore: 0.97,
    },
    {
      orgId,
      ruleId: 'semgrep-rule-3',
      contributedFpRate: 0.22,
      consensusFpRate: 0.20,
      timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      eventCount: 200,
      deviation: 0.02,
      consistencyScore: 0.98,
    },
    {
      orgId,
      ruleId: 'semgrep-rule-4',
      contributedFpRate: 0.35,
      consensusFpRate: 0.33,
      timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      eventCount: 80,
      deviation: 0.02,
      consistencyScore: 0.98,
    },
  ];
}

export const reputationCommand = {
  show,
  list,
  calculateConsistency,
  update,
  pledgeStake,
  slashStake,
  showStake,
};
