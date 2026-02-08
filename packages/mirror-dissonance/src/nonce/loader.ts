/**
 * Nonce loader and validator for redaction
 *
 * @deprecated Direct SSM coupling has been removed. The NonceLoader now
 *   accepts a SecretFetcher function for cloud-agnostic secret retrieval.
 *   Use the adapter factory's SecretStoreAdapter to create a fetcher:
 *
 *     const adapters = await createAdapters(config);
 *     const nonce = await adapters.secretStore.getSecret('guardian/redaction_nonce');
 */
import { NonceConfig } from '../schemas/types.js';

/** Cloud-agnostic secret fetcher. Replaces direct SSM coupling. */
export type SecretFetcher = (parameterName: string) => Promise<string>;

export class NonceLoader {
  private fetcher: SecretFetcher;
  private cachedNonce: NonceConfig | null = null;

  constructor(fetcher?: SecretFetcher) {
    this.fetcher = fetcher ?? (() => Promise.reject(new Error(
      'No SecretFetcher provided. Supply one via constructor or use the adapter factory.'
    )));
  }

  async loadNonce(parameterName: string = 'guardian/redaction_nonce'): Promise<NonceConfig> {
    try {
      const value = await this.fetcher(parameterName);

      if (!value) {
        throw new Error(`Nonce parameter '${parameterName}' exists but has no value`);
      }

      this.cachedNonce = {
        value,
        loadedAt: new Date().toISOString(),
        source: parameterName,
      };

      return this.cachedNonce;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load nonce from ${parameterName}: ${errorMessage}`
      );
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
}

export const nonceLoader = new NonceLoader();

/**
 * Helper function to load nonce using a SecretFetcher
 * @param fetcher Cloud-agnostic secret fetcher function
 * @param parameterName Parameter name
 * @returns NonceConfig object
 */
export async function loadNonce(fetcher: SecretFetcher, parameterName: string): Promise<NonceConfig> {
  const loader = new NonceLoader(fetcher);
  return loader.loadNonce(parameterName);
}
