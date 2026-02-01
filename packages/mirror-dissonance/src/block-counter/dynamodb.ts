/**
 * DynamoDB Block Counter - Day 16 Afternoon
 * TTL-based counter for circuit breaker implementation
 */

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Convert current time to Unix timestamp (seconds since epoch)
 */
function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export interface BlockCounter {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

export class DynamoDBBlockCounter implements BlockCounter {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region: string, endpoint?: string) {
    const clientConfig: any = { region };
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }
    this.client = new DynamoDBClient(clientConfig);
    this.tableName = tableName;
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = getCurrentUnixTimestamp() + ttlSeconds;
    
    const result = await this.client.send(new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ bucketKey: key }),
      UpdateExpression: 'ADD blockCount :one SET expiresAt = if_not_exists(expiresAt, :ttl)',
      ExpressionAttributeValues: marshall({
        ':one': 1,
        ':ttl': expiresAt,
      }),
      ReturnValues: 'ALL_NEW',
    }));

    const item = result.Attributes ? unmarshall(result.Attributes) : { blockCount: 1 };
    return item.blockCount;
  }

  async get(key: string): Promise<number> {
    const result = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ bucketKey: key }),
    }));

    if (!result.Item) return 0;

    const item = unmarshall(result.Item);
    return item.blockCount || 0;
  }
}

/**
 * In-memory block counter for testing
 */
export class InMemoryBlockCounter implements BlockCounter {
  private counts: Map<string, { count: number; expiresAt: number }> = new Map();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = getCurrentUnixTimestamp() + ttlSeconds;
    const current = this.counts.get(key);
    
    if (current && current.expiresAt > getCurrentUnixTimestamp()) {
      current.count += 1;
      this.counts.set(key, current);
      return current.count;
    } else {
      this.counts.set(key, { count: 1, expiresAt });
      return 1;
    }
  }

  async get(key: string): Promise<number> {
    const current = this.counts.get(key);
    if (!current || current.expiresAt <= getCurrentUnixTimestamp()) {
      return 0;
    }
    return current.count;
  }
}
