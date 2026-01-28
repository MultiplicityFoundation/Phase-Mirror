/**
 * Brand-by-capability redactor
 * Redacts sensitive information based on capability markers
 */
import crypto from 'crypto';
import { NonceConfig } from '../../schemas/types';

export interface RedactionRule {
  capability: string;
  pattern: RegExp;
  replacement: string;
}

export class Redactor {
  private nonce: string;
  private rules: RedactionRule[] = [];

  constructor(nonce: string) {
    this.nonce = nonce;
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    this.rules = [
      // API keys and tokens
      {
        capability: 'api-key',
        pattern: /\b[A-Za-z0-9_-]{32,}\b/g,
        replacement: '[REDACTED-API-KEY]',
      },
      // Email addresses
      {
        capability: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[REDACTED-EMAIL]',
      },
      // AWS credentials
      {
        capability: 'aws-credential',
        pattern: /AKIA[0-9A-Z]{16}/g,
        replacement: '[REDACTED-AWS-KEY]',
      },
      // IP addresses
      {
        capability: 'ip-address',
        pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
        replacement: '[REDACTED-IP]',
      },
    ];
  }

  redact(text: string, capabilities: string[] = []): string {
    let redacted = text;
    
    // Apply rules based on capabilities
    const applicableRules = capabilities.length > 0
      ? this.rules.filter(rule => capabilities.includes(rule.capability))
      : this.rules;

    for (const rule of applicableRules) {
      redacted = redacted.replace(rule.pattern, rule.replacement);
    }

    return redacted;
  }

  hashSensitiveValue(value: string): string {
    // Use nonce for deterministic hashing
    return crypto
      .createHmac('sha256', this.nonce)
      .update(value)
      .digest('hex')
      .substring(0, 16);
  }

  addCustomRule(rule: RedactionRule): void {
    this.rules.push(rule);
  }
}

export function createRedactor(nonceConfig: NonceConfig): Redactor {
  return new Redactor(nonceConfig.value);
}
