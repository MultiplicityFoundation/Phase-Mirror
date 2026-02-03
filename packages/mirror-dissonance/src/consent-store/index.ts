/**
 * Consent Store for Phase 2 FP Calibration Service
 * Manages organization consent for data collection per ADR-004
 * Re-exports from adapters
 */

// Re-export schema types
export * from './schema.js';
export * from './enhanced-store.js';
export * from './store.js';

// Re-export from adapters for backward compatibility
export { IConsentStore, ConsentStoreConfig } from '../adapters/types.js';
export { DynamoDBConsentStore } from '../adapters/aws/consent-store.js';
export { NoOpConsentStore } from '../adapters/local/index.js';

// Factory function for backward compatibility
import { IConsentStore, ConsentStoreConfig } from '../adapters/types.js';
import { DynamoDBConsentStore } from '../adapters/aws/consent-store.js';
import { NoOpConsentStore } from '../adapters/local/index.js';

export function createConsentStore(config?: ConsentStoreConfig): IConsentStore {
  if (config && config.tableName) {
    return new DynamoDBConsentStore(config);
  }
  return new NoOpConsentStore();
}
