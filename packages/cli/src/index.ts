#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
import { reputationCommand } from './commands/reputation.js';
import { orgScanCommand } from './commands/org-scan.js';
import { logger } from './utils/logger.js';
import { handleFatalError } from './lib/errors.js';

/**
 * Package-relative path anchor.
 * Works for local dev, global npm install, and npx execution.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Schema path resolved relative to compiled output, not CWD. */
export const schemaPath = join(__dirname, 'schemas', 'dissonance-report.schema.json');

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

// Reputation management commands
const reputation = program
  .command('reputation')
  .description('Manage organization reputation and consistency scores');

reputation.command('show')
  .description('Show reputation details for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .option('-v, --verbose', 'Show detailed information including contribution weights')
  .action(async (options) => {
    try {
      await reputationCommand.show({
        orgId: options.orgId,
        verbose: options.verbose
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

reputation.command('list')
  .description('List organizations by reputation score')
  .option('--min-score <score>', 'Minimum reputation score filter', parseFloat)
  .option('--sort-by <field>', 'Sort by field (reputation, consistency, stake)', 'reputation')
  .option('--limit <number>', 'Limit number of results', parseInt)
  .action(async (options) => {
    try {
      await reputationCommand.list({
        minScore: options.minScore,
        sortBy: options.sortBy,
        limit: options.limit
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

reputation.command('calculate-consistency')
  .description('Calculate consistency score for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .option('--mock-data', 'Use mock contribution data for demo', false)
  .action(async (options) => {
    try {
      await reputationCommand.calculateConsistency({
        orgId: options.orgId,
        mockData: options.mockData
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

reputation.command('update')
  .description('Update reputation metrics for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .option('--reputation-score <score>', 'Reputation score (0.0-1.0)', parseFloat)
  .option('--consistency-score <score>', 'Consistency score (0.0-1.0)', parseFloat)
  .option('--contribution-count <count>', 'Number of contributions', parseInt)
  .option('--flagged-count <count>', 'Number of times flagged', parseInt)
  .option('--age-score <score>', 'Age score (0.0-1.0)', parseFloat)
  .option('--volume-score <score>', 'Volume score (0.0-1.0)', parseFloat)
  .action(async (options) => {
    try {
      await reputationCommand.update({
        orgId: options.orgId,
        reputationScore: options.reputationScore,
        consistencyScore: options.consistencyScore,
        contributionCount: options.contributionCount,
        flaggedCount: options.flaggedCount,
        ageScore: options.ageScore,
        volumeScore: options.volumeScore
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

// Stake management subcommands
const stake = reputation
  .command('stake')
  .description('Manage stake pledges');

stake.command('pledge')
  .description('Create a stake pledge for an organization')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('--amount <amount>', 'Stake amount in USD', parseFloat)
  .action(async (options) => {
    try {
      await reputationCommand.pledgeStake({
        orgId: options.orgId,
        amount: options.amount
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

stake.command('slash')
  .description('Slash stake for malicious behavior')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .requiredOption('-r, --reason <reason>', 'Reason for slashing')
  .action(async (options) => {
    try {
      await reputationCommand.slashStake({
        orgId: options.orgId,
        reason: options.reason
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

stake.command('show')
  .description('Show stake pledge details')
  .requiredOption('--org-id <orgId>', 'Organization ID')
  .action(async (options) => {
    try {
      await reputationCommand.showStake({
        orgId: options.orgId
      });
    } catch (error) {
      handleFatalError(error);
    }
  });

// Org-scan command (Pro — requires @phase-mirror/pro)
program
  .command('org-scan')
  .description('Scan GitHub org governance state (Pro feature)')
  .requiredOption('--org <org>', 'GitHub organization login (e.g., PhaseMirror)')
  .option('--dry-run', 'Print RepoGovernanceState[] JSON instead of writing to DynamoDB', false)
  .option('--max-repos <count>', 'Limit number of repos scanned (for debugging)', parseInt)
  .action(async (options) => {
    try {
      await orgScanCommand({
        org: options.org,
        dryRun: options.dryRun,
        maxRepos: options.maxRepos,
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
