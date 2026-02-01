/**
 * FP Store Integration Tests
 * 
 * Requires LocalStack running on localhost:4566
 * These tests are skipped by default - run manually when LocalStack is available
 */

import { DynamoDBFPStore } from '../dynamodb-store.js';
import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import type { FPEvent } from '../types.js';

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const TEST_TABLE = 'test-fp-store-integration';

// Skip integration tests by default (LocalStack required)
describe.skip('FP Store Integration (LocalStack)', () => {
  let store: DynamoDBFPStore;
  let dynamoClient: DynamoDBClient;

  beforeAll(async () => {
    dynamoClient = new DynamoDBClient({
      region: 'us-east-1',
      endpoint: LOCALSTACK_ENDPOINT,
    });

    // Create test table
    try {
      await dynamoClient.send(new CreateTableCommand({
        TableName: TEST_TABLE,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'gsi1pk', AttributeType: 'S' },
          { AttributeName: 'gsi1sk', AttributeType: 'S' }
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' }
        ],
        GlobalSecondaryIndexes: [{
          IndexName: 'FindingIndex',
          KeySchema: [
            { AttributeName: 'gsi1pk', KeyType: 'HASH' },
            { AttributeName: 'gsi1sk', KeyType: 'RANGE' }
          ],
          Projection: { ProjectionType: 'ALL' },
          ProvisionedThroughput: {
            ReadCapacityUnits: 5,
            WriteCapacityUnits: 5
          }
        }],
        BillingMode: 'PAY_PER_REQUEST'
      }));
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
    }

    store = new DynamoDBFPStore({
      tableName: TEST_TABLE,
      region: 'us-east-1',
      endpoint: LOCALSTACK_ENDPOINT,
      ttlDays: 90
    });
  });

  afterAll(async () => {
    dynamoClient.destroy();
  });

  it('should record and retrieve events end-to-end', async () => {
    const event: FPEvent = {
      eventId: 'integration-evt-001',
      ruleId: 'MD-INTEGRATION',
      ruleVersion: '1.0.0',
      findingId: 'integration-finding-001',
      outcome: 'block',
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: 'test/integration',
        branch: 'main',
        eventType: 'pull_request'
      }
    };

    await store.recordEvent(event);

    const window = await store.getWindowByCount('MD-INTEGRATION', 10);

    expect(window.events).toContainEqual(
      expect.objectContaining({
        eventId: 'integration-evt-001',
        ruleId: 'MD-INTEGRATION'
      })
    );
  });

  it('should mark event as false positive', async () => {
    const event: FPEvent = {
      eventId: 'integration-evt-002',
      ruleId: 'MD-INTEGRATION',
      ruleVersion: '1.0.0',
      findingId: 'integration-finding-002',
      outcome: 'block',
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: 'test/integration',
        branch: 'main',
        eventType: 'pull_request'
      }
    };

    await store.recordEvent(event);
    await store.markFalsePositive('integration-finding-002', 'test-reviewer', 'TEST-TICKET');

    const window = await store.getWindowByCount('MD-INTEGRATION', 10);
    const markedEvent = window.events.find(e => e.findingId === 'integration-finding-002');

    expect(markedEvent?.isFalsePositive).toBe(true);
    expect(markedEvent?.reviewedBy).toBe('test-reviewer');
    expect(markedEvent?.suppressionTicket).toBe('TEST-TICKET');
  });

  it('should compute FPR accurately', async () => {
    // Record 10 events, mark 3 as FP
    for (let i = 0; i < 10; i++) {
      const event: FPEvent = {
        eventId: `fpr-test-${i}`,
        ruleId: 'MD-FPR-TEST',
        ruleVersion: '1.0.0',
        findingId: `fpr-finding-${i}`,
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(Date.now() + i * 1000),
        context: {
          repo: 'test/fpr',
          branch: 'main',
          eventType: 'pull_request'
        }
      };

      await store.recordEvent(event);

      if (i % 3 === 0) {
        await store.markFalsePositive(`fpr-finding-${i}`, 'reviewer', 'TICKET');
      }
    }

    const window = await store.getWindowByCount('MD-FPR-TEST', 20);

    // 4 FP out of 10 = 40% FPR
    expect(window.statistics.falsePositives).toBe(4);
    expect(window.statistics.observedFPR).toBeCloseTo(0.4, 1);
  });
});
