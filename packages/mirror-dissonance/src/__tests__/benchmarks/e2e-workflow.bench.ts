/**
 * End-to-End Workflow Benchmarks
 * Tests complete false positive submission flow
 */

import { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { benchmark, BenchmarkResult, generateReport } from './framework';
import { loadNonce, clearNonceCache } from '../../nonce/multi-version-loader';
import { redact } from '../../redaction/redactor-multi-version';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';

const config = {
  fpEventsTable: `mirror-dissonance-${ENVIRONMENT}-fp-events`,
  blockCounterTable: `mirror-dissonance-${ENVIRONMENT}-block-counter`,
  baselinesBucket: `mirror-dissonance-${ENVIRONMENT}-baselines`,
  nonceParam: `/guardian/${ENVIRONMENT}/redaction_nonce_v1`
};

describe('Benchmark: End-to-End Workflows', () => {
  let dynamodbClient: DynamoDBClient;
  let s3Client: S3Client;
  let ssmClient: SSMClient;
  const results: BenchmarkResult[] = [];
  const testIds: string[] = [];

  beforeAll(async () => {
    dynamodbClient = new DynamoDBClient({ region: REGION });
    s3Client = new S3Client({ region: REGION });
    ssmClient = new SSMClient({ region: REGION });

    clearNonceCache();
    await loadNonce(ssmClient, config.nonceParam);
  });

  afterAll(() => {
    const report = generateReport(results);
    console.log(report);
  });

  describe('1. Complete False Positive Submission', () => {
    it('should benchmark full FP submission workflow', async () => {
      let counter = 0;

      const result = await benchmark(
        'Complete FP Submission (redaction + DynamoDB + S3)',
        async () => {
          const ruleId = `bench-fp-${counter++}`;
          const timestamp = new Date().toISOString();

          // Step 1: Redact sensitive data
          const rawReason = `API key sk-${Math.random().toString(36).substring(7)} triggered rule`;
          const redactedReason = redact(rawReason, [
            { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[REDACTED-API-KEY]' }
          ]);

          // Step 2: Check circuit breaker
          const hourBucket = Math.floor(Date.now() / 3600000);
          const bucketKey = `${ruleId}:${hourBucket}`;

          const counterResult = await dynamodbClient.send(new UpdateItemCommand({
            TableName: config.blockCounterTable,
            Key: marshall({ bucketKey }),
            UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
            ExpressionAttributeValues: marshall({
              ':inc': 1,
              ':ttl': Math.floor(Date.now() / 1000) + 7200
            }),
            ReturnValues: 'ALL_NEW'
          }));

          const count = unmarshall(counterResult.Attributes!).blockCount;

          // Step 3: Store FP event (if not blocked)
          if (count <= 100) {
            await dynamodbClient.send(new PutItemCommand({
              TableName: config.fpEventsTable,
              Item: marshall({
                pk: `rule:${ruleId}`,
                sk: `event:${timestamp}#bench`,
                ruleId,
                reason: redactedReason,
                createdAt: timestamp,
                expiresAt: Math.floor(Date.now() / 1000) + 7776000
              })
            }));
          }

          // Step 4: Update baseline
          const baseline = {
            ruleId,
            fpCount: count,
            lastUpdated: timestamp
          };

          await s3Client.send(new PutObjectCommand({
            Bucket: config.baselinesBucket,
            Key: `benchmarks/${ruleId}.json`,
            Body: JSON.stringify(baseline),
            ContentType: 'application/json'
          }));

          testIds.push(ruleId);
        },
        { iterations: 100, warmupIterations: 10, logProgress: true }
      );

      results.push(result);

      // Target: <500ms for complete workflow
      expect(result.avgMs).toBeLessThan(500);
      expect(result.p95Ms).toBeLessThan(750);
      expect(result.p99Ms).toBeLessThan(1000);
    });
  });

  describe('2. Latency Breakdown', () => {
    it('should measure component latency breakdown', async () => {
      const ruleId = 'bench-breakdown';
      const timestamp = new Date().toISOString();

      const latencies = {
        redaction: 0,
        circuitBreaker: 0,
        fpStorage: 0,
        baseline: 0
      };

      const iterations = 50;

      for (let i = 0; i < iterations; i++) {
        // Redaction
        let start = performance.now();
        const rawReason = `API key sk-${Math.random().toString(36).substring(7)} triggered`;
        const redactedReason = redact(rawReason, [
          { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[REDACTED]' }
        ]);
        latencies.redaction += performance.now() - start;

        // Circuit breaker
        start = performance.now();
        const hourBucket = Math.floor(Date.now() / 3600000);
        const bucketKey = `${ruleId}:${hourBucket}`;
        await dynamodbClient.send(new UpdateItemCommand({
          TableName: config.blockCounterTable,
          Key: marshall({ bucketKey }),
          UpdateExpression: 'ADD blockCount :inc SET expiresAt :ttl',
          ExpressionAttributeValues: marshall({
            ':inc': 1,
            ':ttl': Math.floor(Date.now() / 1000) + 7200
          })
        }));
        latencies.circuitBreaker += performance.now() - start;

        // FP storage
        start = performance.now();
        await dynamodbClient.send(new PutItemCommand({
          TableName: config.fpEventsTable,
          Item: marshall({
            pk: `rule:${ruleId}`,
            sk: `event:${i}#bench`,
            ruleId,
            reason: redactedReason,
            createdAt: timestamp,
            expiresAt: Math.floor(Date.now() / 1000) + 7776000
          })
        }));
        latencies.fpStorage += performance.now() - start;

        // Baseline
        start = performance.now();
        await s3Client.send(new PutObjectCommand({
          Bucket: config.baselinesBucket,
          Key: `benchmarks/${ruleId}-${i}.json`,
          Body: JSON.stringify({ ruleId, iteration: i }),
          ContentType: 'application/json'
        }));
        latencies.baseline += performance.now() - start;
      }

      // Calculate averages
      const avgLatencies = {
        redaction: latencies.redaction / iterations,
        circuitBreaker: latencies.circuitBreaker / iterations,
        fpStorage: latencies.fpStorage / iterations,
        baseline: latencies.baseline / iterations,
        total: Object.values(latencies).reduce((a, b) => a + b, 0) / iterations
      };

      console.log('\n' + '═'.repeat(60));
      console.log('Latency Breakdown (avg per operation)');
      console.log('═'.repeat(60));
      console.log(`Redaction:        ${avgLatencies.redaction.toFixed(3)}ms`);
      console.log(`Circuit Breaker:  ${avgLatencies.circuitBreaker.toFixed(3)}ms`);
      console.log(`FP Storage:       ${avgLatencies.fpStorage.toFixed(3)}ms`);
      console.log(`Baseline Update:  ${avgLatencies.baseline.toFixed(3)}ms`);
      console.log('─'.repeat(60));
      console.log(`Total:            ${avgLatencies.total.toFixed(3)}ms`);
      console.log('═'.repeat(60) + '\n');

      // Verify targets
      expect(avgLatencies.redaction).toBeLessThan(10);
      expect(avgLatencies.circuitBreaker).toBeLessThan(100);
      expect(avgLatencies.fpStorage).toBeLessThan(100);
      expect(avgLatencies.baseline).toBeLessThan(250);
      expect(avgLatencies.total).toBeLessThan(500);

      testIds.push(ruleId);
    });
  });
});
