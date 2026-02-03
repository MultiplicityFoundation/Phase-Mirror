/**
 * Configuration loader for Phase Mirror CLI
 */
import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import type { Config } from '../types/cli.js';
import { CLIError } from './errors.js';

const DEFAULT_CONFIG_PATHS = [
  '.phase-mirror.yml',
  '.phase-mirror.yaml',
  'phase-mirror.yml',
  'phase-mirror.yaml'
];

export async function loadConfig(configPath?: string): Promise<Config> {
  // Try provided path first
  if (configPath) {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return yaml.parse(content) as Config;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isNotFound = error instanceof Error && 'code' in error && (error as any).code === 'ENOENT';
      throw new CLIError(
        isNotFound 
          ? `Configuration file not found: ${configPath}`
          : `Failed to load config from ${configPath}: ${errMsg}`,
        'CONFIG_LOAD_ERROR'
      );
    }
  }

  // Try default paths
  for (const path of DEFAULT_CONFIG_PATHS) {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return yaml.parse(content) as Config;
    } catch {
      // Continue to next path
    }
  }

  // Return default config if none found
  return getDefaultConfig();
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

export async function validateConfig(config: Config): Promise<boolean> {
  // Basic validation
  if (!config.version) {
    throw new CLIError('Config must have a version field', 'CONFIG_INVALID');
  }

  if (config.rules?.enabled && !Array.isArray(config.rules.enabled)) {
    throw new CLIError('rules.enabled must be an array', 'CONFIG_INVALID');
  }

  return true;
}
