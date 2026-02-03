/**
 * AWS DynamoDB implementation of Block Counter
 * Consolidates counter.ts and dynamodb.ts implementations
 */
import { DynamoDBClient, DynamoDBClientConfig, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { IBlockCounter } from '../types.js';

export interface BlockCounterConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
}

/**
 * Convert current time to Unix timestamp (seconds since epoch)
 */
function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export class DynamoDBBlockCounter implements IBlockCounter {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(config: BlockCounterConfig) {
    const clientConfig: DynamoDBClientConfig = { region: config.region || 'us-east-1' };
    if (config.endpoint) {
      clientConfig.endpoint = config.endpoint;
    }
    this.client = new DynamoDBClient(clientConfig);
    this.tableName = config.tableName;
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
