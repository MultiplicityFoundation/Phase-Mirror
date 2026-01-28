/**
 * Consent Store for Phase 2 FP Calibration Service
 * Manages organization consent for data collection per ADR-004
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ConsentRecord, ConsentType } from '../../schemas/types.js';

export interface ConsentStoreConfig {
  tableName: string;
  region?: string;
}

export interface IConsentStore {
  checkConsent(orgId: string): Promise<ConsentType>;
  recordConsent(record: ConsentRecord): Promise<void>;
  hasValidConsent(orgId: string): Promise<boolean>;
}

export class DynamoDBConsentStore implements IConsentStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: ConsentStoreConfig) {
    const dynamoClient = new DynamoDBClient({ region: config.region || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
  }

  async checkConsent(orgId: string): Promise<ConsentType> {
    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { orgId },
      });

      const response = await this.client.send(command);
      
      if (!response.Item) {
        return 'none';
      }

      const record = response.Item as ConsentRecord;
      
      if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
        return 'none';
      }

      return record.consentType;
    } catch (error) {
      console.error('Failed to check consent:', error);
      return 'none';
    }
  }

  async recordConsent(record: ConsentRecord): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.tableName,
        Item: {
          orgId: record.orgId,
          consentType: record.consentType,
          grantedAt: record.grantedAt,
          expiresAt: record.expiresAt,
          scope: record.scope,
        },
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Failed to record consent:', error);
      throw error;
    }
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    const consentType = await this.checkConsent(orgId);
    return consentType === 'explicit' || consentType === 'implicit';
  }
}

export class NoOpConsentStore implements IConsentStore {
  async checkConsent(orgId: string): Promise<ConsentType> {
    return 'implicit';
  }

  async recordConsent(record: ConsentRecord): Promise<void> {
    console.log('NoOp: Would record consent for org:', record.orgId);
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    return true;
  }
}

export function createConsentStore(config?: ConsentStoreConfig): IConsentStore {
  if (config && config.tableName) {
    return new DynamoDBConsentStore(config);
  }
  return new NoOpConsentStore();
}
