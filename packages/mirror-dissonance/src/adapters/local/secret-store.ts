/**
 * Local In-Memory Secret Store Adapter
 */

import { SecretStoreAdapter } from '../types.js';

export class LocalSecretStoreAdapter implements SecretStoreAdapter {
  private secrets: Map<string, string> = new Map();
  private nonces: Map<string, string> = new Map();
  private salts: Map<string, string> = new Map();

  async getNonce(version: string = 'current'): Promise<string | null> {
    return this.nonces.get(version) || null;
  }

  async getSalt(orgId: string): Promise<string | null> {
    return this.salts.get(orgId) || null;
  }

  async putSecret(key: string, value: string, encrypted?: boolean): Promise<void> {
    this.secrets.set(key, value);
  }

  // Testing utilities
  setNonce(version: string, value: string): void {
    this.nonces.set(version, value);
  }

  setSalt(orgId: string, value: string): void {
    this.salts.set(orgId, value);
  }

  clear(): void {
    this.secrets.clear();
    this.nonces.clear();
    this.salts.clear();
  }
}
