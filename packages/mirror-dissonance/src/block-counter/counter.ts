/**
 * Block counter with TTL-based hourly buckets
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { BlockCounterEntry } from '../../schemas/types';

export interface BlockCounterConfig {
  tableName: string;
  region?: string;
  ttlHours?: number;
}

export class BlockCounter {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private ttlHours: number;

  constructor(config: BlockCounterConfig) {
    const dynamoClient = new DynamoDBClient({ region: config.region || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
    this.ttlHours = config.ttlHours || 24;
  }

  private getBucketKey(): string {
    // Create hourly bucket key
    const now = new Date();
    const bucketHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );
    return bucketHour.toISOString();
  }

  async increment(ruleId: string): Promise<number> {
    const bucketKey = this.getBucketKey();
    const ttl = Math.floor(Date.now() / 1000) + this.ttlHours * 3600;

    try {
      const command = new UpdateCommand({
        TableName: this.tableName,
        Key: {
          bucketKey,
          ruleId,
        },
        UpdateExpression: 'ADD #count :inc SET #ttl = :ttl, #timestamp = :timestamp',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
          '#timestamp': 'timestamp',
        },
        ExpressionAttributeValues: {
          ':inc': 1,
          ':ttl': ttl,
          ':timestamp': Date.now(),
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

  async getCount(ruleId: string): Promise<number> {
    const bucketKey = this.getBucketKey();

    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: {
          bucketKey,
          ruleId,
        },
      });

      const response = await this.client.send(command);
      return response.Item?.count || 0;
    } catch (error) {
      console.error('Failed to get block count:', error);
      return 0;
    }
  }
}

export class MemoryBlockCounter {
  private counts: Map<string, { count: number; timestamp: number }> = new Map();
  private ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.ttlMs = ttlHours * 3600 * 1000;
  }

  private getBucketKey(): string {
    const now = new Date();
    const bucketHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );
    return bucketHour.toISOString();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.counts.entries()) {
      if (now - value.timestamp > this.ttlMs) {
        this.counts.delete(key);
      }
    }
  }

  async increment(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    const current = this.counts.get(key) || { count: 0, timestamp: Date.now() };
    current.count += 1;
    current.timestamp = Date.now();
    this.counts.set(key, current);
    return current.count;
  }

  async getCount(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    return this.counts.get(key)?.count || 0;
  }
}
