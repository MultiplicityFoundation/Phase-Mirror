/**
 * CLI commands for calibration management
 * 
 * Provides command-line interface for managing FP calibration with Byzantine filtering
 */

import chalk from 'chalk';
import { table } from 'table';
import ora from 'ora';
import { 
  CalibrationStore,
  InMemoryCalibrationStoreAdapter,
  CalibrationResultExtended
} from '@mirror-dissonance/core';
import { createFPStore } from '@mirror-dissonance/core';
import { ReputationEngine } from '@mirror-dissonance/core';
import { createLocalTrustAdapters } from '@mirror-dissonance/core';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';

/**
 * Get the data directory for adapters
 * Uses environment variable or default to .phase-mirror-data
 */
function getDataDir(): string {
  return process.env.PHASE_MIRROR_DATA_DIR || '.phase-mirror-data';
}

/**
 * Initialize calibration store with local adapters
 */
function initializeCalibrationStore(): CalibrationStore {
  const dataDir = getDataDir();
  
  // Create adapters
  const calibrationAdapter = new InMemoryCalibrationStoreAdapter();
  const fpStore = createFPStore(); // NoOp store for now
  const trustAdapters = createLocalTrustAdapters(dataDir);
  
  // Create reputation engine
  const reputationEngine = new ReputationEngine(
    trustAdapters.reputationStore,
    {
      minStakeForParticipation: 1000,
      stakeMultiplierCap: 1.0,
      consistencyBonusCap: 0.2,
      byzantineFilterPercentile: 0.2,
      outlierZScoreThreshold: 3.0,
    }
  );
  
  // Create calibration store
  return new CalibrationStore(
    calibrationAdapter,
    fpStore,
    reputationEngine,
    {
      zScoreThreshold: 3.0,
      byzantineFilterPercentile: 0.2,
      minContributorsForFiltering: 5,
      requireStake: false,
      requireMinimumReputation: true,
      minimumReputationScore: 0.1,
    }
  );
}

/**
 * Format confidence category with color
 */
function formatConfidence(category: string): string {
  switch (category) {
    case 'high':
      return chalk.green('●') + ' High';
    case 'medium':
      return chalk.yellow('●') + ' Medium';
    case 'low':
      return chalk.red('●') + ' Low';
    case 'insufficient':
      return chalk.gray('●') + ' Insufficient';
    default:
      return chalk.gray('●') + ' Unknown';
  }
}

/**
 * Aggregate FPs for a specific rule
 */
async function aggregate(options: {
  ruleId: string;
  verbose?: boolean;
}): Promise<void> {
  const spinner = ora(`Aggregating FPs for rule: ${options.ruleId}...`).start();

  try {
    const store = initializeCalibrationStore();
    
    const result = await store.aggregateFPsByRule(options.ruleId);
    
    spinner.succeed(chalk.green('✓ Calibration complete\n'));
    
    // Display result
    logger.info(chalk.cyan.bold('Calibration Result'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Rule ID:              ${chalk.white(result.ruleId)}`);
    logger.info(`Consensus FP Rate:    ${chalk.white((result.consensusFpRate * 100).toFixed(2) + '%')}`);
    logger.info(`Confidence:           ${formatConfidence(result.confidence.category)} (${(result.confidence.level * 100).toFixed(1)}%)`);
    logger.info('');
    
    logger.info(chalk.cyan.bold('Contributors'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Trusted Contributors: ${chalk.green(result.trustedContributorCount)}`);
    logger.info(`Total Contributors:   ${chalk.white(result.totalContributorCount)}`);
    logger.info(`Total Events:         ${chalk.white(result.totalEventCount)}`);
    logger.info(`Calculated At:        ${chalk.dim(result.calculatedAt.toISOString())}`);
    logger.info('');
    
    if (result.byzantineFilterSummary.filteringApplied) {
      logger.info(chalk.cyan.bold('Byzantine Filtering'));
      logger.info(chalk.dim('─'.repeat(60)));
      logger.info(`Filter Rate:          ${chalk.white((result.byzantineFilterSummary.filterRate * 100).toFixed(1) + '%')}`);
      logger.info(`Outliers Filtered:    ${chalk.yellow(result.byzantineFilterSummary.outliersFiltered)}`);
      logger.info(`Low Reputation:       ${chalk.yellow(result.byzantineFilterSummary.lowReputationFiltered)}`);
      logger.info(`Z-Score Threshold:    ${chalk.dim(result.byzantineFilterSummary.zScoreThreshold)}`);
      logger.info(`Reputation Percentile: ${chalk.dim((result.byzantineFilterSummary.reputationPercentile * 100) + '%')}`);
      logger.info('');
    }
    
    if (options.verbose) {
      logger.info(chalk.cyan.bold('Confidence Factors'));
      logger.info(chalk.dim('─'.repeat(60)));
      logger.info(`Contributor Count:    ${chalk.white((result.confidence.factors.contributorCountFactor * 100).toFixed(1) + '%')}`);
      logger.info(`Agreement:            ${chalk.white((result.confidence.factors.agreementFactor * 100).toFixed(1) + '%')}`);
      logger.info(`Event Count:          ${chalk.white((result.confidence.factors.eventCountFactor * 100).toFixed(1) + '%')}`);
      logger.info(`Reputation:           ${chalk.white((result.confidence.factors.reputationFactor * 100).toFixed(1) + '%')}`);
      
      if (result.confidence.lowConfidenceReason) {
        logger.info('');
        logger.warn(chalk.yellow('⚠ Low Confidence: ') + result.confidence.lowConfidenceReason);
      }
    }
    
  } catch (error) {
    spinner.fail('Calibration failed');
    throw new CLIError(
      `Calibration error: ${error instanceof Error ? error.message : String(error)}`,
      'CALIBRATION_FAILED'
    );
  }
}

/**
 * List all calibration results
 */
async function list(options: {
  format?: string;
}): Promise<void> {
  const spinner = ora('Loading calibration results...').start();

  try {
    const store = initializeCalibrationStore();
    const results = await store.aggregateAllRules();
    
    spinner.succeed(`Found ${results.length} calibration results\n`);
    
    if (results.length === 0) {
      logger.info(chalk.dim('No calibration results found.'));
      logger.info(chalk.dim('Run `oracle calibration aggregate --rule-id <id>` to create one.'));
      return;
    }
    
    if (options.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    
    // Table format
    const tableData = [
      [
        chalk.bold('Rule ID'),
        chalk.bold('Consensus FP Rate'),
        chalk.bold('Confidence'),
        chalk.bold('Contributors'),
        chalk.bold('Events')
      ],
      ...results.map(r => [
        r.ruleId,
        (r.consensusFpRate * 100).toFixed(2) + '%',
        formatConfidence(r.confidence.category),
        `${r.trustedContributorCount}/${r.totalContributorCount}`,
        r.totalEventCount.toString()
      ])
    ];
    
    console.log(table(tableData, {
      border: {
        topBody: '─',
        topJoin: '┬',
        topLeft: '┌',
        topRight: '┐',
        bottomBody: '─',
        bottomJoin: '┴',
        bottomLeft: '└',
        bottomRight: '┘',
        bodyLeft: '│',
        bodyRight: '│',
        bodyJoin: '│',
        joinBody: '─',
        joinLeft: '├',
        joinRight: '┤',
        joinJoin: '┼'
      }
    }));
    
  } catch (error) {
    spinner.fail('Failed to list calibration results');
    throw new CLIError(
      `List error: ${error instanceof Error ? error.message : String(error)}`,
      'CALIBRATION_LIST_FAILED'
    );
  }
}

/**
 * Show detailed calibration result for a rule
 */
async function show(options: {
  ruleId: string;
  format?: string;
}): Promise<void> {
  const spinner = ora(`Loading calibration for rule: ${options.ruleId}...`).start();

  try {
    const store = initializeCalibrationStore();
    const result = await store.getCalibrationResult(options.ruleId);
    
    if (!result) {
      spinner.fail(`No calibration found for rule: ${options.ruleId}`);
      logger.info(chalk.dim(`Run \`oracle calibration aggregate --rule-id ${options.ruleId}\` to create one.`));
      return;
    }
    
    spinner.succeed(`Calibration found\n`);
    
    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // Detailed display
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    logger.info(chalk.cyan.bold('  Calibration Result Details'));
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    logger.info('');
    
    logger.info(chalk.bold('Basic Information'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Rule ID:              ${chalk.white(result.ruleId)}`);
    logger.info(`Consensus FP Rate:    ${chalk.white((result.consensusFpRate * 100).toFixed(2) + '%')}`);
    logger.info(`Calculated At:        ${chalk.dim(result.calculatedAt.toISOString())}`);
    logger.info('');
    
    logger.info(chalk.bold('Contributors'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Trusted:              ${chalk.green(result.trustedContributorCount)}`);
    logger.info(`Total:                ${chalk.white(result.totalContributorCount)}`);
    logger.info(`Total Events:         ${chalk.white(result.totalEventCount)}`);
    logger.info('');
    
    logger.info(chalk.bold('Confidence Metrics'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Overall:              ${formatConfidence(result.confidence.category)} (${(result.confidence.level * 100).toFixed(1)}%)`);
    logger.info('');
    logger.info(chalk.dim('  Factors:'));
    logger.info(`  Contributor Count:  ${chalk.white((result.confidence.factors.contributorCountFactor * 100).toFixed(1) + '%')}`);
    logger.info(`  Agreement:          ${chalk.white((result.confidence.factors.agreementFactor * 100).toFixed(1) + '%')}`);
    logger.info(`  Event Count:        ${chalk.white((result.confidence.factors.eventCountFactor * 100).toFixed(1) + '%')}`);
    logger.info(`  Reputation:         ${chalk.white((result.confidence.factors.reputationFactor * 100).toFixed(1) + '%')}`);
    
    if (result.confidence.lowConfidenceReason) {
      logger.info('');
      logger.warn(chalk.yellow('  ⚠ Reason: ') + result.confidence.lowConfidenceReason);
    }
    logger.info('');
    
    if (result.byzantineFilterSummary.filteringApplied) {
      logger.info(chalk.bold('Byzantine Filtering'));
      logger.info(chalk.dim('─'.repeat(60)));
      logger.info(`Applied:              ${chalk.green('Yes')}`);
      logger.info(`Filter Rate:          ${chalk.white((result.byzantineFilterSummary.filterRate * 100).toFixed(1) + '%')}`);
      logger.info(`Outliers Filtered:    ${chalk.yellow(result.byzantineFilterSummary.outliersFiltered)}`);
      logger.info(`Low Reputation:       ${chalk.yellow(result.byzantineFilterSummary.lowReputationFiltered)}`);
      logger.info('');
      logger.info(chalk.dim('  Configuration:'));
      logger.info(`  Z-Score Threshold:  ${chalk.dim(result.byzantineFilterSummary.zScoreThreshold)}`);
      logger.info(`  Reputation %ile:    ${chalk.dim((result.byzantineFilterSummary.reputationPercentile * 100) + '%')}`);
    } else {
      logger.info(chalk.bold('Byzantine Filtering'));
      logger.info(chalk.dim('─'.repeat(60)));
      logger.info(`Applied:              ${chalk.gray('No')} (insufficient contributors)`);
    }
    
    logger.info('');
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    
  } catch (error) {
    spinner.fail('Failed to show calibration result');
    throw new CLIError(
      `Show error: ${error instanceof Error ? error.message : String(error)}`,
      'CALIBRATION_SHOW_FAILED'
    );
  }
}

/**
 * Show calibration statistics
 */
async function stats(): Promise<void> {
  const spinner = ora('Calculating calibration statistics...').start();

  try {
    const store = initializeCalibrationStore();
    const results = await store.aggregateAllRules();
    
    spinner.succeed('Statistics calculated\n');
    
    if (results.length === 0) {
      logger.info(chalk.dim('No calibration results available.'));
      return;
    }
    
    // Calculate aggregate stats
    const totalResults = results.length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence.level, 0) / totalResults;
    const highConfidence = results.filter(r => r.confidence.category === 'high').length;
    const mediumConfidence = results.filter(r => r.confidence.category === 'medium').length;
    const lowConfidence = results.filter(r => r.confidence.category === 'low').length;
    const insufficient = results.filter(r => r.confidence.category === 'insufficient').length;
    
    const totalContributors = results.reduce((sum, r) => sum + r.totalContributorCount, 0);
    const avgContributors = totalContributors / totalResults;
    
    const totalEvents = results.reduce((sum, r) => sum + r.totalEventCount, 0);
    const avgEvents = totalEvents / totalResults;
    
    const avgFpRate = results.reduce((sum, r) => sum + r.consensusFpRate, 0) / totalResults;
    
    const withFiltering = results.filter(r => r.byzantineFilterSummary.filteringApplied).length;
    const avgFilterRate = withFiltering > 0
      ? results
          .filter(r => r.byzantineFilterSummary.filteringApplied)
          .reduce((sum, r) => sum + r.byzantineFilterSummary.filterRate, 0) / withFiltering
      : 0;
    
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    logger.info(chalk.cyan.bold('  Network Calibration Statistics'));
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    logger.info('');
    
    logger.info(chalk.bold('Overview'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Total Rules Calibrated:    ${chalk.white(totalResults)}`);
    logger.info(`Average Confidence:        ${chalk.white((avgConfidence * 100).toFixed(1) + '%')}`);
    logger.info(`Average FP Rate:           ${chalk.white((avgFpRate * 100).toFixed(2) + '%')}`);
    logger.info('');
    
    logger.info(chalk.bold('Confidence Distribution'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`High:                      ${chalk.green(highConfidence)} (${((highConfidence / totalResults) * 100).toFixed(1)}%)`);
    logger.info(`Medium:                    ${chalk.yellow(mediumConfidence)} (${((mediumConfidence / totalResults) * 100).toFixed(1)}%)`);
    logger.info(`Low:                       ${chalk.red(lowConfidence)} (${((lowConfidence / totalResults) * 100).toFixed(1)}%)`);
    logger.info(`Insufficient:              ${chalk.gray(insufficient)} (${((insufficient / totalResults) * 100).toFixed(1)}%)`);
    logger.info('');
    
    logger.info(chalk.bold('Contributors'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Total Contributors:        ${chalk.white(totalContributors)}`);
    logger.info(`Average per Rule:          ${chalk.white(avgContributors.toFixed(1))}`);
    logger.info('');
    
    logger.info(chalk.bold('Events'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Total Events:              ${chalk.white(totalEvents)}`);
    logger.info(`Average per Rule:          ${chalk.white(avgEvents.toFixed(1))}`);
    logger.info('');
    
    logger.info(chalk.bold('Byzantine Filtering'));
    logger.info(chalk.dim('─'.repeat(60)));
    logger.info(`Rules with Filtering:      ${chalk.white(withFiltering)} (${((withFiltering / totalResults) * 100).toFixed(1)}%)`);
    if (withFiltering > 0) {
      logger.info(`Average Filter Rate:       ${chalk.white((avgFilterRate * 100).toFixed(1) + '%')}`);
    }
    
    logger.info('');
    logger.info(chalk.cyan.bold('═'.repeat(60)));
    
  } catch (error) {
    spinner.fail('Failed to calculate statistics');
    throw new CLIError(
      `Stats error: ${error instanceof Error ? error.message : String(error)}`,
      'CALIBRATION_STATS_FAILED'
    );
  }
}

export const calibrationCommand = {
  aggregate,
  list,
  show,
  stats,
};
