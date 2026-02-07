/**
 * Nonce loader and validator for redaction
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { NonceConfig } from '../schemas/types.js';

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
        throw new Error(`Nonce parameter '${parameterName}' exists but has no value`);
      }

      this.cachedNonce = {
        value: response.Parameter.Value,
        loadedAt: new Date().toISOString(),
        source: parameterName,
      };

      return this.cachedNonce;
    } catch (error: unknown) {
      // Enrich error with context
      const region = this.client.config.region || 'unknown';
      
      // Type guard for AWS SDK errors
      if (error && typeof error === 'object' && 'name' in error) {
        const awsError = error as { name: string; code?: string; message?: string };
        
        if (awsError.name === 'ParameterNotFound') {
          throw new Error(
            `Nonce parameter not found: ${parameterName}. Ensure SSM parameter exists in region ${region}.`
          );
        }
        
        if (awsError.name === 'AccessDeniedException') {
          throw new Error(
            `Access denied to nonce parameter: ${parameterName}. Check IAM permissions for ssm:GetParameter in region ${region}.`
          );
        }
        
        if (awsError.name === 'InvalidKeyId') {
          throw new Error(
            `Failed to decrypt nonce parameter: ${parameterName}. Check KMS key permissions in region ${region}.`
          );
        }
        
        // Check for network/timeout errors
        if (awsError.code === 'ECONNREFUSED' || awsError.code === 'ETIMEDOUT' || awsError.code === 'ENOTFOUND') {
          const message = awsError.message || 'Network error';
          throw new Error(
            `Network error loading nonce from ${parameterName} in region ${region}: ${message}`
          );
        }
      }
      
      // Generic fallback with context
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load nonce from ${parameterName} in region ${region}: ${errorMessage}`
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
