/**
 * Local In-Memory Consent Store Adapter
 */

import { ConsentStoreAdapter } from '../types.js';

interface ConsentRecord {
  orgId: string;
  repoId: string | null;
  feature: string;
  granted: boolean;
  timestamp: string;
}

export class LocalConsentStoreAdapter implements ConsentStoreAdapter {
  private consents: Map<string, ConsentRecord> = new Map();

  private getKey(orgId: string, repoId: string | null, feature: string): string {
    return repoId ? `${orgId}#${repoId}#${feature}` : `${orgId}#${feature}`;
  }

  async hasConsent(orgId: string, repoId: string | null, feature: string): Promise<boolean> {
    const key = this.getKey(orgId, repoId, feature);
    const record = this.consents.get(key);
    return record?.granted === true;
  }

  async recordConsent(
    orgId: string,
    repoId: string | null,
    feature: string,
    granted: boolean
  ): Promise<void> {
    const key = this.getKey(orgId, repoId, feature);
    this.consents.set(key, {
      orgId,
      repoId,
      feature,
      granted,
      timestamp: new Date().toISOString(),
    });
  }

  // Testing utility
  clear(): void {
    this.consents.clear();
  }
}
