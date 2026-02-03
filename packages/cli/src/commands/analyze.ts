import chalk from 'chalk';
import ora from 'ora';
import { PhaseOracle } from '../lib/oracle.js';
import { OutputFormatter } from '../lib/output.js';
import { loadConfig } from '../lib/config.js';
import { findFiles } from '../utils/files.js';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import type { AnalyzeOptions, GitContext } from '../types/cli.js';

export async function analyzeCommand(files: string[], options: AnalyzeOptions): Promise<void> {
  const spinner = ora('Analyzing files...').start();

  try {
    // Load config
    const config = await loadConfig(options.config);
    
    // Find files to analyze
    const fileList = files.length > 0 ? await findFiles(files) : await findFiles(['**/*.yml', '**/*.yaml']);
    
    if (fileList.length === 0) {
      spinner.warn('No files found to analyze');
      return;
    }

    spinner.text = `Analyzing ${fileList.length} files...`;

    // Initialize oracle
    const oracle = new PhaseOracle(config);
    await oracle.initialize();

    // Build context
    const context: GitContext = {
      repositoryName: process.env.GITHUB_REPOSITORY,
      prNumber: process.env.GITHUB_PR_NUMBER ? parseInt(process.env.GITHUB_PR_NUMBER) : undefined,
      commitSha: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME,
      author: process.env.GITHUB_ACTOR
    };

    // Run analysis
    const result = await oracle.analyze({
      files: fileList,
      mode: options.mode,
      baseline: options.baseline,
      context
    });

    spinner.succeed('Analysis complete');

    // Format and output results
    const formatter = new OutputFormatter(options.format || 'text');
    const output = formatter.formatReport(result);
    
    console.log(output);

    // Save to file if requested
    if (options.output) {
      const fs = await import('fs/promises');
      await fs.writeFile(options.output, JSON.stringify(result, null, 2));
      logger.info(chalk.dim(`\nResults saved to: ${options.output}`));
    }

    // Exit with appropriate code
    if (result.decision === 'BLOCK') {
      process.exit(1);
    }

  } catch (error) {
    spinner.fail('Analysis failed');
    throw new CLIError(
      `Analysis error: ${error instanceof Error ? error.message : String(error)}`,
      'ANALYZE_FAILED'
    );
  }
}
