/**
 * Logger utility for Phase Mirror CLI
 */

type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'verbose' | 'debug';

const LOG_LEVELS: LogLevel[] = ['silent', 'error', 'warn', 'info', 'verbose', 'debug'];

class Logger {
  private level: LogLevel = 'info';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(messageLevel: LogLevel): boolean {
    const currentIndex = LOG_LEVELS.indexOf(this.level);
    const messageIndex = LOG_LEVELS.indexOf(messageLevel);
    return messageIndex <= currentIndex;
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(message, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(message, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(message, ...args);
    }
  }

  success(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(message, ...args);
    }
  }

  verbose(message: string, ...args: any[]): void {
    if (this.shouldLog('verbose')) {
      console.log(message, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(message, ...args);
    }
  }
}

export const logger = new Logger();
