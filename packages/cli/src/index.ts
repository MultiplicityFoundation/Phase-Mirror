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
import { nonceCommand } from './commands/nonce.js';
import { verifyCommand } from './commands/verify.js';
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

// Nonce management commands
const nonce = program
  .command('nonce')
  .description('Manage nonce bindings for verified organizations');

nonce.command('validate')
  .description('Validate that a nonce is properly bound to an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--nonce <nonce>', 'Nonce to validate')
  .option('-v, --verbose', 'Show detailed binding information')
  .action(async (options) => {
    try {
      await nonceCommand.validate(options);
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('generate')
  .description('Generate and bind a new nonce for a verified organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--public-key <key>', 'Organization public key')
  .action(async (options) => {
    try {
      await nonceCommand.generate({
        orgId: options.orgId,
        publicKey: options.publicKey
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('rotate')
  .description('Rotate nonce for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .option('--public-key <key>', 'Public key (uses existing if not provided)')
  .option('--new-public-key <key>', 'New public key for rotation')
  .requiredOption('-r, --reason <reason>', 'Reason for rotation')
  .action(async (options) => {
    try {
      await nonceCommand.rotate({
        orgId: options.orgId,
        publicKey: options.publicKey,
        newPublicKey: options.newPublicKey,
        reason: options.reason
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('revoke')
  .description('Revoke a nonce binding (e.g., due to security violation)')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('-r, --reason <reason>', 'Reason for revocation')
  .action(async (options) => {
    try {
      await nonceCommand.revoke({
        orgId: options.orgId,
        reason: options.reason
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('list')
  .description('List nonce bindings')
  .option('--org-id <orgId>', 'Filter by organization ID')
  .option('--show-revoked', 'Include revoked bindings', false)
  .action(async (options) => {
    try {
      await nonceCommand.list({
        orgId: options.orgId,
        showRevoked: options.showRevoked
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('history')
  .description('Show rotation history for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .action(async (options) => {
    try {
      await nonceCommand.history({
        orgId: options.orgId
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

nonce.command('show')
  .description('Show current nonce binding details for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .action(async (options) => {
    try {
      await nonceCommand.show({
        orgId: options.orgId
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

// Identity verification commands
const verify = program
  .command('verify')
  .description('Verify organizational identity via GitHub or Stripe');

verify.command('github')
  .description('Verify organization via GitHub')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--github-org <orgLogin>', 'GitHub organization login')
  .requiredOption('--public-key <key>', 'Organization public key')
  .option('-v, --verbose', 'Show detailed verification information')
  .action(async (options) => {
    try {
      await verifyCommand.github({
        orgId: options.orgId,
        githubOrg: options.githubOrg,
        publicKey: options.publicKey,
        verbose: options.verbose
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

verify.command('stripe')
  .description('Verify organization via Stripe customer')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--stripe-customer <customerId>', 'Stripe customer ID (e.g., cus_ABC123)')
  .requiredOption('--public-key <key>', 'Organization public key')
  .option('--require-subscription', 'Require active subscription', false)
  .option('--product-ids <ids>', 'Required product IDs (comma-separated)')
  .option('-v, --verbose', 'Show detailed verification information')
  .action(async (options) => {
    try {
      const productIds = options.productIds 
        ? options.productIds.split(',').map((id: string) => id.trim())
        : undefined;

      await verifyCommand.stripe({
        orgId: options.orgId,
        stripeCustomer: options.stripeCustomer,
        publicKey: options.publicKey,
        requireSubscription: options.requireSubscription,
        productIds,
        verbose: options.verbose
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

verify.command('list')
  .description('List verified identities')
  .option('--method <method>', 'Filter by verification method (github_org, stripe_customer)')
  .option('-v, --verbose', 'Show detailed information')
  .action(async (options) => {
    try {
      await verifyCommand.list({
        method: options.method,
        verbose: options.verbose
      });
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
