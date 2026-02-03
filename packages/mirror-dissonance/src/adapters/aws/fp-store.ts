/**
 * AWS DynamoDB False Positive Store Adapter
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  GetCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import {
  FPStoreAdapter,
  FPQuery,
} from '../types.js';
import { FalsePositiveEvent } from '../../../schemas/types.js';
import { AWSConfig } from '../config.js';

export class AWSFPStoreAdapter implements FPStoreAdapter {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(config: AWSConfig) {
    const clientConfig: any = { region: config.region };
    if (config.dynamodbEndpoint || config.endpoint) {
      clientConfig.endpoint = config.dynamodbEndpoint || config.endpoint;
    }
    
    const dynamoClient = new DynamoDBClient(clientConfig);
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.fpTableName || 'phase-mirror-fp-events';
  }

  async record(event: Omit<FalsePositiveEvent, 'id'> & { id?: string }): Promise<string> {
    const id = event.id || randomUUID();
    const timestamp = event.timestamp || new Date().toISOString();

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            id,
            findingId: event.findingId,
            ruleId: event.ruleId,
            // Store orgIdHash as 'orgId' for GSI partition key querying.
            // The original orgIdHash is preserved in the orgIdHash field.
            // This mapping allows efficient queries via OrgIdCreatedAtIndex GSI.
            orgId: event.orgIdHash,
            repoId: event.context?.repoId,
            timestamp,
            resolvedBy: event.resolvedBy,
            context: event.context,
            orgIdHash: event.orgIdHash,
            consent: event.consent,
            createdAt: timestamp, // For GSI sorting
          },
        })
      );

      return id;
    } catch (error) {
      console.error('Failed to record false positive:', error);
      throw error;
    }
  }

  async markAsFP(findingId: string, resolvedBy: string): Promise<void> {
    try {
      // First, query to find the event by findingId
      const queryResult = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'FindingIndex',
          KeyConditionExpression: 'findingId = :findingId',
          ExpressionAttributeValues: {
            ':findingId': findingId,
          },
          Limit: 1,
        })
      );

      if (!queryResult.Items || queryResult.Items.length === 0) {
        throw new Error(`Finding ${findingId} not found`);
      }

      const item = queryResult.Items[0];

      // Update the item with resolvedBy
      await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { id: item.id },
          UpdateExpression: 'SET resolvedBy = :resolvedBy, markedAt = :markedAt',
          ExpressionAttributeValues: {
            ':resolvedBy': resolvedBy,
            ':markedAt': new Date().toISOString(),
          },
          ConditionExpression: 'attribute_exists(id)',
        })
      );
    } catch (error) {
      console.error('Failed to mark as false positive:', error);
      throw error;
    }
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    try {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'FindingIndex',
          KeyConditionExpression: 'findingId = :findingId',
          ExpressionAttributeValues: {
            ':findingId': findingId,
          },
          Limit: 1,
        })
      );

      return (result.Items?.length || 0) > 0;
    } catch (error) {
      console.error('Failed to check false positive:', error);
      return false;
    }
  }

  async query(query: FPQuery): Promise<FalsePositiveEvent[]> {
    try {
      // Validate query - we need at least orgId or repoId for efficient GSI query
      if (!query.orgId && !query.repoId) {
        throw new Error(
          'Query requires orgId or repoId to use GSI. Scanning entire table is not supported.'
        );
      }

      let indexName: string;
      let keyConditionExpression: string;
      let expressionAttributeValues: Record<string, any>;

      if (query.orgId) {
        indexName = 'OrgIdCreatedAtIndex';
        keyConditionExpression = 'orgId = :orgId';
        expressionAttributeValues = { ':orgId': query.orgId };

        if (query.startTime || query.endTime) {
          if (query.startTime && query.endTime) {
            keyConditionExpression += ' AND createdAt BETWEEN :start AND :end';
            expressionAttributeValues[':start'] = query.startTime.toISOString();
            expressionAttributeValues[':end'] = query.endTime.toISOString();
          } else if (query.startTime) {
            keyConditionExpression += ' AND createdAt >= :start';
            expressionAttributeValues[':start'] = query.startTime.toISOString();
          } else if (query.endTime) {
            keyConditionExpression += ' AND createdAt <= :end';
            expressionAttributeValues[':end'] = query.endTime.toISOString();
          }
        }
      } else if (query.repoId) {
        indexName = 'RepoIdCreatedAtIndex';
        keyConditionExpression = 'repoId = :repoId';
        expressionAttributeValues = { ':repoId': query.repoId };

        if (query.startTime || query.endTime) {
          if (query.startTime && query.endTime) {
            keyConditionExpression += ' AND createdAt BETWEEN :start AND :end';
            expressionAttributeValues[':start'] = query.startTime.toISOString();
            expressionAttributeValues[':end'] = query.endTime.toISOString();
          } else if (query.startTime) {
            keyConditionExpression += ' AND createdAt >= :start';
            expressionAttributeValues[':start'] = query.startTime.toISOString();
          } else if (query.endTime) {
            keyConditionExpression += ' AND createdAt <= :end';
            expressionAttributeValues[':end'] = query.endTime.toISOString();
          }
        }
      } else {
        throw new Error('Invalid query: requires orgId or repoId');
      }

      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: indexName,
          KeyConditionExpression: keyConditionExpression,
          ExpressionAttributeValues: expressionAttributeValues,
          Limit: query.limit || 100,
          ScanIndexForward: false, // Most recent first
        })
      );

      let items = (result.Items || []) as FalsePositiveEvent[];

      // Filter by ruleId if provided (can't use in KeyCondition)
      if (query.ruleId) {
        items = items.filter((item) => item.ruleId === query.ruleId);
      }

      return items;
    } catch (error) {
      console.error('Failed to query false positives:', error);
      throw error;
    }
  }
}
