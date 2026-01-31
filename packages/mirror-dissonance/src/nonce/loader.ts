/**
 * Nonce loader and validator for redaction
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { NonceConfig } from '../../schemas/types.js';

export class NonceLoader {
  private client: SSMClient;
  private cachedNonce: NonceConfig | null = null;

  constructor(region: string = 'us-east-1') {
    this.client = new SSMClient({ region });
  }

  async loadNonce(parameterName: string = 'guardian/redaction_nonce'): Promise<NonceConfig> {
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      });

      const response = await this.client.send(command);
      
      if (!response.Parameter?.Value) {
        throw new Error('Nonce parameter not found or empty');
      }

      this.cachedNonce = {
        value: response.Parameter.Value,
        loadedAt: new Date().toISOString(),
        source: parameterName,
      };

      return this.cachedNonce;
    } catch (error) {
      console.error('Failed to load nonce from SSM:', error);
      throw new Error(`Nonce loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
   * Load nonce with a custom SSM client
   */
  async loadNonceWithClient(client: SSMClient, parameterName: string): Promise<NonceConfig> {
    this.client = client;
    return this.loadNonce(parameterName);
  }
}

export const nonceLoader = new NonceLoader();

/**
 * Helper function to load nonce from SSM
 * @param client SSM client instance
 * @param parameterName Parameter name in SSM
 * @returns NonceConfig object
 */
export async function loadNonce(client: SSMClient, parameterName: string): Promise<NonceConfig> {
  const loader = new NonceLoader();
  // Use a dedicated method to set the client
  return loader.loadNonceWithClient(client, parameterName);
}
