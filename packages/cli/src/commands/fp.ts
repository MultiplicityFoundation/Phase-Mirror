import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { PhaseOracle } from '../lib/oracle.js';
import { OutputFormatter } from '../lib/output.js';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import type { FPMarkOptions, FPListOptions, FPExportOptions } from '../types/cli.js';

async function mark(findingId: string, options: FPMarkOptions): Promise<void> {
  const spinner = ora(`Marking finding ${findingId} as false positive...`).start();

  try {
    const oracle = new PhaseOracle();
    await oracle.initialize();

    // Mark as FP
    await oracle.markFalsePositive({
      findingId,
      reason: options.reason,
      createPattern: options.pattern
    });

    spinner.succeed(`Finding ${findingId} marked as false positive`);
    
    logger.info(chalk.dim(`Reason: ${options.reason}`));
    
    if (options.pattern) {
      logger.info(chalk.green('✓ Pattern-based FP rule created'));
    }

  } catch (error) {
    spinner.fail('Failed to mark false positive');
    throw new CLIError(
      `FP marking error: ${error instanceof Error ? error.message : String(error)}`,
      'FP_MARK_FAILED'
    );
  }
}

async function list(options: FPListOptions): Promise<void> {
  const spinner = ora('Loading false positives...').start();

  try {
    const oracle = new PhaseOracle();
    await oracle.initialize();

    const fps = await oracle.listFalsePositives({
      ruleId: options.rule
    });

    spinner.succeed(`Found ${fps.length} false positives`);

    // Format output
    const formatter = new OutputFormatter(options.output);
    const output = formatter.formatFPList(fps);

    console.log(output);

  } catch (error) {
    spinner.fail('Failed to list false positives');
    throw new CLIError(
      `FP list error: ${error instanceof Error ? error.message : String(error)}`,
      'FP_LIST_FAILED'
    );
  }
}

async function exportFPs(options: FPExportOptions): Promise<void> {
  const spinner = ora('Exporting false positives...').start();

  try {
    const oracle = new PhaseOracle();
    await oracle.initialize();

    // Export anonymized FP data
    const exportData = await oracle.exportFalsePositives({
      anonymize: true
    });

    const outputPath = path.resolve(options.output);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(
      outputPath,
      JSON.stringify(exportData, null, 2),
      'utf-8'
    );

    spinner.succeed(`False positives exported to ${outputPath}`);
    
    logger.info(chalk.dim(`\nExported ${exportData.count} FP entries (anonymized)`));
    logger.info(chalk.dim('This data can be contributed to network calibration with your consent'));

  } catch (error) {
    spinner.fail('Export failed');
    throw new CLIError(
      `FP export error: ${error instanceof Error ? error.message : String(error)}`,
      'FP_EXPORT_FAILED'
    );
  }
}

async function importFPs(filePath: string): Promise<void> {
  const spinner = ora('Importing false positive patterns...').start();

  try {
    const importPath = path.resolve(filePath);
    const importData = JSON.parse(await fs.readFile(importPath, 'utf-8'));

    const oracle = new PhaseOracle();
    await oracle.initialize();

    await oracle.importFalsePositives(importData);

    spinner.succeed('False positive patterns imported');
    
    logger.info(chalk.dim(`Imported ${importData.patterns?.length || 0} FP patterns`));

  } catch (error) {
    spinner.fail('Import failed');
    throw new CLIError(
      `FP import error: ${error instanceof Error ? error.message : String(error)}`,
      'FP_IMPORT_FAILED'
    );
  }
}

export const fpCommand = {
  mark,
  list,
  export: exportFPs,
  import: importFPs
};
