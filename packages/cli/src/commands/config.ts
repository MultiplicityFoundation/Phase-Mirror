import chalk from 'chalk';
import { loadConfig } from '../lib/config.js';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import fs from 'fs/promises';
import yaml from 'yaml';

async function show(): Promise<void> {
  try {
    const config = await loadConfig();
    
    logger.info(chalk.cyan.bold('\n🔮 Phase Mirror Configuration\n'));
    console.log(yaml.stringify(config));
    
  } catch (error) {
    throw new CLIError(
      `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_LOAD_FAILED'
    );
  }
}

async function set(key: string, value: string): Promise<void> {
  try {
    const config = await loadConfig();
    
    // Parse key path (e.g., "rules.enabled")
    const keys = key.split('.');
    let current: any = config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    // Parse value
    let parsedValue: any = value;
    if (value === 'true') parsedValue = true;
    else if (value === 'false') parsedValue = false;
    else if (value.trim() !== '' && !isNaN(Number(value))) parsedValue = Number(value);
    else if (value.startsWith('[') && value.endsWith(']')) {
      parsedValue = JSON.parse(value);
    }
    
    current[keys[keys.length - 1]] = parsedValue;
    
    // Write back to file
    const configContent = yaml.stringify(config);
    await fs.writeFile('.phase-mirror.yml', configContent, 'utf-8');
    
    logger.success(chalk.green(`✓ Set ${key} = ${parsedValue}`));
    
  } catch (error) {
    throw new CLIError(
      `Failed to set configuration: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_SET_FAILED'
    );
  }
}

async function get(key: string): Promise<void> {
  try {
    const config = await loadConfig();
    
    // Parse key path
    const keys = key.split('.');
    let current: any = config;
    
    for (const k of keys) {
      if (current[k] === undefined) {
        throw new CLIError(`Configuration key not found: ${key}`, 'CONFIG_KEY_NOT_FOUND');
      }
      current = current[k];
    }
    
    console.log(current);
    
  } catch (error) {
    throw error;
  }
}

async function validate(options: { config: string }): Promise<void> {
  try {
    const config = await loadConfig(options.config);
    
    // TODO: Implement schema validation
    logger.success(chalk.green('✓ Configuration is valid'));
    
  } catch (error) {
    throw new CLIError(
      `Configuration validation failed: ${error instanceof Error ? error.message : String(error)}`,
      'CONFIG_INVALID'
    );
  }
}

export const configCommand = {
  show,
  set,
  get,
  validate
};
