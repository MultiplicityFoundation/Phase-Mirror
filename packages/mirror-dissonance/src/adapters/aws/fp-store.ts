/**
 * AWS DynamoDB FP Store Adapter
 *
 * Wraps DynamoDB PutItem, Query, and UpdateItem operations
 * behind the FPStoreAdapter interface.
 *
 * Preserves existing DynamoDB key schema and error handling from
 * src/fp-store/dynamodb-store.ts — no behavior change.
 */

import {
  DynamoDBClient,
  PutItemCommand,
  UpdateItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { FPStoreAdapter, FPEvent, FPWindow, CloudConfig } from '../types.js';

export class FPStoreError extends Error {
  public readonly ruleId?: string;
  public readonly eventId?: string;
  public readonly findingId?: string;
  public readonly operation: string;
  public readonly cause: unknown;

  constructor(opts: {
    message: string;
    operation: string;
    ruleId?: string;
    eventId?: string;
    findingId?: string;
    cause?: unknown;
  }) {
    super(opts.message);
    this.name = 'FPStoreError';
    this.operation = opts.operation;
    this.ruleId = opts.ruleId;
    this.eventId = opts.eventId;
    this.findingId = opts.findingId;
    this.cause = opts.cause;
  }
}

export class AwsFPStore implements FPStoreAdapter {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlDays: number;

  constructor(config: CloudConfig) {
    this.client = new DynamoDBClient({ region: config.region || 'us-east-1' });
    this.tableName = config.fpTableName || 'phase-mirror-fp-events';
    this.ttlDays = 90;
  }

  async recordEvent(event: FPEvent): Promise<void> {
    const now = Date.now();
    const expiresAt = Math.floor(now / 1000) + this.ttlDays * 86400;

    const item = {
      pk: `rule#${event.ruleId}`,
      sk: `event#${event.timestamp.toISOString()}#${event.eventId}`,
      gsi1pk: `finding#${event.findingId}`,
      gsi1sk: `rule#${event.ruleId}#${event.ruleVersion}`,
      eventId: event.eventId,
      ruleId: event.ruleId,
      ruleVersion: event.ruleVersion,
      findingId: event.findingId,
      outcome: event.outcome,
      isFalsePositive: event.isFalsePositive,
      timestamp: event.timestamp.toISOString(),
      context: event.context,
      expiresAt,
      recordedAt: now,
    };

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          ConditionExpression:
            'attribute_not_exists(pk) AND attribute_not_exists(sk)',
        }),
      );
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new FPStoreError({
          message: `Duplicate FP event: ruleId=${event.ruleId}, eventId=${event.eventId}`,
          operation: 'recordEvent:duplicate',
          ruleId: event.ruleId,
          eventId: event.eventId,
          findingId: event.findingId,
          cause: error,
        });
      }
      throw new FPStoreError({
        message: `Failed to record FP event ${event.eventId} for rule ${event.ruleId}: ${error.message}`,
        operation: 'recordEvent',
        ruleId: event.ruleId,
        eventId: event.eventId,
        findingId: event.findingId,
        cause: error,
      });
    }
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    let result;
    try {
      result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :rule',
          ExpressionAttributeValues: marshall({ ':rule': `rule#${ruleId}` }),
          ScanIndexForward: false,
          Limit: count,
        }),
      );
    } catch (error: any) {
      throw new FPStoreError({
        message: `Failed to get FP window for ${ruleId} (count=${count}): ${error.message}`,
        operation: 'getWindowByCount',
        ruleId,
        cause: error,
      });
    }

    const events = (result.Items || []).map((item: any) =>
      this.unmarshallEvent(unmarshall(item)),
    );
    return this.computeWindow(ruleId, events);
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    let result;
    try {
      result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :rule AND sk >= :since',
          ExpressionAttributeValues: marshall({
            ':rule': `rule#${ruleId}`,
            ':since': `event#${since.toISOString()}`,
          }),
          ScanIndexForward: false,
        }),
      );
    } catch (error: any) {
      throw new FPStoreError({
        message: `Failed to get FP window for ${ruleId} (since=${since.toISOString()}): ${error.message}`,
        operation: 'getWindowBySince',
        ruleId,
        cause: error,
      });
    }

    const events = (result.Items || []).map((item: any) =>
      this.unmarshallEvent(unmarshall(item)),
    );
    return this.computeWindow(ruleId, events);
  }

  async markFalsePositive(eventId: string, reviewedBy: string): Promise<void> {
    // Find the event via GSI first
    let queryResult;
    try {
      queryResult = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'FindingIndex',
          KeyConditionExpression: 'gsi1pk = :finding',
          ExpressionAttributeValues: marshall({
            ':finding': `finding#${eventId}`,
          }),
          Limit: 1,
        }),
      );
    } catch (error: any) {
      throw new FPStoreError({
        message: `Failed to query event ${eventId} for FP marking: ${error.message}`,
        operation: 'markFalsePositive:query',
        eventId,
        cause: error,
      });
    }

    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new FPStoreError({
        message: `Event ${eventId} not found in FP store`,
        operation: 'markFalsePositive:notFound',
        eventId,
      });
    }

    const item = unmarshall(queryResult.Items[0]);

    try {
      await this.client.send(
        new UpdateItemCommand({
          TableName: this.tableName,
          Key: marshall({ pk: item.pk, sk: item.sk }),
          UpdateExpression:
            'SET isFalsePositive = :true, reviewedBy = :reviewer, reviewedAt = :now',
          ExpressionAttributeValues: marshall({
            ':true': true,
            ':reviewer': reviewedBy,
            ':now': new Date().toISOString(),
          }),
        }),
      );
    } catch (error: any) {
      throw new FPStoreError({
        message: `Failed to mark event ${eventId} as false positive: ${error.message}`,
        operation: 'markFalsePositive:update',
        eventId,
        cause: error,
      });
    }
  }

  async isFalsePositive(ruleId: string, findingId: string): Promise<boolean> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'FindingIndex',
          KeyConditionExpression: 'gsi1pk = :finding AND begins_with(gsi1sk, :rule)',
          ExpressionAttributeValues: marshall({
            ':finding': `finding#${findingId}`,
            ':rule': `rule#${ruleId}`,
          }),
          Limit: 1,
        }),
      );

      if (!result.Items || result.Items.length === 0) return false;
      const item = unmarshall(result.Items[0]);
      return item.isFalsePositive === true;
    } catch {
      return false; // Fail-closed: treat as not FP
    }
  }

  computeWindow(ruleId: string, events: FPEvent[]): FPWindow {
    const versionCounts = new Map<string, number>();
    events.forEach((e) => {
      versionCounts.set(
        e.ruleVersion,
        (versionCounts.get(e.ruleVersion) || 0) + 1,
      );
    });

    let mostCommonVersion = '';
    let maxCount = 0;
    versionCounts.forEach((count, version) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonVersion = version;
      }
    });

    const total = events.length;
    const falsePositives = events.filter((e) => e.isFalsePositive).length;
    const pending = events.filter((e) => !(e as any).reviewedBy).length;
    const reviewed = total - pending;
    const truePositives = reviewed - falsePositives;
    const observedFPR = reviewed > 0 ? falsePositives / reviewed : 0;

    return {
      ruleId,
      ruleVersion: mostCommonVersion,
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

  private unmarshallEvent(item: any): FPEvent {
    return {
      eventId: item.eventId,
      ruleId: item.ruleId,
      ruleVersion: item.ruleVersion,
      findingId: item.findingId,
      outcome: item.outcome,
      isFalsePositive: item.isFalsePositive,
      timestamp: new Date(item.timestamp),
      context: item.context,
    };
  }
}
