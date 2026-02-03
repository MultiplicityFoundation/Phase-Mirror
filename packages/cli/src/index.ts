#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { analyzeCommand } from './commands/analyze.js';
import { validateCommand } from './commands/validate.js';
import { driftCommand } from './commands/drift.js';
import { fpCommand } from './commands/fp.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { baselineCommand } from './commands/baseline.js';
import { logger } from './utils/logger.js';
import { handleFatalError } from './lib/errors.js';

const program = new Command();

program
  .name('oracle')
  .description(
    chalk.cyan('Phase Mirror CLI (Mirror Dissonance Protocol)') + 
    '\n\nAI Governance for GitHub Actions\n' +
    'Surface productive contradictions, name tensions, convert to levers\n\n' +
    chalk.dim('The mirror doesn\'t sell clarity. It sells the cost of avoiding it.')
  )
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      logger.setLevel('verbose');
    }
    if (opts.debug) {
      logger.setLevel('debug');
    }
  });

// Initialize command
program
  .command('init')
  .description('Initialize Phase Mirror in the current repository')
  .option('-t, --template <type>', 'Configuration template (minimal, standard, strict)')
  .option('-f, --force', 'Overwrite existing configuration', false)
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Analyze command
program
  .command('analyze [files...]')
  .description('Run Mirror Dissonance analysis on files')
  .option('-m, --mode <mode>', 'Analysis mode: pull_request, merge_group, drift, calibration', 'pull_request')
  .option('--strict', 'Enable strict mode with enhanced thresholds', false)
  .option('--dry-run', 'Warn-only mode, do not block', false)
  .option('-b, --baseline <file>', 'Baseline file for drift detection')
  .option('-o, --output <file>', 'Output file for results')
  .option('-f, --format <format>', 'Output format (text, json, sarif, github)', 'text')
  .option('-c, --config <file>', 'Path to configuration file')
  .action(async (files, options) => {
    try {
      await analyzeCommand(files, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Validate command
program
  .command('validate')
  .description('Validate L0 invariants (non-negotiable security boundaries)')
  .option('-w, --workflows-dir <dir>', 'Workflows directory', '.github/workflows')
  .option('--strict', 'Enable strict mode', false)
  .option('-o, --output <file>', 'Output file for results')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (options) => {
    try {
      await validateCommand(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Drift detection command
program
  .command('drift')
  .description('Detect configuration drift against baseline')
  .option('-b, --baseline <file>', 'Baseline file for comparison', 'baseline.json')
  .option('-t, --threshold <number>', 'Drift threshold (0.0-1.0)', parseFloat)
  .option('-o, --output <file>', 'Output file for drift report')
  .option('-f, --format <format>', 'Output format (text, json)', 'text')
  .action(async (options) => {
    try {
      await driftCommand(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Baseline command
program
  .command('baseline')
  .description('Create integrity baseline for drift detection')
  .option('-o, --output <file>', 'Output file for baseline', 'baseline.json')
  .action(async (options) => {
    try {
      await baselineCommand(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// False positive commands
const fp = program
  .command('fp')
  .description('Manage false positives');

fp.command('mark <finding-id>')
  .description('Mark a finding as false positive')
  .requiredOption('-r, --reason <reason>', 'Reason for marking as FP')
  .option('-p, --pattern', 'Create pattern-based FP rule', false)
  .action(async (findingId, options) => {
    try {
      await fpCommand.mark(findingId, options);
    } catch (error) {
      handleFatalError(error);
    }
  });

fp.command('list')
  .description('List all false positives')
  .option('--rule <rule-id>', 'Filter by rule ID')
  .option('-o, --output <format>', 'Output format (text, json)', 'text')
  .action(async (options) => {
    try {
      await fpCommand.list(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

fp.command('export')
  .description('Export false positives (anonymized)')
  .requiredOption('-o, --output <file>', 'Output file')
  .action(async (options) => {
    try {
      await fpCommand.export(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

fp.command('import <file>')
  .description('Import false positive patterns')
  .action(async (filePath) => {
    try {
      await fpCommand.import(filePath);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Config commands
const config = program
  .command('config')
  .description('Manage Phase Mirror configuration');

config.command('show')
  .description('Show current configuration')
  .action(async () => {
    try {
      await configCommand.show();
    } catch (error) {
      handleFatalError(error);
    }
  });

config.command('get <key>')
  .description('Get a configuration value')
  .action(async (key) => {
    try {
      await configCommand.get(key);
    } catch (error) {
      handleFatalError(error);
    }
  });

config.command('set <key> <value>')
  .description('Set a configuration value')
  .action(async (key, value) => {
    try {
      await configCommand.set(key, value);
    } catch (error) {
      handleFatalError(error);
    }
  });

config.command('validate')
  .description('Validate configuration file')
  .option('-c, --config <file>', 'Configuration file to validate')
  .action(async (options) => {
    try {
      await configCommand.validate(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

// Error handler for unhandled errors
process.on('unhandledRejection', (error) => {
  handleFatalError(error);
});

process.on('uncaughtException', (error) => {
  handleFatalError(error);
});

program.parse();
