// AWS Block Counter Adapter - wraps DynamoDB operations

import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { BlockCounterAdapter } from "../types";

export class AWSBlockCounter implements BlockCounterAdapter {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ttlSeconds;

    const result = await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `counter#${key}`,
          sk: "count",
        }),
        UpdateExpression:
          "SET #count = if_not_exists(#count, :zero) + :inc, " +
          "#expiresAt = :expires, #updatedAt = :now",
        ExpressionAttributeNames: {
          "#count": "count",
          "#expiresAt": "expiresAt",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: marshall({
          ":zero": 0,
          ":inc": 1,
          ":expires": expiresAt,
          ":now": now,
        }),
        ReturnValues: "ALL_NEW",
      })
    );

    if (!result.Attributes) {
      throw new Error(`Failed to increment counter for ${key}`);
    }

    const item = unmarshall(result.Attributes);
    return item.count;
  }

  async get(key: string): Promise<number> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `counter#${key}`,
          sk: "count",
        }),
      })
    );

    if (!result.Item) return 0;

    const item = unmarshall(result.Item);
    
    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (item.expiresAt && item.expiresAt < now) {
      return 0;
    }

    return item.count || 0;
  }
}
