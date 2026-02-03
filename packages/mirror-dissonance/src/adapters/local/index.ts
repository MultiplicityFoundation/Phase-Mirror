/**
 * Local Adapter Factory
 */

import { CloudAdapters } from '../types.js';
import { LocalFPStoreAdapter } from './fp-store.js';
import { LocalSecretStoreAdapter } from './secret-store.js';
import { LocalBlockCounterAdapter } from './block-counter.js';
import { LocalObjectStoreAdapter } from './object-store.js';
import { LocalConsentStoreAdapter } from './consent-store.js';

export function createLocalAdapters(): CloudAdapters {
  return {
    fpStore: new LocalFPStoreAdapter(),
    secretStore: new LocalSecretStoreAdapter(),
    blockCounter: new LocalBlockCounterAdapter(),
    objectStore: new LocalObjectStoreAdapter(),
    consentStore: new LocalConsentStoreAdapter(),
  };
}

export * from './fp-store.js';
export * from './secret-store.js';
export * from './block-counter.js';
export * from './object-store.js';
export * from './consent-store.js';
