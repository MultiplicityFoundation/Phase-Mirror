/**
 * CLI commands for nonce management
 * 
 * Provides command-line interface for managing cryptographic nonce bindings
 * tied to verified organizational identities.
 */

import chalk from 'chalk';
import { table } from 'table';
import { NonceBindingService } from '@mirror-dissonance/core';
import { createLocalTrustAdapters } from '@mirror-dissonance/core';
import { logger } from '../utils/logger';
import { CLIError } from '../lib/errors.js';

/**
 * Get the data directory for trust adapters
 * Uses environment variable or default to .phase-mirror-data
 */
function getDataDir(): string {
  return process.env.PHASE_MIRROR_DATA_DIR || '.phase-mirror-data';
}

/**
 * Initialize nonce binding service
 */
function initializeService(): NonceBindingService {
  const dataDir = getDataDir();
  const adapters = createLocalTrustAdapters(dataDir);
  return new NonceBindingService(adapters.identityStore);
}

/**
 * Validate that a nonce is properly bound to an organization
 */
async function validate(options: {
  orgId: string;
  nonce: string;
  verbose?: boolean;
}): Promise<void> {
  try {
    const service = initializeService();
    
    logger.info(chalk.cyan('\n🔍 Validating nonce binding...\n'));
    
    const result = await service.verifyBinding(options.nonce, options.orgId);
    
    if (result.valid) {
      logger.success(chalk.green('✓ Nonce is valid and properly bound\n'));
      
      if (options.verbose && result.binding) {
        logger.info(chalk.cyan('Binding details:'));
        console.log(`  Organization ID: ${result.binding.orgId}`);
        console.log(`  Nonce: ${result.binding.nonce}`);
        console.log(`  Public Key: ${result.binding.publicKey}`);
        console.log(`  Issued: ${result.binding.issuedAt.toISOString()}`);
        console.log(`  Usage Count: ${result.binding.usageCount}`);
        console.log(`  Revoked: ${result.binding.revoked ? 'Yes' : 'No'}`);
        if (result.binding.previousNonce) {
          console.log(`  Previous Nonce: ${result.binding.previousNonce.substring(0, 16)}...`);
        }
      }
    } else {
      logger.error(chalk.red('✗ Nonce validation failed\n'));
      logger.error(chalk.yellow(`Reason: ${result.reason}\n`));
      throw new CLIError(
        `Nonce validation failed: ${result.reason}`,
        'NONCE_VALIDATION_FAILED'
      );
    }
  } catch (error) {
    if (error instanceof CLIError) {
      throw error;
    }
    throw new CLIError(
      `Failed to validate nonce: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_VALIDATE_ERROR'
    );
  }
}

/**
 * Generate and bind a new nonce for a verified organization
 */
async function generate(options: {
  orgId: string;
  publicKey: string;
}): Promise<void> {
  try {
    const service = initializeService();
    
    logger.info(chalk.cyan('\n🔐 Generating and binding nonce...\n'));
    
    const result = await service.generateAndBindNonce(
      options.orgId,
      options.publicKey
    );
    
    logger.success(chalk.green('✓ Nonce generated and bound successfully\n'));
    
    logger.info(chalk.cyan('Binding details:'));
    console.log(`  Organization ID: ${result.binding.orgId}`);
    console.log(`  Nonce: ${chalk.bold(result.binding.nonce)}`);
    console.log(`  Public Key: ${result.binding.publicKey}`);
    console.log(`  Signature: ${result.binding.signature.substring(0, 32)}...`);
    console.log(`  Issued: ${result.binding.issuedAt.toISOString()}`);
    console.log(`  Is New: ${result.isNew ? 'Yes' : 'No (replaced revoked)'}`);
    
    if (result.previousBinding) {
      logger.info(chalk.yellow('\nPrevious binding was replaced:'));
      console.log(`  Old Nonce: ${result.previousBinding.nonce.substring(0, 16)}...`);
      console.log(`  Revoked: ${result.previousBinding.revoked ? 'Yes' : 'No'}`);
    }
    
    logger.info(chalk.dim('\n💡 Save this nonce securely. You\'ll need it for FP submissions.\n'));
  } catch (error) {
    throw new CLIError(
      `Failed to generate nonce: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_GENERATE_ERROR'
    );
  }
}

/**
 * Rotate nonce for an organization
 */
async function rotate(options: {
  orgId: string;
  publicKey?: string;
  newPublicKey?: string;
  reason: string;
}): Promise<void> {
  try {
    const service = initializeService();
    
    // Use newPublicKey if provided, otherwise use publicKey, or get from existing binding
    let keyToUse = options.newPublicKey || options.publicKey;
    
    if (!keyToUse) {
      // Get current binding to use existing public key
      const currentBinding = await service.getRotationHistory(options.orgId);
      if (currentBinding.length > 0) {
        keyToUse = currentBinding[currentBinding.length - 1].publicKey;
      } else {
        throw new Error('No existing binding found and no public key provided');
      }
    }
    
    logger.info(chalk.cyan('\n🔄 Rotating nonce...\n'));
    
    const result = await service.rotateNonce(
      options.orgId,
      keyToUse,
      options.reason
    );
    
    logger.success(chalk.green('✓ Nonce rotated successfully\n'));
    
    logger.info(chalk.cyan('New binding:'));
    console.log(`  Nonce: ${chalk.bold(result.binding.nonce)}`);
    console.log(`  Public Key: ${result.binding.publicKey}`);
    console.log(`  Issued: ${result.binding.issuedAt.toISOString()}`);
    
    if (result.previousBinding) {
      logger.info(chalk.yellow('\nOld binding (now revoked):'));
      console.log(`  Nonce: ${result.previousBinding.nonce.substring(0, 16)}...`);
      console.log(`  Revoked: ${result.previousBinding.revoked ? 'Yes' : 'No'}`);
      console.log(`  Revocation Reason: ${result.previousBinding.revocationReason || 'N/A'}`);
    }
    
    logger.info(chalk.dim('\n💡 Update your FP submission configuration with the new nonce.\n'));
  } catch (error) {
    throw new CLIError(
      `Failed to rotate nonce: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_ROTATE_ERROR'
    );
  }
}

/**
 * Revoke a nonce binding
 */
async function revoke(options: {
  orgId: string;
  reason: string;
}): Promise<void> {
  try {
    const service = initializeService();
    
    logger.info(chalk.cyan('\n⚠️  Revoking nonce binding...\n'));
    
    await service.revokeBinding(options.orgId, options.reason);
    
    logger.success(chalk.green('✓ Nonce binding revoked\n'));
    
    logger.info(chalk.yellow('Reason: ' + options.reason));
    logger.info(chalk.dim('\n⚠️  This organization can no longer submit FP data with the revoked nonce.\n'));
  } catch (error) {
    throw new CLIError(
      `Failed to revoke nonce: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_REVOKE_ERROR'
    );
  }
}

/**
 * List nonce bindings
 */
async function list(options: {
  orgId?: string;
  showRevoked?: boolean;
}): Promise<void> {
  try {
    const dataDir = getDataDir();
    const adapters = createLocalTrustAdapters(dataDir);
    
    logger.info(chalk.cyan('\n📋 Nonce Bindings\n'));
    
    // Read all identities
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const bindingsFile = path.join(dataDir, 'nonce-bindings.json');
    
    try {
      const content = await fs.readFile(bindingsFile, 'utf-8');
      const bindings = JSON.parse(content);
      
      // Filter bindings
      let filtered = bindings;
      
      if (options.orgId) {
        filtered = filtered.filter((b: any) => b.orgId === options.orgId);
      }
      
      if (!options.showRevoked) {
        filtered = filtered.filter((b: any) => !b.revoked);
      }
      
      if (filtered.length === 0) {
        logger.info(chalk.yellow('No nonce bindings found.\n'));
        return;
      }
      
      // Prepare table data
      const tableData = [
        [
          chalk.bold('Org ID'),
          chalk.bold('Nonce'),
          chalk.bold('Issued'),
          chalk.bold('Usage'),
          chalk.bold('Status')
        ]
      ];
      
      for (const binding of filtered) {
        const nonceShort = binding.nonce.substring(0, 16) + '...';
        const issued = new Date(binding.issuedAt).toLocaleDateString();
        const status = binding.revoked 
          ? chalk.red('Revoked') 
          : chalk.green('Active');
        
        tableData.push([
          binding.orgId,
          nonceShort,
          issued,
          binding.usageCount.toString(),
          status
        ]);
      }
      
      console.log(table(tableData));
      logger.info(chalk.dim(`\nTotal: ${filtered.length} binding(s)\n`));
      
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info(chalk.yellow('No nonce bindings found. Initialize with "nonce generate".\n'));
      } else {
        throw error;
      }
    }
  } catch (error) {
    throw new CLIError(
      `Failed to list nonce bindings: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_LIST_ERROR'
    );
  }
}

/**
 * Show rotation history for an organization
 */
async function history(options: {
  orgId: string;
}): Promise<void> {
  try {
    const service = initializeService();
    
    logger.info(chalk.cyan(`\n📜 Rotation History for ${options.orgId}\n`));
    
    const historyBindings = await service.getRotationHistory(options.orgId);
    
    if (historyBindings.length === 0) {
      logger.info(chalk.yellow('No nonce bindings found for this organization.\n'));
      return;
    }
    
    // Prepare table data
    const tableData = [
      [
        chalk.bold('#'),
        chalk.bold('Nonce'),
        chalk.bold('Issued'),
        chalk.bold('Revoked'),
        chalk.bold('Usage'),
        chalk.bold('Status')
      ]
    ];
    
    for (let i = 0; i < historyBindings.length; i++) {
      const binding = historyBindings[i];
      const nonceShort = binding.nonce.substring(0, 16) + '...';
      const issued = new Date(binding.issuedAt).toISOString();
      const revoked = binding.revokedAt 
        ? new Date(binding.revokedAt).toISOString()
        : 'N/A';
      const status = binding.revoked 
        ? chalk.red('Revoked') 
        : chalk.green('Active');
      
      tableData.push([
        (i + 1).toString(),
        nonceShort,
        issued,
        revoked,
        binding.usageCount.toString(),
        status
      ]);
    }
    
    console.log(table(tableData));
    
    logger.info(chalk.dim(`\nTotal rotations: ${historyBindings.length - 1}\n`));
    
    // Show current active nonce
    const current = historyBindings[historyBindings.length - 1];
    if (!current.revoked) {
      logger.info(chalk.green('Current active nonce:'));
      console.log(`  ${current.nonce}\n`);
    }
    
  } catch (error) {
    throw new CLIError(
      `Failed to get rotation history: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_HISTORY_ERROR'
    );
  }
}

/**
 * Show binding details for an organization
 */
async function show(options: {
  orgId: string;
}): Promise<void> {
  try {
    const service = initializeService();
    
    logger.info(chalk.cyan('\n📋 Nonce Binding Details\n'));
    
    const binding = await service.getRotationHistory(options.orgId);
    
    if (binding.length === 0) {
      logger.info(chalk.yellow('No nonce binding found for this organization.\n'));
      return;
    }
    
    // Get the current (most recent) binding
    const current = binding[binding.length - 1];
    
    console.log(`  Org ID: ${current.orgId}`);
    console.log(`  Nonce: ${current.nonce}`);
    console.log(`  Public Key: ${current.publicKey}`);
    console.log(`  Bound At: ${current.issuedAt.toISOString()}`);
    console.log(`  Signature: ${current.signature.substring(0, 16)}...`);
    console.log(`  Usage Count: ${current.usageCount}`);
    
    if (current.revoked) {
      logger.info(chalk.red('\n⚠️  REVOKED'));
      console.log(`  Revoked At: ${current.revokedAt?.toISOString() || 'N/A'}`);
      console.log(`  Reason: ${current.revocationReason || 'No reason provided'}`);
    } else {
      logger.info(chalk.green('\n✓ Active'));
    }
    
    if (current.previousNonce) {
      logger.info(chalk.dim(`\nPrevious Nonce: ${current.previousNonce.substring(0, 16)}...`));
    }
    
    console.log('');
  } catch (error) {
    throw new CLIError(
      `Failed to show nonce binding: ${error instanceof Error ? error.message : String(error)}`,
      'NONCE_SHOW_ERROR'
    );
  }
}

export const nonceCommand = {
  validate,
  generate,
  rotate,
  revoke,
  list,
  history,
  show
};
