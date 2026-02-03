import chalk from 'chalk';
import ora from 'ora';
import { PhaseOracle } from '../lib/oracle.js';
import { OutputFormatter } from '../lib/output.js';
import { loadConfig } from '../lib/config.js';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import type { ValidateOptions } from '../types/cli.js';

export async function validateCommand(options: ValidateOptions): Promise<void> {
  const spinner = ora('Validating L0 invariants...').start();

  try {
    // Load config
    const config = await loadConfig();

    // Initialize oracle
    const oracle = new PhaseOracle(config);
    await oracle.initialize();

    // Run L0 validation
    const result = await oracle.validateL0({
      workflowsDir: options.workflowsDir,
      strict: options.strict
    });

    spinner.succeed('Validation complete');

    // Format and output results
    const formatter = new OutputFormatter(options.format || 'text');
    const output = formatter.formatL0Result(result);
    
    console.log(output);

    // Save to file if requested
    if (options.output) {
      const fs = await import('fs/promises');
      await fs.writeFile(options.output, JSON.stringify(result, null, 2));
      logger.info(chalk.dim(`\nResults saved to: ${options.output}`));
    }

    // Exit with error if invalid
    if (!result.valid) {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Validation failed');
    throw new CLIError(
      `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      'VALIDATE_FAILED'
    );
  }
}
