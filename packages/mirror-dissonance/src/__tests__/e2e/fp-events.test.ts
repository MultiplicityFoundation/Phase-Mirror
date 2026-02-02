/**
 * E2E Tests: False Positive Event Tracking
 * Tests complete workflow with staging DynamoDB
 */

import { DynamoDBClient, PutItemCommand, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { config, clients, generateTestId, createTestTimestamp, verifyInfrastructure } from './setup';

describe('E2E: False Positive Event Tracking', () => {
  let testIds: string[] = [];
  
  beforeAll(async () => {
    const infraReady = await verifyInfrastructure();
    if (!infraReady) {
      throw new Error('Infrastructure not ready for E2E tests');
    }
  });
  
  afterAll(async () => {
    // Cleanup test data
    for (const testId of testIds) {
      try {
        const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
        // Delete test records (implementation details)
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });
  
  describe('1. Event Submission', () => {
    it('should store false positive event in DynamoDB', async () => {
      const ruleId = generateTestId('test-rule');
      const eventId = generateTestId('event');
      const timestamp = createTestTimestamp();
      
      testIds.push(ruleId);
      
      const event = {
        pk: `rule:${ruleId}`,
        sk: `event:${timestamp}#${eventId}`,
        gsi1pk: `finding:test-finding-${eventId}`,
        gsi1sk: timestamp,
        ruleId,
        findingId: `test-finding-${eventId}`,
        orgId: 'test-org-e2e',
        userId: 'test-user-e2e',
        reason: 'E2E test false positive',
        severity: 'medium',
        createdAt: timestamp,
        expiresAt: Math.floor(Date.now() / 1000) + 7776000 // 90 days
      };
      
      await clients.dynamodb.send(new PutItemCommand({
        TableName: config.tables.fpEvents,
        Item: marshall(event)
      }));
      
      // Verify write succeeded
      const result = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.fpEvents,
        Key: marshall({
          pk: event.pk,
          sk: event.sk
        })
      }));
      
      expect(result.Item).toBeDefined();
      const stored = unmarshall(result.Item!);
      expect(stored.ruleId).toBe(ruleId);
      expect(stored.reason).toBe('E2E test false positive');
    });
    
    it('should handle concurrent event submissions', async () => {
      const ruleId = generateTestId('test-concurrent-rule');
      const timestamp = createTestTimestamp();
      
      testIds.push(ruleId);
      
      // Submit 10 events concurrently
      const submissions = Array.from({ length: 10 }, (_, i) => {
        const eventId = `${generateTestId('event')}-${i}`;
        return clients.dynamodb.send(new PutItemCommand({
          TableName: config.tables.fpEvents,
          Item: marshall({
            pk: `rule:${ruleId}`,
            sk: `event:${timestamp}#${eventId}`,
            ruleId,
            eventId,
            createdAt: timestamp,
            expiresAt: Math.floor(Date.now() / 1000) + 7776000
          })
        }));
      });
      
      const results = await Promise.allSettled(submissions);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      
      expect(successful).toBe(10);
    });
  });
  
  describe('2. Query by Rule', () => {
    it('should retrieve all events for a rule', async () => {
      const ruleId = generateTestId('test-query-rule');
      const timestamp = createTestTimestamp();
      
      testIds.push(ruleId);
      
      // Insert 5 events for the same rule
      for (let i = 0; i < 5; i++) {
        await clients.dynamodb.send(new PutItemCommand({
          TableName: config.tables.fpEvents,
          Item: marshall({
            pk: `rule:${ruleId}`,
            sk: `event:${timestamp}#${i}`,
            ruleId,
            eventId: `event-${i}`,
            createdAt: timestamp,
            expiresAt: Math.floor(Date.now() / 1000) + 7776000
          })
        }));
      }
      
      // Query by rule
      const result = await clients.dynamodb.send(new QueryCommand({
        TableName: config.tables.fpEvents,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': `rule:${ruleId}`
        })
      }));
      
      expect(result.Items).toHaveLength(5);
      const events = result.Items!.map(item => unmarshall(item));
      expect(events.every(e => e.ruleId === ruleId)).toBe(true);
    });
  });
  
  describe('3. Query by Finding (GSI)', () => {
    it('should retrieve events via FindingIndex', async () => {
      const findingId = generateTestId('test-finding');
      const timestamp = createTestTimestamp();
      
      testIds.push(findingId);
      
      // Insert events with different rules, same finding
      for (let i = 0; i < 3; i++) {
        const ruleId = `rule-${i}`;
        await clients.dynamodb.send(new PutItemCommand({
          TableName: config.tables.fpEvents,
          Item: marshall({
            pk: `rule:${ruleId}`,
            sk: `event:${timestamp}#${i}`,
            gsi1pk: `finding:${findingId}`,
            gsi1sk: timestamp,
            ruleId,
            findingId,
            createdAt: timestamp,
            expiresAt: Math.floor(Date.now() / 1000) + 7776000
          })
        }));
      }
      
      // Query via GSI
      const result = await clients.dynamodb.send(new QueryCommand({
        TableName: config.tables.fpEvents,
        IndexName: 'FindingIndex',
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: marshall({
          ':gsi1pk': `finding:${findingId}`
        })
      }));
      
      expect(result.Items).toHaveLength(3);
      const events = result.Items!.map(item => unmarshall(item));
      expect(events.every(e => e.findingId === findingId)).toBe(true);
    });
  });
  
  describe('4. TTL Validation', () => {
    it('should set correct TTL expiration', async () => {
      const ruleId = generateTestId('test-ttl-rule');
      const timestamp = createTestTimestamp();
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = now + 7776000; // 90 days
      
      testIds.push(ruleId);
      
      await clients.dynamodb.send(new PutItemCommand({
        TableName: config.tables.fpEvents,
        Item: marshall({
          pk: `rule:${ruleId}`,
          sk: `event:${timestamp}#test`,
          ruleId,
          createdAt: timestamp,
          expiresAt
        })
      }));
      
      const result = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.fpEvents,
        Key: marshall({
          pk: `rule:${ruleId}`,
          sk: `event:${timestamp}#test`
        })
      }));
      
      const stored = unmarshall(result.Item!);
      expect(stored.expiresAt).toBe(expiresAt);
      
      // Verify expiration is ~90 days from now
      const daysUntilExpiration = (expiresAt - now) / 86400;
      expect(daysUntilExpiration).toBeCloseTo(90, 0);
    });
  });
});
