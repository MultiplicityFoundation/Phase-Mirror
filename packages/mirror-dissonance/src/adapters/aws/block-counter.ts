/**
 * AWS DynamoDB Block Counter Adapter
 *
 * Wraps DynamoDB UpdateItem (atomic ADD) and GetItem operations
 * behind the BlockCounterAdapter interface.
 *
 * Preserves existing DynamoDB schema with hourly bucket keys and
 * TTL-based expiration from src/block-counter/counter.ts and
 * src/block-counter/dynamodb.ts — no behavior change.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';
import { BlockCounterAdapter, CloudConfig } from '../types.js';

export class AwsBlockCounter implements BlockCounterAdapter {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private ttlHours: number;

  constructor(config: CloudConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || 'us-east-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName =
      config.blockCounterTableName || 'phase-mirror-block-counter';
    this.ttlHours = 24;
  }

  private getBucketKey(ruleId: string, orgId: string): string {
    const now = new Date();
    const hourKey = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0,
    ).toISOString();
    return `${ruleId}:${orgId}:${hourKey}`;
  }

  async increment(ruleId: string, orgId: string): Promise<number> {
    const bucketKey = this.getBucketKey(ruleId, orgId);
    const ttl = Math.floor(Date.now() / 1000) + this.ttlHours * 3600;

    try {
      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: { bucketKey },
        UpdateExpression:
          'ADD #count :inc SET #ttl = if_not_exists(#ttl, :ttl), #ts = :ts',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
          '#ts': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':ttl': ttl,
          ':ts': Date.now(),
        },
        ReturnValues: 'UPDATED_NEW',
      });

      const response = await this.client.send(command);
      return response.Attributes?.count || 1;
    } catch (error) {
      console.error('Failed to increment block counter:', error);
      throw error;
    }
  }

  async getCount(ruleId: string, orgId: string): Promise<number> {
    const bucketKey = this.getBucketKey(ruleId, orgId);

    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { bucketKey },
      });

      const response = await this.client.send(command);
      return response.Item?.count || 0;
    } catch (error) {
      console.error('Failed to get block count:', error);
      return 0;
    }
  }

  async isCircuitBroken(
    ruleId: string,
    orgId: string,
    threshold: number,
  ): Promise<boolean> {
    const count = await this.getCount(ruleId, orgId);
    return count >= threshold;
  }
}
