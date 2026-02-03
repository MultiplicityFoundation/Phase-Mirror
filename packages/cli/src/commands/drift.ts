import chalk from 'chalk';
import ora from 'ora';
import { PhaseOracle } from '../lib/oracle.js';
import { OutputFormatter } from '../lib/output.js';
import { loadConfig } from '../lib/config.js';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import type { DriftOptions } from '../types/cli.js';
import * as fs from 'fs/promises';

export async function driftCommand(options: DriftOptions): Promise<void> {
  const spinner = ora('Checking for drift...').start();

  try {
    // Load config
    const config = await loadConfig();

    // Load baseline
    const baselineContent = await fs.readFile(options.baseline, 'utf-8');
    const baseline = JSON.parse(baselineContent);

    // Initialize oracle
    const oracle = new PhaseOracle(config);
    await oracle.initialize();

    // Check drift
    const threshold = options.threshold || config.drift?.threshold || 0.15;
    const result = await oracle.checkDrift({
      baseline,
      threshold
    });

    spinner.succeed('Drift check complete');

    // Format and output results
    const formatter = new OutputFormatter(options.format || 'text');
    const output = formatter.formatDriftResult(result);
    
    console.log(output);

    // Save to file if requested
    if (options.output) {
      await fs.writeFile(options.output, JSON.stringify(result, null, 2));
      logger.info(chalk.dim(`\nResults saved to: ${options.output}`));
    }

    // Exit with error if drift detected
    if (result.driftDetected) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Drift check failed');
    throw new CLIError(
      `Drift check error: ${error instanceof Error ? error.message : String(error)}`,
      'DRIFT_CHECK_FAILED'
    );
  }
}
