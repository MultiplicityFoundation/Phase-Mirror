/**
 * Local/NoOp adapter implementations for testing
 */

import type { FalsePositiveEvent, ConsentRecord, ConsentType } from '../../../schemas/types.js';
import { IFPStore, IConsentStore, IBlockCounter, ISecretStore } from '../types.js';

/**
 * NoOp False Positive Store
 */
export class NoOpFPStore implements IFPStore {
  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    console.log('NoOp: Would record false positive:', event.id);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    return false;
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    return [];
  }
}

/**
 * NoOp Consent Store
 */
export class NoOpConsentStore implements IConsentStore {
  async checkConsent(orgId: string): Promise<ConsentType> {
    return 'implicit';
  }

  async recordConsent(record: ConsentRecord): Promise<void> {
    console.log('NoOp: Would record consent for org:', record.orgId);
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    return true;
  }
}

/**
 * In-memory Block Counter for testing
 */
export class InMemoryBlockCounter implements IBlockCounter {
  private counts: Map<string, { count: number; expiresAt: number }> = new Map();

  private getCurrentUnixTimestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = this.getCurrentUnixTimestamp() + ttlSeconds;
    const current = this.counts.get(key);
    
    if (current && current.expiresAt > this.getCurrentUnixTimestamp()) {
      current.count += 1;
      this.counts.set(key, current);
      return current.count;
    } else {
      this.counts.set(key, { count: 1, expiresAt });
      return 1;
    }
  }

  async get(key: string): Promise<number> {
    const current = this.counts.get(key);
    if (!current || current.expiresAt <= this.getCurrentUnixTimestamp()) {
      return 0;
    }
    return current.count;
  }
}

/**
 * In-memory Secret Store for testing
 */
export class InMemorySecretStore implements ISecretStore {
  private secrets: Map<string, string> = new Map();

  async getSecret(parameterName: string, withDecryption?: boolean): Promise<string> {
    const value = this.secrets.get(parameterName);
    if (!value) {
      throw new Error(`Parameter not found: ${parameterName}`);
    }
    return value;
  }

  getCachedSecret(parameterName: string): string | null {
    return this.secrets.get(parameterName) || null;
  }

  /**
   * Set a secret for testing
   */
  setSecret(parameterName: string, value: string): void {
    this.secrets.set(parameterName, value);
  }

  /**
   * Clear all secrets
   */
  clearSecrets(): void {
    this.secrets.clear();
  }
}

/**
 * Alternative memory block counter matching the existing MemoryBlockCounter interface
 */
export class MemoryBlockCounter {
  private counts: Map<string, { count: number; timestamp: number }> = new Map();
  private ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.ttlMs = ttlHours * 3600 * 1000;
  }

  private getBucketKey(): string {
    const now = new Date();
    const bucketHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );
    return bucketHour.toISOString();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.counts.entries()) {
      if (now - value.timestamp > this.ttlMs) {
        this.counts.delete(key);
      }
    }
  }

  async increment(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    const current = this.counts.get(key) || { count: 0, timestamp: Date.now() };
    current.count += 1;
    current.timestamp = Date.now();
    this.counts.set(key, current);
    return current.count;
  }

  async getCount(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    return this.counts.get(key)?.count || 0;
  }
}
