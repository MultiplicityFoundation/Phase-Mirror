/**
 * AWS Adapter Factory
 */

import { CloudAdapters } from '../types.js';
import { AWSConfig } from '../config.js';
import { AWSFPStoreAdapter } from './fp-store.js';
import { AWSSecretStoreAdapter } from './secret-store.js';
import { AWSBlockCounterAdapter } from './block-counter.js';
import { AWSObjectStoreAdapter } from './object-store.js';
import { AWSConsentStoreAdapter } from './consent-store.js';

export function createAWSAdapters(config: AWSConfig): CloudAdapters {
  return {
    fpStore: new AWSFPStoreAdapter(config),
    secretStore: new AWSSecretStoreAdapter(config),
    blockCounter: new AWSBlockCounterAdapter(config),
    objectStore: new AWSObjectStoreAdapter(config),
    consentStore: new AWSConsentStoreAdapter(config),
  };
}

export * from './fp-store.js';
export * from './secret-store.js';
export * from './block-counter.js';
export * from './object-store.js';
export * from './consent-store.js';
