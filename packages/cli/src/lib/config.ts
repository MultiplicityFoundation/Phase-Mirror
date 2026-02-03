/**
 * Configuration loader for Phase Mirror CLI
 */
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { CLIError } from './errors.js';
import type { Config } from '../types/cli.js';

export async function loadConfig(configPath: string = '.phase-mirror.yml'): Promise<Config> {
  try {
    const resolvedPath = path.resolve(configPath);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    const config = yaml.load(content) as Config;

    // Validate config
    validateConfig(config);

    return config;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new CLIError(
        `Configuration file not found: ${configPath}\nRun 'phase-mirror init' to create one.`,
        'CONFIG_NOT_FOUND'
      );
    }
    throw new CLIError(
      `Failed to load configuration: ${error.message}`,
      'CONFIG_LOAD_ERROR'
    );
  }
}

export function getDefaultConfig(): Config {
  return {
    version: '1',
    rules: {
      enabled: ['MD-001', 'MD-002', 'MD-003', 'MD-004', 'MD-005']
    },
    l0_invariants: {
      enabled: true,
      strict: false
    },
    drift: {
      enabled: true,
      threshold: 0.15
    }
  };
}

function validateConfig(config: Config): void {
  if (!config.version) {
    throw new CLIError('Configuration missing required field: version', 'CONFIG_INVALID');
  }

  if (config.version !== '1') {
    throw new CLIError(`Unsupported configuration version: ${config.version}`, 'CONFIG_VERSION_UNSUPPORTED');
  }

  // Validate rules if present
  if (config.rules?.enabled && !Array.isArray(config.rules.enabled)) {
    throw new CLIError('rules.enabled must be an array', 'CONFIG_INVALID');
  }

  // Validate l0_invariants if present
  if (config.l0_invariants !== undefined) {
    if (typeof config.l0_invariants.enabled !== 'boolean') {
      throw new CLIError('l0_invariants.enabled must be a boolean', 'CONFIG_INVALID');
    }
    if (config.l0_invariants.strict !== undefined && typeof config.l0_invariants.strict !== 'boolean') {
      throw new CLIError('l0_invariants.strict must be a boolean', 'CONFIG_INVALID');
    }
  }

  // Validate drift if present
  if (config.drift !== undefined) {
    if (typeof config.drift.enabled !== 'boolean') {
      throw new CLIError('drift.enabled must be a boolean', 'CONFIG_INVALID');
    }
    if (config.drift.threshold !== undefined) {
      if (typeof config.drift.threshold !== 'number' || config.drift.threshold < 0 || config.drift.threshold > 1) {
        throw new CLIError('drift.threshold must be a number between 0 and 1', 'CONFIG_INVALID');
      }
    }
  }
}

export async function validateConfigAsync(config: Config): Promise<boolean> {
  validateConfig(config);
  return true;
}
