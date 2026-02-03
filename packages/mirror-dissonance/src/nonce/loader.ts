/**
 * Nonce loader and validator for redaction
 * Now uses secret store adapter for AWS abstraction
 */
import { SSMClient } from '@aws-sdk/client-ssm';
import { NonceConfig } from '../../schemas/types.js';
import { SSMSecretStore } from '../adapters/aws/secret-store.js';
import { ISecretStore } from '../adapters/types.js';

export class NonceLoader {
  private secretStore: ISecretStore;
  private cachedNonce: NonceConfig | null = null;

  constructor(region: string = 'us-east-1', secretStore?: ISecretStore) {
    this.secretStore = secretStore || new SSMSecretStore({ region });
  }

  async loadNonce(parameterName: string = 'guardian/redaction_nonce'): Promise<NonceConfig> {
    try {
      const value = await this.secretStore.getSecret(parameterName, true);
      
      this.cachedNonce = {
        value,
        loadedAt: new Date().toISOString(),
        source: parameterName,
      };

      return this.cachedNonce;
    } catch (error: unknown) {
      // Error is already enriched by the secret store
      throw error;
    }
  }

  validateNonce(nonce: string): boolean {
    // Validate nonce format (should be 64 character hex string for 32 bytes)
    const hexPattern = /^[a-f0-9]{64}$/i;
    return hexPattern.test(nonce);
  }

  getCachedNonce(): NonceConfig | null {
    return this.cachedNonce;
  }

  /**
   * Load nonce with a custom SSM client (backward compatibility)
   * @deprecated Use constructor with secretStore instead
   */
  async loadNonceWithClient(client: SSMClient, parameterName: string): Promise<NonceConfig> {
    // Create a temporary secret store with the provided client
    // This is for backward compatibility only
    const tempStore = new SSMSecretStore();
    (tempStore as any).client = client;
    this.secretStore = tempStore;
    return this.loadNonce(parameterName);
  }
}

export const nonceLoader = new NonceLoader();

/**
 * Helper function to load nonce from SSM
 * @param client SSM client instance
 * @param parameterName Parameter name in SSM
 * @returns NonceConfig object
 * @deprecated Use NonceLoader with secret store instead
 */
export async function loadNonce(client: SSMClient, parameterName: string): Promise<NonceConfig> {
  const loader = new NonceLoader();
  // Use a dedicated method to set the client
  return loader.loadNonceWithClient(client, parameterName);
}
