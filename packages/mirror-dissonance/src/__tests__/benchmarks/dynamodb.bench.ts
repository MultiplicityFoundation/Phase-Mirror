/**
 * DynamoDB Operations Benchmarks
 * Tests write, query, and batch operation performance
 */

import { DynamoDBClient, PutItemCommand, QueryCommand, BatchWriteItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { benchmark, BenchmarkResult, generateReport } from './framework';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const TABLE_NAME = `mirror-dissonance-${ENVIRONMENT}-fp-events`;

describe('Benchmark: DynamoDB Operations', () => {
  let dynamodbClient: DynamoDBClient;
  const results: BenchmarkResult[] = [];
  const testIds: string[] = [];

  beforeAll(() => {
    dynamodbClient = new DynamoDBClient({ region: REGION });
  });

  afterAll(async () => {
    // Cleanup test data
    const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    for (const id of testIds) {
      try {
        await dynamodbClient.send(new DeleteItemCommand({
          TableName: TABLE_NAME,
          Key: marshall({ pk: `rule:${id}`, sk: `event:test#bench` })
        }));
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    const report = generateReport(results);
    console.log(report);
  });

  describe('1. Write Operations', () => {
    it('should benchmark single item write', async () => {
      let counter = 0;

      const result = await benchmark(
        'DynamoDB Single Item Write',
        async () => {
          const id = `bench-write-${counter++}`;
          testIds.push(id);

          await dynamodbClient.send(new PutItemCommand({
            TableName: TABLE_NAME,
            Item: marshall({
              pk: `rule:${id}`,
              sk: `event:test#bench`,
              ruleId: id,
              createdAt: new Date().toISOString(),
              expiresAt: Math.floor(Date.now() / 1000) + 7776000
            })
          }));
        },
        { iterations: 100, warmupIterations: 10, logProgress: true }
      );

      results.push(result);

      // Target: <100ms
      expect(result.avgMs).toBeLessThan(100);
      expect(result.p95Ms).toBeLessThan(200);
    });

    it('should benchmark batch write (25 items)', async () => {
      let batchCounter = 0;

      const result = await benchmark(
        'DynamoDB Batch Write (25 items)',
        async () => {
          const batchId = `bench-batch-${batchCounter++}`;
          const items = Array.from({ length: 25 }, (_, i) => ({
            PutRequest: {
              Item: marshall({
                pk: `rule:${batchId}`,
                sk: `event:${i}#bench`,
                ruleId: batchId,
                eventId: `${i}`,
                createdAt: new Date().toISOString(),
                expiresAt: Math.floor(Date.now() / 1000) + 7776000
              })
            }
          }));

          await dynamodbClient.send(new BatchWriteItemCommand({
            RequestItems: {
              [TABLE_NAME]: items
            }
          }));

          testIds.push(batchId);
        },
        { iterations: 20, warmupIterations: 5, logProgress: true }
      );

      results.push(result);

      // Target: <500ms for 25 items
      expect(result.avgMs).toBeLessThan(500);
    });
  });

  describe('2. Query Operations', () => {
    beforeAll(async () => {
      // Insert test data for queries
      const ruleId = 'bench-query-rule';
      testIds.push(ruleId);

      for (let i = 0; i < 50; i++) {
        await dynamodbClient.send(new PutItemCommand({
          TableName: TABLE_NAME,
          Item: marshall({
            pk: `rule:${ruleId}`,
            sk: `event:${i}#bench`,
            ruleId,
            eventId: `${i}`,
            createdAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + 7776000
          })
        }));
      }
    });

    it('should benchmark query by partition key', async () => {
      const result = await benchmark(
        'DynamoDB Query by PK',
        async () => {
          await dynamodbClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: marshall({
              ':pk': 'rule:bench-query-rule'
            })
          }));
        },
        { iterations: 200, warmupIterations: 20, logProgress: true }
      );

      results.push(result);

      // Target: <50ms
      expect(result.avgMs).toBeLessThan(50);
    });

    it('should benchmark query with limit', async () => {
      const result = await benchmark(
        'DynamoDB Query with Limit (10 items)',
        async () => {
          await dynamodbClient.send(new QueryCommand({
            TableName: TABLE_NAME,
            KeyConditionExpression: 'pk = :pk',
            ExpressionAttributeValues: marshall({
              ':pk': 'rule:bench-query-rule'
            }),
            Limit: 10
          }));
        },
        { iterations: 200, logProgress: true }
      );

      results.push(result);

      // Target: <30ms (smaller result set)
      expect(result.avgMs).toBeLessThan(30);
    });
  });

  describe('3. Concurrent Operations', () => {
    it('should benchmark concurrent writes (10 parallel)', async () => {
      let concurrentCounter = 0;

      const result = await benchmark(
        'DynamoDB Concurrent Writes (10 parallel)',
        async () => {
          const batchId = `bench-concurrent-${concurrentCounter++}`;
          const writes = Array.from({ length: 10 }, (_, i) =>
            dynamodbClient.send(new PutItemCommand({
              TableName: TABLE_NAME,
              Item: marshall({
                pk: `rule:${batchId}`,
                sk: `event:${i}#bench`,
                ruleId: batchId,
                eventId: `${i}`,
                createdAt: new Date().toISOString(),
                expiresAt: Math.floor(Date.now() / 1000) + 7776000
              })
            }))
          );

          await Promise.all(writes);
          testIds.push(batchId);
        },
        { iterations: 50, warmupIterations: 10, logProgress: true }
      );

      results.push(result);

      // Target: <300ms for 10 parallel writes
      expect(result.avgMs).toBeLessThan(300);
    });
  });
});
