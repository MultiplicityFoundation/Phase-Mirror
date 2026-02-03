/**
 * AWS SSM Parameter Store implementation of Secret Store
 * Consolidates nonce/loader.ts and redaction/redactor-v3.ts SSM functionality
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ISecretStore } from '../types.js';

export interface SecretStoreConfig {
  region?: string;
  client?: SSMClient;  // Allow injecting a custom client for backward compatibility
}

// Error message constants for consistent error handling
export const ERROR_MESSAGES = {
  PARAMETER_NO_VALUE: 'exists but has no value',
} as const;

export class SSMSecretStore implements ISecretStore {
  private client: SSMClient;
  private cache: Map<string, { value: string; loadedAt: number }> = new Map();
  private readonly CACHE_TTL_MS = 3600000; // 1 hour

  constructor(config?: SecretStoreConfig) {
    // Allow injecting a custom client or create a new one
    this.client = config?.client || new SSMClient({ region: config?.region || 'us-east-1' });
  }

  async getSecret(parameterName: string, withDecryption: boolean = true): Promise<string> {
    try {
      const command = new GetParameterCommand({
        Name: parameterName,
        WithDecryption: withDecryption,
      });

      const response = await this.client.send(command);
      
      if (!response.Parameter?.Value) {
        throw new Error(`Parameter '${parameterName}' ${ERROR_MESSAGES.PARAMETER_NO_VALUE}`);
      }

      // Cache the secret
      this.cache.set(parameterName, {
        value: response.Parameter.Value,
        loadedAt: Date.now(),
      });

      return response.Parameter.Value;
    } catch (error: unknown) {
      // Check if we have a valid cached value
      const cached = this.cache.get(parameterName);
      if (cached && this.isCacheValid(cached.loadedAt)) {
        console.warn(`SSM unreachable for ${parameterName}, using cached value (degraded mode)`);
        return cached.value;
      }

      // Enrich error with context
      let region = 'unknown';
      try {
        region = this.client.config.region ? String(this.client.config.region) : 'unknown';
      } catch {
        // Ignore error getting region
      }
      
      // Type guard for AWS SDK errors
      if (error && typeof error === 'object' && 'name' in error) {
        const awsError = error as { name: string; code?: string; message?: string };
        
        if (awsError.name === 'ParameterNotFound') {
          throw new Error(
            `Parameter not found: ${parameterName}. Ensure SSM parameter exists in region ${region}.`
          );
        }
        
        if (awsError.name === 'AccessDeniedException') {
          throw new Error(
            `Access denied to parameter: ${parameterName}. Check IAM permissions for ssm:GetParameter in region ${region}.`
          );
        }
        
        if (awsError.name === 'InvalidKeyId') {
          throw new Error(
            `Failed to decrypt parameter: ${parameterName}. Check KMS key permissions in region ${region}.`
          );
        }
        
        // Check for network/timeout errors
        if (awsError.code === 'ECONNREFUSED' || awsError.code === 'ETIMEDOUT' || awsError.code === 'ENOTFOUND') {
          const message = awsError.message || 'Network error';
          throw new Error(
            `Network error loading parameter ${parameterName} in region ${region}: ${message}`
          );
        }
      }
      
      // Generic fallback with context
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load parameter ${parameterName} in region ${region}: ${errorMessage}`
      );
    }
  }

  getCachedSecret(parameterName: string): string | null {
    const cached = this.cache.get(parameterName);
    if (!cached || !this.isCacheValid(cached.loadedAt)) {
      return null;
    }
    return cached.value;
  }

  private isCacheValid(loadedAt: number): boolean {
    return Date.now() - loadedAt < this.CACHE_TTL_MS;
  }

  /**
   * Clear cache (for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }
}
