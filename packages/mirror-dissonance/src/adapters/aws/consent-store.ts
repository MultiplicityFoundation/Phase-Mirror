/**
 * AWS DynamoDB Consent Store Adapter
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ConsentStoreAdapter } from '../types.js';
import { AWSConfig } from '../config.js';

interface ConsentRecord {
  orgId: string;
  repoId: string | null;
  feature: string;
  granted: boolean;
  timestamp: string;
}

export class AWSConsentStoreAdapter implements ConsentStoreAdapter {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: AWSConfig) {
    const clientConfig: any = { region: config.region };
    if (config.dynamodbEndpoint || config.endpoint) {
      clientConfig.endpoint = config.dynamodbEndpoint || config.endpoint;
    }
    
    const dynamoClient = new DynamoDBClient(clientConfig);
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.consentTableName || 'phase-mirror-consents';
  }

  private getKey(orgId: string, repoId: string | null, feature: string): string {
    return repoId ? `${orgId}#${repoId}#${feature}` : `${orgId}#${feature}`;
  }

  async hasConsent(orgId: string, repoId: string | null, feature: string): Promise<boolean> {
    try {
      const key = this.getKey(orgId, repoId, feature);

      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { id: key },
        })
      );

      if (!result.Item) {
        // Default: no consent
        return false;
      }

      const record = result.Item as ConsentRecord;
      return record.granted === true;
    } catch (error) {
      console.error('Failed to check consent:', error);
      // Fail closed - no consent if error
      return false;
    }
  }

  async recordConsent(
    orgId: string,
    repoId: string | null,
    feature: string,
    granted: boolean
  ): Promise<void> {
    try {
      const key = this.getKey(orgId, repoId, feature);

      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            id: key,
            orgId,
            repoId,
            feature,
            granted,
            timestamp: new Date().toISOString(),
          },
        })
      );
    } catch (error) {
      console.error('Failed to record consent:', error);
      throw error;
    }
  }
}
