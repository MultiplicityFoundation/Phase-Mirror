/**
 * AWS SSM Parameter Store Secret Store Adapter
 */

import { SSMClient, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { SecretStoreAdapter } from '../types.js';
import { AWSConfig } from '../config.js';

export class AWSSecretStoreAdapter implements SecretStoreAdapter {
  private client: SSMClient;
  private nonceParameterName: string;
  private saltParameterPrefix: string;

  constructor(config: AWSConfig) {
    const clientConfig: any = { region: config.region };
    if (config.ssmEndpoint || config.endpoint) {
      clientConfig.endpoint = config.ssmEndpoint || config.endpoint;
    }
    
    this.client = new SSMClient(clientConfig);
    this.nonceParameterName = config.nonceParameterName || '/phase-mirror/redaction-nonce';
    this.saltParameterPrefix = config.saltParameterPrefix || '/phase-mirror/salts/';
  }

  async getNonce(version: string = 'current'): Promise<string | null> {
    try {
      const parameterName =
        version === 'current'
          ? this.nonceParameterName
          : `${this.nonceParameterName}-${version}`;

      const result = await this.client.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        })
      );

      return result.Parameter?.Value || null;
    } catch (error: any) {
      // Fail closed - if nonce unavailable, anonymization should stop
      if (error.name === 'ParameterNotFound') {
        console.error(`Nonce parameter not found: ${version}`);
        return null;
      }
      
      console.error('Failed to retrieve HMAC nonce:', error);
      return null;
    }
  }

  async getSalt(orgId: string): Promise<string | null> {
    try {
      const parameterName = `${this.saltParameterPrefix}${orgId}`;

      const result = await this.client.send(
        new GetParameterCommand({
          Name: parameterName,
          WithDecryption: true,
        })
      );

      return result.Parameter?.Value || null;
    } catch (error: any) {
      // Fail closed
      if (error.name === 'ParameterNotFound') {
        console.error(`Salt parameter not found for org: ${orgId}`);
        return null;
      }
      
      console.error(`Failed to retrieve salt for org ${orgId}:`, error);
      return null;
    }
  }

  async putSecret(key: string, value: string, encrypted: boolean = true): Promise<void> {
    try {
      await this.client.send(
        new PutParameterCommand({
          Name: key,
          Value: value,
          Type: encrypted ? 'SecureString' : 'String',
          Overwrite: true,
        })
      );
    } catch (error) {
      console.error(`Failed to store secret ${key}:`, error);
      throw error;
    }
  }
}
