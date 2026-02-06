/**
 * False Positive Store with DynamoDB and NoOp implementations
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { FalsePositiveEvent } from '../../schemas/types.js';

export interface FPStoreConfig {
  tableName: string;
  region?: string;
}

export interface IFPStore {
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;
  isFalsePositive(findingId: string): Promise<boolean>;
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}

export class DynamoDBFPStore implements IFPStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: FPStoreConfig) {
    const dynamoClient = new DynamoDBClient({ region: config.region || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
  }

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.tableName,
        Item: {
          id: event.id,
          findingId: event.findingId,
          ruleId: event.ruleId,
          timestamp: event.timestamp,
          resolvedBy: event.resolvedBy,
          context: event.context,
          orgIdHash: event.orgIdHash,
          consent: event.consent,
        },
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Failed to record false positive:', error);
      throw error;
    }
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'finding-index',
        KeyConditionExpression: 'findingId = :findingId',
        ExpressionAttributeValues: {
          ':findingId': findingId,
        },
        Limit: 1,
      });

      const response = await this.client.send(command);
      return (response.Items?.length || 0) > 0;
    } catch (error) {
      console.error('Failed to check false positive:', error);
      // ❌ BEFORE: return false (silent failure)
      // ✅ AFTER: throw to prevent false negatives on calibration data
      throw new Error(`Failed to check false positive for finding ${findingId}: ${error}`);
    }
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'rule-index',
        KeyConditionExpression: 'ruleId = :ruleId',
        ExpressionAttributeValues: {
          ':ruleId': ruleId,
        },
      });

      const response = await this.client.send(command);
      return (response.Items || []) as FalsePositiveEvent[];
    } catch (error) {
      console.error('Failed to get false positives by rule:', error);
      // ❌ BEFORE: return [] (silent failure)
      // ✅ AFTER: throw to prevent false 0.0 FPR computation
      throw new Error(`Failed to get false positives for rule ${ruleId}: ${error}`);
    }
  }
}

export class NoOpFPStore implements IFPStore {
  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    console.log('NoOp: Would record false positive:', event.id);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    return false;
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    return [];
  }
}

export function createFPStore(config?: FPStoreConfig): IFPStore {
  if (config && config.tableName) {
    return new DynamoDBFPStore(config);
  }
  return new NoOpFPStore();
}
