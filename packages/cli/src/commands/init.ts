import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import { CLIError } from '../lib/errors.js';
import type { InitOptions } from '../types/cli.js';

const TEMPLATES = {
  minimal: {
    name: 'Minimal',
    description: 'Essential rules only (L0 invariants)',
    config: {
      version: '1',
      rules: {
        enabled: ['MD-001', 'MD-002', 'MD-003'],
        severity: {
          'MD-001': 'critical',
          'MD-002': 'high',
          'MD-003': 'high'
        }
      },
      l0_invariants: {
        enabled: true,
        strict: false
      },
      drift: {
        enabled: false
      }
    }
  },
  standard: {
    name: 'Standard',
    description: 'Recommended rules for most projects',
    config: {
      version: '1',
      rules: {
        enabled: ['MD-001', 'MD-002', 'MD-003', 'MD-004', 'MD-005'],
        severity: {
          'MD-001': 'critical',
          'MD-002': 'high',
          'MD-003': 'high',
          'MD-004': 'medium',
          'MD-005': 'medium'
        }
      },
      l0_invariants: {
        enabled: true,
        strict: false
      },
      drift: {
        enabled: true,
        threshold: 0.15
      },
      false_positives: {
        enabled: true,
        storage: 'local'
      }
    }
  },
  strict: {
    name: 'Strict',
    description: 'Maximum governance enforcement',
    config: {
      version: '1',
      rules: {
        enabled: ['MD-001', 'MD-002', 'MD-003', 'MD-004', 'MD-005'],
        severity: {
          'MD-001': 'critical',
          'MD-002': 'critical',
          'MD-003': 'critical',
          'MD-004': 'high',
          'MD-005': 'high'
        }
      },
      l0_invariants: {
        enabled: true,
        strict: true
      },
      drift: {
        enabled: true,
        threshold: 0.10
      },
      fail_on: 'high',
      circuit_breaker: {
        enabled: true,
        max_execution_time_ms: 100
      }
    }
  }
};

export async function initCommand(options: InitOptions): Promise<void> {
  logger.info(chalk.cyan.bold('\n🔮 Phase Mirror Initialization\n'));

  try {
    // Check if already initialized
    const configPath = '.phase-mirror.yml';
    const configExists = await fileExists(configPath);

    if (configExists && !options.force) {
      throw new CLIError(
        'Phase Mirror is already initialized. Use --force to overwrite.',
        'ALREADY_INITIALIZED'
      );
    }

    // Select template
    let template: keyof typeof TEMPLATES = options.template as any;

    if (!options.template || !TEMPLATES[template]) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'template',
          message: 'Select configuration template:',
          choices: Object.entries(TEMPLATES).map(([key, tmpl]) => ({
            name: `${tmpl.name} - ${tmpl.description}`,
            value: key
          }))
        }
      ]);
      template = answers.template;
    }

    const spinner = ora('Creating configuration...').start();

    // Get template
    const selectedTemplate = TEMPLATES[template];

    // Create .phase-mirror directory
    await fs.mkdir('.phase-mirror', { recursive: true });

    // Write config file
    const configContent = yaml.dump(selectedTemplate.config);
    await fs.writeFile(configPath, configContent, 'utf-8');

    spinner.text = 'Configuration created';

    // Create .gitignore entry
    await addToGitignore();

    spinner.succeed('Phase Mirror initialized');

    // Success message
    logger.success(chalk.green('\n✓ Phase Mirror is ready!\n'));
    logger.info('Configuration file: ' + chalk.cyan(configPath));
    logger.info('Template: ' + chalk.cyan(selectedTemplate.name));
    
    logger.info(chalk.dim('\nNext steps:'));
    logger.info(chalk.dim('  1. Review .phase-mirror.yml configuration'));
    logger.info(chalk.dim('  2. Run: phase-mirror analyze'));
    logger.info(chalk.dim('  3. Add to CI/CD with GitHub Action'));

  } catch (error) {
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function addToGitignore(): Promise<void> {
  const gitignorePath = '.gitignore';
  const entry = '\n# Phase Mirror\n.phase-mirror/fp-store.json\n.phase-mirror/baseline.json\n';

  try {
    let content = '';
    try {
      content = await fs.readFile(gitignorePath, 'utf-8');
    } catch {
      // .gitignore doesn't exist, will create
    }

    if (!content.includes('# Phase Mirror')) {
      // Ensure file ends with newline before appending
      if (content.length > 0 && !content.endsWith('\n')) {
        content += '\n';
        await fs.writeFile(gitignorePath, content, 'utf-8');
      }
      await fs.appendFile(gitignorePath, entry);
    }
  } catch (error) {
    // Non-fatal: warn user that .gitignore wasn't updated
    console.warn(`⚠️  Could not update .gitignore: ${error instanceof Error ? error.message : String(error)}`);
  }
}
