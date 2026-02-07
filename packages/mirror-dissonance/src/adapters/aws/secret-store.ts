/**
 * AWS SSM Secret Store Adapter
 *
 * Consolidates SSM Parameter Store nonce retrieval from
 * src/nonce/loader.ts and src/redaction/redactor-v3.ts into a
 * single SecretStoreAdapter implementation.
 *
 * Phase 0: Throws SecretStoreError on failure instead of returning null.
 * Callers at L0 (business logic) implement fail-closed behavior.
 */

import { SSMClient, GetParameterCommand, GetParametersByPathCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import type { NonceConfig } from '../../../schemas/types.js';
import { SecretStoreAdapter, CloudConfig } from '../types.js';
import { SecretStoreError } from '../errors.js';

export class AwsSecretStore implements SecretStoreAdapter {
  private ssm: SSMClient;
  private nonceParameterName: string;

  constructor(config: CloudConfig) {
    this.ssm = new SSMClient({ region: config.region || 'us-east-1' });
    this.nonceParameterName =
      config.nonceParameterName || 'guardian/redaction_nonce';
  }

  async getNonce(): Promise<NonceConfig> {
    try {
      const result = await this.ssm.send(
        new GetParameterCommand({
          Name: this.nonceParameterName,
          WithDecryption: true,
        }),
      );

      const value = result.Parameter?.Value;
      if (!value) {
        throw new SecretStoreError(
          'SSM parameter exists but has no value',
          'MALFORMED_SECRET',
          { source: 'aws-ssm', parameterName: this.nonceParameterName },
        );
      }

      return {
        value,
        loadedAt: new Date().toISOString(),
        source: 'aws-ssm',
      };
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to retrieve HMAC nonce from SSM',
        'READ_FAILED',
        { source: 'aws-ssm', parameterName: this.nonceParameterName, originalError: error },
      );
    }
  }

  async getNonces(): Promise<string[]> {
    try {
      // Attempt to load all versioned nonce parameters under the base path.
      // Convention: nonce versions stored as <basePath>_v1, <basePath>_v2, etc.
      const basePath = this.nonceParameterName.replace(/\/[^/]+$/, '/');
      const result = await this.ssm.send(
        new GetParametersByPathCommand({
          Path: basePath,
          WithDecryption: true,
          Recursive: false,
        }),
      );

      if (!result.Parameters || result.Parameters.length === 0) {
        // Fall back to single nonce
        const single = await this.getNonce();
        return [single.value];
      }

      const nonces = result.Parameters
        .filter((p) => p.Value)
        .sort((a, b) => {
          // Sort by version number descending (newest first)
          const vA = a.Name?.match(/v(\d+)$/)?.[1] ?? '0';
          const vB = b.Name?.match(/v(\d+)$/)?.[1] ?? '0';
          return parseInt(vB, 10) - parseInt(vA, 10);
        })
        .map((p) => p.Value!);

      if (nonces.length === 0) {
        throw new SecretStoreError(
          'SSM parameters found but all values are empty',
          'MALFORMED_SECRET',
          { source: 'aws-ssm', basePath },
        );
      }

      return nonces;
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to retrieve nonce versions from SSM',
        'VERSIONS_FAILED',
        { source: 'aws-ssm', parameterName: this.nonceParameterName, originalError: error },
      );
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    try {
      await this.ssm.send(
        new PutParameterCommand({
          Name: this.nonceParameterName,
          Value: newValue,
          Type: 'SecureString',
          Overwrite: true,
        }),
      );
    } catch (error) {
      throw new SecretStoreError(
        'Failed to rotate nonce in SSM',
        'ROTATION_FAILED',
        { source: 'aws-ssm', parameterName: this.nonceParameterName, originalError: error },
      );
    }
  }
}
