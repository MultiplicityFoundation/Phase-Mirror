/**
 * Adapter interfaces for cloud provider abstraction
 * Consolidates AWS SDK usage behind stable interfaces
 */

import { FalsePositiveEvent, ConsentRecord, ConsentType, NonceConfig } from '../../schemas/types.js';

/**
 * False Positive Store Interface
 */
export interface IFPStore {
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;
  isFalsePositive(findingId: string): Promise<boolean>;
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}

/**
 * Consent Store Interface
 */
export interface IConsentStore {
  checkConsent(orgId: string): Promise<ConsentType>;
  recordConsent(record: ConsentRecord): Promise<void>;
  hasValidConsent(orgId: string): Promise<boolean>;
}

/**
 * Block Counter Interface
 */
export interface IBlockCounter {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

/**
 * Secret Store Interface (for nonces and other secrets)
 */
export interface ISecretStore {
  getSecret(parameterName: string, withDecryption?: boolean): Promise<string>;
  getCachedSecret(parameterName: string): string | null;
}

/**
 * Configuration for adapters
 */
export interface AdapterConfig {
  cloudProvider?: 'aws' | 'local';
  region?: string;
  endpoint?: string;
  
  // DynamoDB tables
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  
  // TTL settings
  blockCounterTtlHours?: number;
}

/**
 * Configuration for consent store (backward compatibility)
 */
export interface ConsentStoreConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
}

/**
 * Configuration for block counter (backward compatibility)
 */
export interface BlockCounterConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
}

/**
 * Bundle of all adapters
 */
export interface Adapters {
  fpStore: IFPStore;
  consentStore: IConsentStore;
  blockCounter: IBlockCounter;
  secretStore: ISecretStore;
}
