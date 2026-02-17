/**
 * Error handling for Phase Mirror CLI
 *
 * Exit code semantics (ADR-030):
 *   0 = pass
 *   1 = block (L0 violation or unrecoverable)
 *   2 = degraded (infrastructure unavailable, free tier proceeds)
 */

import chalk from 'chalk';
import {
  OracleDegradedError,
  L0InvariantViolation,
} from '@mirror-dissonance/core';

export class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public exitCode: number = 1
  ) {
    super(message);
    this.name = 'CLIError';
  }
}

/**
 * Maps domain errors to structured CLI output and exit codes.
 * Called from every command's catch block.
 */
export function handleFatalError(error: unknown): never {
  if (error instanceof L0InvariantViolation) {
    // L0 violations always hard-fail, all tiers (ADR-030)
    console.error(chalk.red(`❌ L0 VIOLATION: ${error.invariantId}`));
    console.error(chalk.red(JSON.stringify(error.evidence, null, 2)));
    process.exit(1);
  }

  if (error instanceof OracleDegradedError) {
    if (error.canProceed) {
      // Free tier: warn but allow
      console.error(chalk.yellow(`⚠️  DEGRADED: ${error.reason}`));
      console.error(
        chalk.yellow('Analysis may be incomplete. Retry when infrastructure available.')
      );
      console.error(chalk.dim(JSON.stringify(error.evidence, null, 2)));
      process.exit(2); // Exit 2 = degraded (non-zero but distinguishable)
    } else {
      // Paid tier: hard fail + escalate
      console.error(chalk.red(`❌ BLOCKED: ${error.reason}`));
      console.error(chalk.red('Escalating to ops team...'));
      console.error(chalk.dim(JSON.stringify(error.evidence, null, 2)));
      // TODO: Send alert to ops (Slack/PagerDuty webhook)
      process.exit(1);
    }
  }

  if (error instanceof CLIError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(chalk.red(`❌ FATAL: ${error.message}`));
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }

  console.error(chalk.red(`❌ Unknown error: ${String(error)}`));
  process.exit(1);
}
