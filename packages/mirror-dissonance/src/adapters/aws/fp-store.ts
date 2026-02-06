// Moved from src/fp-store/dynamodb-store.ts
// Changes: implements FPStoreAdapter, accepts pre-built DynamoDBClient
// instead of constructing its own.

import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { FPStoreAdapter } from "../types";
import type { FPEvent, FPWindow } from "../../fp-store/types";

export class AWSFPStore implements FPStoreAdapter {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string,
    private readonly ttlDays: number = 90
  ) {}

  async recordEvent(event: FPEvent): Promise<void> {
    const expiresAt = Math.floor(Date.now() / 1000) + this.ttlDays * 86400;
    const item = {
      pk: `rule#${event.ruleId}`,
      sk: `event#${event.timestamp.toISOString()}#${event.eventId}`,
      gsi1pk: `finding#${event.findingId}`,
      gsi1sk: `rule#${event.ruleId}#${event.ruleVersion}`,
      ...event,
      timestamp: event.timestamp.toISOString(),
      reviewedAt: event.reviewedAt?.toISOString(),
      expiresAt,
      recordedAt: Date.now(),
    };

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression: "attribute_not_exists(pk)",
        })
      );
    } catch (error: any) {
      throw new Error(`Failed to record FP event: ${error.message}`);
    }
  }

  async markFalsePositive(
    findingId: string,
    reviewedBy: string,
    ticket: string
  ): Promise<void> {
    // Query GSI to locate the event
    const queryResult = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "FindingIndex",
        KeyConditionExpression: "gsi1pk = :finding",
        ExpressionAttributeValues: marshall({
          ":finding": `finding#${findingId}`,
        }),
        Limit: 1,
      })
    );

    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error(`Finding ${findingId} not found in FP store`);
    }

    const item = unmarshall(queryResult.Items[0]);

    await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ pk: item.pk, sk: item.sk }),
        UpdateExpression:
          "SET isFalsePositive = :true, reviewedBy = :reviewer, " +
          "reviewedAt = :now, suppressionTicket = :ticket",
        ExpressionAttributeValues: marshall({
          ":true": true,
          ":reviewer": reviewedBy,
          ":now": new Date().toISOString(),
          ":ticket": ticket,
        }),
      })
    );
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :rule",
          ExpressionAttributeValues: marshall({
            ":rule": `rule#${ruleId}`,
          }),
          ScanIndexForward: false,
          Limit: count,
        })
      );

      if (!result.Items) {
        throw new Error(`No items returned for rule ${ruleId}`);
      }

      const events = result.Items.map((item) =>
        this.unmarshallEvent(unmarshall(item))
      );
      return this.computeWindow(ruleId, events);
    } catch (error: any) {
      throw new Error(`Failed to get window by count: ${error.message}`);
    }
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "pk = :rule AND sk >= :since",
          ExpressionAttributeValues: marshall({
            ":rule": `rule#${ruleId}`,
            ":since": `event#${since.toISOString()}`,
          }),
          ScanIndexForward: false,
        })
      );

      const events = (result.Items || []).map((item) =>
        this.unmarshallEvent(unmarshall(item))
      );
      return this.computeWindow(ruleId, events);
    } catch (error: any) {
      throw new Error(`Failed to get window by since: ${error.message}`);
    }
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "FindingIndex",
        KeyConditionExpression: "gsi1pk = :finding",
        ExpressionAttributeValues: marshall({
          ":finding": `finding#${findingId}`,
        }),
        Limit: 1,
      })
    );

    if (!result.Items || result.Items.length === 0) return false;
    const item = unmarshall(result.Items[0]);
    return item.isFalsePositive === true;
  }

  private unmarshallEvent(raw: Record<string, any>): FPEvent {
    return {
      eventId: raw.eventId,
      ruleId: raw.ruleId,
      ruleVersion: raw.ruleVersion,
      findingId: raw.findingId,
      outcome: raw.outcome,
      suppressionTicket: raw.suppressionTicket,
      reviewedBy: raw.reviewedBy,
      reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt) : undefined,
      isFalsePositive: raw.isFalsePositive,
      timestamp: new Date(raw.timestamp),
      context: raw.context,
    };
  }

  private computeWindow(ruleId: string, events: FPEvent[]): FPWindow {
    // Get most common version
    const versionCounts = new Map<string, number>();
    events.forEach((e) => {
      versionCounts.set(e.ruleVersion, (versionCounts.get(e.ruleVersion) || 0) + 1);
    });

    let ruleVersion = "";
    let maxCount = 0;
    versionCounts.forEach((count, version) => {
      if (count > maxCount) {
        maxCount = count;
        ruleVersion = version;
      }
    });

    const total = events.length;
    const falsePositives = events.filter((e) => e.isFalsePositive).length;
    const pending = events.filter(
      (e) => !e.reviewedAt && !e.isFalsePositive
    ).length;
    const truePositives = total - falsePositives - pending;
    const observedFPR =
      total - pending > 0 ? falsePositives / (total - pending) : 0;

    return {
      ruleId,
      ruleVersion,
      windowSize: total,
      events,
      statistics: {
        total,
        falsePositives,
        truePositives,
        pending,
        observedFPR,
      },
    };
  }
}
