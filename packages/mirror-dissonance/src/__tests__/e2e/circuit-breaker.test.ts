/**
 * E2E Tests: Circuit Breaker with DynamoDB
 * Tests rate limiting and time-based bucket reset
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DynamoDBClient, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { config, clients, generateTestId, verifyInfrastructure } from './setup';

describe('E2E: Circuit Breaker', () => {
  let testBuckets: string[] = [];
  
  beforeAll(async () => {
    const infraReady = await verifyInfrastructure();
    if (!infraReady) {
      throw new Error('Infrastructure not ready for E2E tests');
    }
  });
  
  afterAll(async () => {
    // Cleanup test buckets
    const { DeleteItemCommand } = await import('@aws-sdk/client-dynamodb');
    for (const bucket of testBuckets) {
      try {
        await clients.dynamodb.send(new DeleteItemCommand({
          TableName: config.tables.blockCounter,
          Key: marshall({ bucketKey: bucket })
        }));
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });
  
  describe('1. Threshold Enforcement', () => {
    it('should increment block counter', async () => {
      const ruleId = generateTestId('test-circuit-rule');
      const hourBucket = Math.floor(Date.now() / 3600000);
      const bucketKey = `${ruleId}:${hourBucket}`;
      
      testBuckets.push(bucketKey);
      
      // Increment counter
      const result = await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 1,
          ':ttl': Math.floor(Date.now() / 1000) + 7200 // 2 hours
        }),
        ReturnValues: 'ALL_NEW'
      }));
      
      const updated = unmarshall(result.Attributes!);
      expect(updated.blockCount).toBe(1);
    });
    
    it('should detect threshold exceeded', async () => {
      const ruleId = generateTestId('test-threshold-rule');
      const hourBucket = Math.floor(Date.now() / 3600000);
      const bucketKey = `${ruleId}:${hourBucket}`;
      const threshold = 5;
      
      testBuckets.push(bucketKey);
      
      // Increment to threshold
      for (let i = 0; i < threshold; i++) {
        await clients.dynamodb.send(new UpdateItemCommand({
          TableName: config.tables.blockCounter,
          Key: marshall({ bucketKey }),
          UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
          ExpressionAttributeValues: marshall({
            ':inc': 1,
            ':ttl': Math.floor(Date.now() / 1000) + 7200
          })
        }));
      }
      
      // Check current count
      const result = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey })
      }));
      
      const counter = unmarshall(result.Item!);
      expect(counter.blockCount).toBe(threshold);
      
      // Next increment should trigger circuit breaker
      const exceeded = counter.blockCount >= threshold;
      expect(exceeded).toBe(true);
    });
  });
  
  describe('2. Time-Based Bucket Isolation', () => {
    it('should isolate counts by hour bucket', async () => {
      const ruleId = generateTestId('test-bucket-rule');
      const currentHour = Math.floor(Date.now() / 3600000);
      
      const bucket1 = `${ruleId}:${currentHour}`;
      const bucket2 = `${ruleId}:${currentHour + 1}`;
      
      testBuckets.push(bucket1, bucket2);
      
      // Increment bucket 1
      await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket1 }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 3,
          ':ttl': Math.floor(Date.now() / 1000) + 7200
        })
      }));
      
      // Increment bucket 2
      await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket2 }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 5,
          ':ttl': Math.floor(Date.now() / 1000) + 7200
        })
      }));
      
      // Verify isolation
      const result1 = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket1 })
      }));
      
      const result2 = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket2 })
      }));
      
      expect(unmarshall(result1.Item!).blockCount).toBe(3);
      expect(unmarshall(result2.Item!).blockCount).toBe(5);
    });
  });
  
  describe('3. Multi-Rule Isolation', () => {
    it('should isolate counts by rule', async () => {
      const hourBucket = Math.floor(Date.now() / 3600000);
      const rule1 = generateTestId('rule-1');
      const rule2 = generateTestId('rule-2');
      
      const bucket1 = `${rule1}:${hourBucket}`;
      const bucket2 = `${rule2}:${hourBucket}`;
      
      testBuckets.push(bucket1, bucket2);
      
      // Increment rule 1
      await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket1 }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 10,
          ':ttl': Math.floor(Date.now() / 1000) + 7200
        })
      }));
      
      // Increment rule 2
      await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket2 }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 2,
          ':ttl': Math.floor(Date.now() / 1000) + 7200
        })
      }));
      
      // Verify isolation
      const result1 = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket1 })
      }));
      
      const result2 = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey: bucket2 })
      }));
      
      expect(unmarshall(result1.Item!).blockCount).toBe(10);
      expect(unmarshall(result2.Item!).blockCount).toBe(2);
    });
  });
  
  describe('4. TTL Expiration', () => {
    it('should set TTL for automatic bucket cleanup', async () => {
      const ruleId = generateTestId('test-ttl-bucket');
      const hourBucket = Math.floor(Date.now() / 3600000);
      const bucketKey = `${ruleId}:${hourBucket}`;
      const now = Math.floor(Date.now() / 1000);
      const ttl = now + 7200; // 2 hours
      
      testBuckets.push(bucketKey);
      
      await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 1,
          ':ttl': ttl
        })
      }));
      
      const result = await clients.dynamodb.send(new GetItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey })
      }));
      
      const bucket = unmarshall(result.Item!);
      expect(bucket.expiresAt).toBe(ttl);
      
      // Verify TTL is ~2 hours from now
      const hoursUntilExpiration = (ttl - now) / 3600;
      expect(hoursUntilExpiration).toBeCloseTo(2, 1);
    });
  });
});
