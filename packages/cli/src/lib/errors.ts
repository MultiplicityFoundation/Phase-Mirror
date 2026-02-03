/**
 * Error handling for Phase Mirror CLI
 */

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

export function handleFatalError(error: unknown): never {
  if (error instanceof CLIError) {
    console.error(`Error [${error.code}]: ${error.message}`);
    process.exit(error.exitCode);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  } else {
    console.error(`Unknown error: ${String(error)}`);
    process.exit(1);
  }
}
