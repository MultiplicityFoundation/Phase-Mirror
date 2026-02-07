/**
 * AWS SSM Secret Store Adapter
 *
 * Consolidates SSM Parameter Store nonce retrieval from
 * src/nonce/loader.ts and src/redaction/redactor-v3.ts into a
 * single SecretStoreAdapter implementation.
 *
 * Preserves existing SSM GetParameter call with WithDecryption=true
 * and fail-closed error handling — no behavior change.
 */

import { SSMClient, GetParameterCommand, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { SecretStoreAdapter, CloudConfig } from '../types.js';

export class AwsSecretStore implements SecretStoreAdapter {
  private ssm: SSMClient;
  private nonceParameterName: string;

  constructor(config: CloudConfig) {
    this.ssm = new SSMClient({ region: config.region || 'us-east-1' });
    this.nonceParameterName =
      config.nonceParameterName || 'guardian/redaction_nonce';
  }

  async getNonce(): Promise<string | null> {
    try {
      const result = await this.ssm.send(
        new GetParameterCommand({
          Name: this.nonceParameterName,
          WithDecryption: true,
        }),
      );
      return result.Parameter?.Value ?? null;
    } catch (error) {
      console.error('Failed to retrieve HMAC nonce:', error);
      return null; // Fail-closed: caller must handle
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
        return single ? [single] : [];
      }

      return result.Parameters
        .filter((p) => p.Value)
        .sort((a, b) => {
          // Sort by version number descending (newest first)
          const vA = a.Name?.match(/v(\d+)$/)?.[1] ?? '0';
          const vB = b.Name?.match(/v(\d+)$/)?.[1] ?? '0';
          return parseInt(vB, 10) - parseInt(vA, 10);
        })
        .map((p) => p.Value!);
    } catch (error) {
      console.error('Failed to retrieve nonce versions:', error);
      // Fall back to single nonce
      const single = await this.getNonce();
      return single ? [single] : [];
    }
  }
}
