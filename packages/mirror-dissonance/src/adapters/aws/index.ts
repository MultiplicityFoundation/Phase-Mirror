/**
 * AWS Cloud Adapters — barrel export
 *
 * Each adapter lives in its own file to keep the individual modules
 * focused. This barrel wires them together via createAWSAdapters().
 */

import { CloudAdapters, CloudConfig } from '../types.js';
import { AwsFPStore } from './fp-store.js';
import { AwsConsentStore } from './consent-store.js';
import { AwsBlockCounter } from './block-counter.js';
import { AwsSecretStore } from './secret-store.js';
import { AwsObjectStore } from './object-store.js';

export function createAWSAdapters(config: CloudConfig): CloudAdapters {
  return {
    fpStore: new AwsFPStore(config),
    consentStore: new AwsConsentStore(config),
    blockCounter: new AwsBlockCounter(config),
    secretStore: new AwsSecretStore(config),
    objectStore: new AwsObjectStore(config),
  };
}

export { AwsFPStore } from './fp-store.js';
export { AwsConsentStore } from './consent-store.js';
export { AwsBlockCounter } from './block-counter.js';
export { AwsSecretStore } from './secret-store.js';
export { AwsObjectStore } from './object-store.js';
