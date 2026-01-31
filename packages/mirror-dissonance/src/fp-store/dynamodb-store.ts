/**
 * DynamoDB FP Store Implementation - Day 9
 * Core operations for false positive event tracking with windowed statistics
 */

import { 
  DynamoDBClient, 
  PutItemCommand, 
  UpdateItemCommand, 
  QueryCommand 
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { FPEvent, FPWindow, FPStoreConfig, FPStore } from './types.js';

export class DynamoDBFPStore implements FPStore {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlDays: number;

  constructor(config: FPStoreConfig) {
    this.client = new DynamoDBClient({ region: config.region });
    this.tableName = config.tableName;
    this.ttlDays = config.ttlDays ?? 90;
  }

  async recordEvent(event: FPEvent): Promise<void> {
    const now = Date.now();
    const expiresAt = Math.floor(now / 1000) + (this.ttlDays * 86400);
    
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
      suppressionTicket: event.suppressionTicket,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt?.toISOString(),
      isFalsePositive: event.isFalsePositive,
      timestamp: event.timestamp.toISOString(),
      context: event.context,
      expiresAt,
      recordedAt: now,
    };

    await this.client.send(new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(pk)', // Prevent duplicates
    }));
  }

  async markFalsePositive(
    findingId: string,
    reviewedBy: string,
    ticket: string
  ): Promise<void> {
    // Query GSI to find the event
    const queryResult = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      IndexName: 'FindingIndex',
      KeyConditionExpression: 'gsi1pk = :finding',
      ExpressionAttributeValues: marshall({
        ':finding': `finding#${findingId}`,
      }),
      Limit: 1,
    }));

    if (!queryResult.Items || queryResult.Items.length === 0) {
      throw new Error(`Finding ${findingId} not found in FP store`);
    }

    const item = unmarshall(queryResult.Items[0]);
    
    await this.client.send(new UpdateItemCommand({
      TableName: this.tableName,
      Key: marshall({ pk: item.pk, sk: item.sk }),
      UpdateExpression: 'SET isFalsePositive = :true, reviewedBy = :reviewer, reviewedAt = :now, suppressionTicket = :ticket',
      ExpressionAttributeValues: marshall({
        ':true': true,
        ':reviewer': reviewedBy,
        ':now': new Date().toISOString(),
        ':ticket': ticket,
      }),
    }));
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :rule',
      ExpressionAttributeValues: marshall({
        ':rule': `rule#${ruleId}`,
      }),
      ScanIndexForward: false, // Newest first
      Limit: count,
    }));

    const events = (result.Items || []).map(item => this.unmarshallEvent(unmarshall(item)));
    return this.computeWindow(ruleId, events);
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    const result = await this.client.send(new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :rule AND sk >= :since',
      ExpressionAttributeValues: marshall({
        ':rule': `rule#${ruleId}`,
        ':since': `event#${since.toISOString()}`,
      }),
      ScanIndexForward: false,
    }));

    const events = (result.Items || []).map(item => this.unmarshallEvent(unmarshall(item)));
    return this.computeWindow(ruleId, events);
  }

  private unmarshallEvent(item: any): FPEvent {
    return {
      eventId: item.eventId,
      ruleId: item.ruleId,
      ruleVersion: item.ruleVersion,
      findingId: item.findingId,
      outcome: item.outcome,
      suppressionTicket: item.suppressionTicket,
      reviewedBy: item.reviewedBy,
      reviewedAt: item.reviewedAt ? new Date(item.reviewedAt) : undefined,
      isFalsePositive: item.isFalsePositive,
      timestamp: new Date(item.timestamp),
      context: item.context,
    };
  }

  private computeWindow(ruleId: string, events: FPEvent[]): FPWindow {
    // Get most common version (handle mixed-version windows)
    const versionCounts = new Map<string, number>();
    events.forEach(e => {
      versionCounts.set(e.ruleVersion, (versionCounts.get(e.ruleVersion) || 0) + 1);
    });
    
    let mostCommonVersion = '';
    let maxCount = 0;
    versionCounts.forEach((count, version) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonVersion = version;
      }
    });

    // Compute statistics
    const total = events.length;
    const falsePositives = events.filter(e => e.isFalsePositive).length;
    const pending = events.filter(e => e.reviewedBy === undefined).length;
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
}
