/**
 * AWS DynamoDB Block Counter Adapter (Circuit Breaker)
 */

import { DynamoDBClient, UpdateItemCommand, GetItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { BlockCounterAdapter } from '../types.js';
import { AWSConfig } from '../config.js';

/**
 * Convert current time to Unix timestamp (seconds since epoch)
 */
function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export class AWSBlockCounterAdapter implements BlockCounterAdapter {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(config: AWSConfig) {
    const clientConfig: any = { region: config.region };
    if (config.dynamodbEndpoint || config.endpoint) {
      clientConfig.endpoint = config.dynamodbEndpoint || config.endpoint;
    }
    
    this.client = new DynamoDBClient(clientConfig);
    this.tableName = config.blockCounterTableName || 'phase-mirror-block-counter';
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = getCurrentUnixTimestamp() + ttlSeconds;

    try {
      const result = await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ bucketKey: key }),
          UpdateExpression: 'ADD blockCount :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
          ExpressionAttributeValues: marshall({
            ':one': 1,
            ':ttl': expiresAt,
          }),
          ReturnValues: 'ALL_NEW',
        })
      );

      const item = result.Attributes ? unmarshall(result.Attributes) : { blockCount: 1 };
      return item.blockCount as number;
    } catch (error) {
      console.error('Failed to increment block counter:', error);
      throw error;
    }
  }

  async get(key: string): Promise<number> {
    try {
      const result = await this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ bucketKey: key }),
        })
      );

      if (!result.Item) return 0;

      const item = unmarshall(result.Item);
      
      // Check if expired
      if (item.expiresAt && item.expiresAt <= getCurrentUnixTimestamp()) {
        return 0;
      }
      
      return (item.blockCount as number) || 0;
    } catch (error) {
      console.error('Failed to get block counter:', error);
      return 0;
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteItemCommand({
          TableName: this.tableName,
          Key: marshall({ bucketKey: key }),
        })
      );
    } catch (error) {
      console.error('Failed to reset block counter:', error);
      throw error;
    }
  }
}
