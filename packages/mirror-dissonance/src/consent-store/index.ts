/**
 * Consent Store for Phase 2 FP Calibration Service
 * Manages organization consent for data collection per ADR-004
 *
 * @deprecated The DynamoDBConsentStore class that lived here has moved to
 *   `src/adapters/aws/consent-store.ts`.  Use the adapter factory instead.
 *
 * Cloud-agnostic exports (IConsentStore, NoOpConsentStore) remain here.
 */
import { ConsentRecord, ConsentType } from '../../schemas/types.js';

// Re-export schema types
export * from './schema.js';
export * from './enhanced-store.js';
export * from './store.js';

export interface ConsentStoreConfig {
  tableName: string;
  region?: string;
  endpoint?: string;  // For LocalStack testing
}

export interface IConsentStore {
  checkConsent(orgId: string): Promise<ConsentType>;
  recordConsent(record: ConsentRecord): Promise<void>;
  hasValidConsent(orgId: string): Promise<boolean>;
}

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
 * @deprecated Use the adapter factory (`createAdapters`) for cloud-backed stores.
 * This function now only returns a NoOpConsentStore.
 */
export function createConsentStore(config?: ConsentStoreConfig): IConsentStore {
  return new NoOpConsentStore();
}
