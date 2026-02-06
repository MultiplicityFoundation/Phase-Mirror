// AWS Block Counter Adapter
// Implements BlockCounterAdapter using DynamoDB with TTL

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
    const ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

    const result = await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ key }),
        UpdateExpression:
          "SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl",
        ExpressionAttributeNames: {
          "#count": "count",
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: marshall({
          ":zero": 0,
          ":inc": 1,
          ":ttl": ttl,
        }),
        ReturnValues: "ALL_NEW",
      })
    );

    if (!result.Attributes) {
      throw new Error("Failed to increment block counter");
    }

    const item = unmarshall(result.Attributes);
    return item.count || 0;
  }

  async get(key: string): Promise<number> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ key }),
      })
    );

    if (!result.Item) return 0;

    const item = unmarshall(result.Item);

    // Check if TTL expired
    if (item.ttl && item.ttl < Math.floor(Date.now() / 1000)) {
      return 0;
    }

    return item.count || 0;
  }
}
