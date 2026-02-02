/**
 * Load Testing Benchmarks
 * Tests sustained throughput and burst handling
 */

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { benchmark, BenchmarkResult, generateReport } from './framework.js';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const TABLE_NAME = `mirror-dissonance-${ENVIRONMENT}-fp-events`;

// TTL constant
const TTL_NINETY_DAYS = 7776000; // seconds

describe('Benchmark: Load Testing', () => {
  let dynamodbClient: DynamoDBClient;
  const results: BenchmarkResult[] = [];

  beforeAll(() => {
    dynamodbClient = new DynamoDBClient({ region: REGION });
  });

  afterAll(() => {
    const report = generateReport(results);
    console.log(report);
  });

  describe('1. Sustained Throughput', () => {
    it('should measure sustained write throughput (5 minutes)', async () => {
      const duration = 5 * 60 * 1000; // 5 minutes
      const startTime = Date.now();
      let operations = 0;
      const latencies: number[] = [];

      console.log('Starting 5-minute sustained load test...');

      while (Date.now() - startTime < duration) {
        const iterStart = performance.now();

        await dynamodbClient.send(new PutItemCommand({
          TableName: TABLE_NAME,
          Item: marshall({
            pk: `rule:load-test`,
            sk: `event:${operations}#${Date.now()}`,
            ruleId: 'load-test',
            eventId: `${operations}`,
            createdAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + TTL_NINETY_DAYS
          })
        }));

        const iterEnd = performance.now();
        latencies.push(iterEnd - iterStart);
        operations++;

        if (operations % 100 === 0) {
          const elapsed = Date.now() - startTime;
          const throughput = (operations / elapsed) * 1000;
          console.log(`Progress: ${operations} ops, ${throughput.toFixed(2)} ops/sec`);
        }
      }

      const totalTime = Date.now() - startTime;
      const throughput = (operations / totalTime) * 1000;

      latencies.sort((a, b) => a - b);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Latency = latencies[Math.floor(latencies.length * 0.95)];
      const p99Latency = latencies[Math.floor(latencies.length * 0.99)];

      console.log('\n' + '═'.repeat(60));
      console.log('Sustained Load Test Results (5 minutes)');
      console.log('═'.repeat(60));
      console.log(`Total Operations:  ${operations}`);
      console.log(`Total Time:        ${(totalTime / 1000).toFixed(2)}s`);
      console.log(`Throughput:        ${throughput.toFixed(2)} ops/sec`);
      console.log(`Avg Latency:       ${avgLatency.toFixed(3)}ms`);
      console.log(`p95 Latency:       ${p95Latency.toFixed(3)}ms`);
      console.log(`p99 Latency:       ${p99Latency.toFixed(3)}ms`);
      console.log('═'.repeat(60) + '\n');

      // Verify sustained performance
      expect(throughput).toBeGreaterThan(10); // At least 10 ops/sec sustained
      expect(p99Latency).toBeLessThan(500); // p99 under 500ms
    }, 6 * 60 * 1000); // 6-minute timeout

    it('should measure burst throughput (100 concurrent ops)', async () => {
      const burstSize = 100;
      const start = performance.now();

      const operations = Array.from({ length: burstSize }, (_, i) =>
        dynamodbClient.send(new PutItemCommand({
          TableName: TABLE_NAME,
          Item: marshall({
            pk: `rule:burst-test`,
            sk: `event:${i}#${Date.now()}`,
            ruleId: 'burst-test',
            eventId: `${i}`,
            createdAt: new Date().toISOString(),
            expiresAt: Math.floor(Date.now() / 1000) + TTL_NINETY_DAYS
          })
        }))
      );

      await Promise.all(operations);

      const end = performance.now();
      const duration = end - start;
      const throughput = (burstSize / duration) * 1000;

      console.log('\n' + '═'.repeat(60));
      console.log('Burst Load Test Results (100 concurrent)');
      console.log('═'.repeat(60));
      console.log(`Operations:   ${burstSize}`);
      console.log(`Duration:     ${duration.toFixed(2)}ms`);
      console.log(`Throughput:   ${throughput.toFixed(2)} ops/sec`);
      console.log('═'.repeat(60) + '\n');

      // Verify burst handling
      expect(duration).toBeLessThan(5000); // 100 ops in < 5s
      expect(throughput).toBeGreaterThan(20); // At least 20 ops/sec burst
    });
  });
});
