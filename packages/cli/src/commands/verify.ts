/**
 * CLI commands for identity verification
 * 
 * Provides command-line interface for verifying organizational identities
 * via GitHub organizations or Stripe customers.
 */

import chalk from 'chalk';
import { table } from 'table';
import { 
  GitHubVerifier, 
  StripeVerifier, 
  NonceBindingService,
  createLocalTrustAdapters,
} from '@mirror-dissonance/core';
import type { OrganizationIdentity } from '@mirror-dissonance/core';
import { logger } from '../utils/logger';
import { CLIError } from '../lib/errors';

/**
 * Get the data directory for trust adapters
 * Uses environment variable or default to .phase-mirror-data
 */
function getDataDir(): string {
  return process.env.PHASE_MIRROR_DATA_DIR || '.phase-mirror-data';
}

/**
 * Verify an organization via GitHub
 */
async function verifyViaGitHub(options: {
  orgId: string;
  githubOrg: string;
  publicKey: string;
  verbose?: boolean;
}): Promise<void> {
  const githubToken = process.env.GITHUB_TOKEN;
  
  if (!githubToken) {
    throw new CLIError(
      'GITHUB_TOKEN environment variable is required for GitHub verification.\n' +
      'Create a personal access token at: https://github.com/settings/tokens',
      'MISSING_TOKEN'
    );
  }

  try {
    logger.info(chalk.cyan('\n🔍 Verifying organization via GitHub...\n'));

    // Initialize services
    const verifier = new GitHubVerifier(githubToken);
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    const nonceService = new NonceBindingService(adapters.identityStore);

    // Check if organization is already verified
    const existingIdentity = await adapters.identityStore.getIdentity(options.orgId);
    if (existingIdentity) {
      throw new CLIError(
        `Organization '${options.orgId}' is already verified via ${existingIdentity.verificationMethod}.\n` +
        `Verified at: ${existingIdentity.verifiedAt.toISOString()}`,
        'ALREADY_VERIFIED'
      );
    }

    // Verify via GitHub
    const result = await verifier.verifyOrganization(options.orgId, options.githubOrg);

    if (!result.verified) {
      logger.error(chalk.red(`\n❌ Verification failed: ${result.reason}\n`));
      process.exit(1);
    }

    logger.success(chalk.green('✅ GitHub verification successful!\n'));

    if (options.verbose) {
      logger.info(chalk.cyan('GitHub Organization Details:'));
      logger.info(`  Org Name: ${result.metadata.githubOrgName}`);
      logger.info(`  Org ID: ${result.metadata.githubOrgId}`);
      logger.info(`  Created At: ${result.metadata.createdAt.toISOString()}`);
      logger.info(`  Member Count: ${result.metadata.memberCount}`);
      logger.info(`  Public Repos: ${result.metadata.publicRepoCount}`);
      logger.info(`  Recent Activity: ${result.metadata.hasRecentActivity ? 'Yes' : 'No'}`);
      logger.info('');
    }

    // Generate and bind nonce
    logger.info(chalk.cyan('🔐 Generating cryptographic nonce...\n'));
    const nonceResult = await nonceService.generateAndBindNonce(options.orgId, options.publicKey);

    // Store identity
    const identity: OrganizationIdentity = {
      orgId: options.orgId,
      publicKey: options.publicKey,
      verificationMethod: 'github_org',
      verifiedAt: new Date(),
      uniqueNonce: nonceResult.binding.nonce,
      githubOrgId: result.metadata.githubOrgId,
    };

    await adapters.identityStore.storeIdentity(identity);

    logger.success(chalk.green('✅ Identity stored successfully!\n'));
    logger.info(chalk.cyan('Identity Details:'));
    logger.info(`  Org ID: ${identity.orgId}`);
    logger.info(`  Verification Method: ${identity.verificationMethod}`);
    logger.info(`  Verified At: ${identity.verifiedAt.toISOString()}`);
    logger.info(`  GitHub Org ID: ${identity.githubOrgId}`);
    logger.info(`  Unique Nonce: ${identity.uniqueNonce}`);
    logger.info('');
    logger.info(chalk.dim(`Identity stored in ${dataDir}/identities.json`));
    logger.info('');

  } catch (error: any) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`GitHub verification failed: ${error.message}`, 'VERIFICATION_FAILED');
  }
}

/**
 * Verify an organization via Stripe customer
 */
async function verifyViaStripe(options: {
  orgId: string;
  stripeCustomer: string;
  publicKey: string;
  requireSubscription?: boolean;
  productIds?: string[];
  verbose?: boolean;
}): Promise<void> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeKey) {
    throw new CLIError(
      'STRIPE_SECRET_KEY environment variable is required for Stripe verification.\n' +
      'Get your secret key from: https://dashboard.stripe.com/apikeys',
      'MISSING_KEY'
    );
  }

  try {
    logger.info(chalk.cyan('\n🔍 Verifying organization via Stripe...\n'));

    // Initialize services
    const verifier = new StripeVerifier(stripeKey);
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    const nonceService = new NonceBindingService(adapters.identityStore);

    // Check if organization is already verified
    const existingIdentity = await adapters.identityStore.getIdentity(options.orgId);
    if (existingIdentity) {
      throw new CLIError(
        `Organization '${options.orgId}' is already verified via ${existingIdentity.verificationMethod}.\n` +
        `Verified at: ${existingIdentity.verifiedAt.toISOString()}`,
        'ALREADY_VERIFIED'
      );
    }

    // Check if Stripe customer is already bound to another org
    const existingBinding = await adapters.identityStore.getIdentityByStripeCustomerId(
      options.stripeCustomer
    );
    if (existingBinding) {
      throw new CLIError(
        `Stripe customer '${options.stripeCustomer}' is already bound to organization '${existingBinding.orgId}'.\n` +
        `Each Stripe customer can only verify one organization.`,
        'CUSTOMER_ALREADY_BOUND'
      );
    }

    // Verify via Stripe
    let result;
    if (options.requireSubscription && options.productIds) {
      result = await verifier.verifyCustomerWithSubscription(
        options.orgId,
        options.stripeCustomer,
        options.productIds
      );
    } else if (options.requireSubscription) {
      result = await verifier.verifyCustomerWithSubscription(
        options.orgId,
        options.stripeCustomer
      );
    } else {
      result = await verifier.verifyCustomer(options.orgId, options.stripeCustomer);
    }

    if (!result.verified) {
      logger.error(chalk.red(`\n❌ Verification failed: ${result.reason}\n`));
      process.exit(1);
    }

    logger.success(chalk.green('✅ Stripe verification successful!\n'));

    if (options.verbose) {
      logger.info(chalk.cyan('Stripe Customer Details:'));
      logger.info(`  Customer ID: ${result.metadata.stripeCustomerId}`);
      if (result.metadata.customerEmail) {
        logger.info(`  Email: ${result.metadata.customerEmail}`);
      }
      if (result.metadata.customerName) {
        logger.info(`  Name: ${result.metadata.customerName}`);
      }
      logger.info(`  Account Created: ${result.metadata.accountCreatedAt.toISOString()}`);
      logger.info(`  Payment Count: ${result.metadata.successfulPaymentCount}`);
      logger.info(`  Active Subscription: ${result.metadata.hasActiveSubscription ? 'Yes' : 'No'}`);
      if (result.metadata.subscriptionProductIds && result.metadata.subscriptionProductIds.length > 0) {
        logger.info(`  Products: ${result.metadata.subscriptionProductIds.join(', ')}`);
      }
      logger.info(`  Customer Type: ${result.metadata.customerType || 'Unknown'}`);
      logger.info(`  Business Verified: ${result.metadata.isBusinessVerified ? 'Yes' : 'No'}`);
      logger.info('');
    }

    // Generate and bind nonce
    logger.info(chalk.cyan('🔐 Generating cryptographic nonce...\n'));
    const nonceResult = await nonceService.generateAndBindNonce(options.orgId, options.publicKey);

    // Store identity
    const identity: OrganizationIdentity = {
      orgId: options.orgId,
      publicKey: options.publicKey,
      verificationMethod: 'stripe_customer',
      verifiedAt: new Date(),
      uniqueNonce: nonceResult.binding.nonce,
      stripeCustomerId: result.metadata.stripeCustomerId,
    };

    await adapters.identityStore.storeIdentity(identity);

    logger.success(chalk.green('✅ Identity stored successfully!\n'));
    logger.info(chalk.cyan('Identity Details:'));
    logger.info(`  Org ID: ${identity.orgId}`);
    logger.info(`  Verification Method: ${identity.verificationMethod}`);
    logger.info(`  Verified At: ${identity.verifiedAt.toISOString()}`);
    logger.info(`  Stripe Customer ID: ${identity.stripeCustomerId}`);
    logger.info(`  Unique Nonce: ${identity.uniqueNonce}`);
    logger.info('');
    logger.info(chalk.dim(`Identity stored in ${dataDir}/identities.json`));
    logger.info('');

  } catch (error: any) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(`Stripe verification failed: ${error.message}`, 'VERIFICATION_FAILED');
  }
}

/**
 * List verified identities
 */
async function listIdentities(options: {
  method?: string;
  verbose?: boolean;
}): Promise<void> {
  try {
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);

    logger.info(chalk.cyan('\n📋 Verified Identities\n'));

    // Get all identities (we'll need to read the file directly since there's no listAll method)
    // For now, let's use the Stripe-specific method and combine with a manual read
    const stripeIdentities = await adapters.identityStore.listStripeVerifiedIdentities();
    
    // TODO: Add a listAllIdentities method to the adapter interface
    // For now, this is a limitation - we can only list Stripe-verified orgs

    if (options.method === 'stripe_customer' || !options.method) {
      if (stripeIdentities.length === 0) {
        logger.info(chalk.yellow('No Stripe-verified identities found.'));
        logger.info('');
        return;
      }

      const tableData = [
        ['Org ID', 'Method', 'Verified At', 'Stripe Customer ID'],
        ...stripeIdentities.map((identity: OrganizationIdentity) => [
          identity.orgId,
          identity.verificationMethod,
          identity.verifiedAt.toISOString(),
          identity.stripeCustomerId || '-',
        ]),
      ];

      logger.info(table(tableData));
      logger.info('');
    }

  } catch (error: any) {
    throw new CLIError(`Failed to list identities: ${error.message}`, 'LIST_FAILED');
  }
}

/**
 * Export verify commands
 */
export const verifyCommand = {
  github: verifyViaGitHub,
  stripe: verifyViaStripe,
  list: listIdentities,
};
