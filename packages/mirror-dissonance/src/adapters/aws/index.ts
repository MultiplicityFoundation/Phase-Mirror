/**
 * AWS adapter bundle
 * Consolidates all AWS SDK implementations
 */

export { DynamoDBFPStore, FPStoreConfig } from './fp-store.js';
export { DynamoDBConsentStore, ConsentStoreConfig } from './consent-store.js';
export { DynamoDBBlockCounter, BlockCounterConfig } from './block-counter.js';
export { SSMSecretStore, SecretStoreConfig } from './secret-store.js';
