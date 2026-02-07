// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * E2E Tests: Drift Baseline Storage
 * Tests S3 baseline storage, retrieval, and versioning
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectVersionsCommand } from '@aws-sdk/client-s3';
import { config, clients, generateTestId, verifyInfrastructure } from './setup';

describe('E2E: Drift Baseline Storage', () => {
  let testKeys: string[] = [];
  
  beforeAll(async () => {
    const infraReady = await verifyInfrastructure();
    if (!infraReady) {
      throw new Error('Infrastructure not ready for E2E tests');
    }
  });
  
  afterAll(async () => {
    // Cleanup test objects
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    for (const key of testKeys) {
      try {
        await clients.s3.send(new DeleteObjectCommand({
          Bucket: config.buckets.baselines,
          Key: key
        }));
      } catch (error) {
        console.warn('Cleanup warning:', error);
      }
    }
  });
  
  describe('1. Baseline Storage', () => {
    it('should store baseline in S3', async () => {
      const ruleId = generateTestId('test-baseline-rule');
      const key = `baselines/${ruleId}.json`;
      
      testKeys.push(key);
      
      const baseline = {
        ruleId,
        thresholds: {
          error: 10,
          warning: 5
        },
        metadata: {
          createdAt: new Date().toISOString(),
          environment: config.environment
        }
      };
      
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key,
        Body: JSON.stringify(baseline),
        ContentType: 'application/json'
      }));
      
      // Verify storage
      const result = await clients.s3.send(new GetObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key
      }));
      
      const body = await result.Body!.transformToString();
      const stored = JSON.parse(body);
      
      expect(stored.ruleId).toBe(ruleId);
      expect(stored.thresholds.error).toBe(10);
    });
    
    it('should support versioning', async () => {
      const ruleId = generateTestId('test-versioned-rule');
      const key = `baselines/${ruleId}.json`;
      
      testKeys.push(key);
      
      // Version 1
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key,
        Body: JSON.stringify({ ruleId, version: 1 }),
        ContentType: 'application/json'
      }));
      
      // Version 2
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key,
        Body: JSON.stringify({ ruleId, version: 2 }),
        ContentType: 'application/json'
      }));
      
      // List versions
      const versions = await clients.s3.send(new ListObjectVersionsCommand({
        Bucket: config.buckets.baselines,
        Prefix: key
      }));
      
      expect(versions.Versions).toBeDefined();
      expect(versions.Versions!.length).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('2. Drift Detection', () => {
    it('should compare current state to baseline', async () => {
      const ruleId = generateTestId('test-drift-rule');
      const key = `baselines/${ruleId}.json`;
      
      testKeys.push(key);
      
      // Store baseline
      const baseline = {
        ruleId,
        expectedCount: 100,
        threshold: 10
      };
      
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key,
        Body: JSON.stringify(baseline),
        ContentType: 'application/json'
      }));
      
      // Retrieve baseline
      const result = await clients.s3.send(new GetObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key
      }));
      
      const stored = JSON.parse(await result.Body!.transformToString());
      
      // Simulate current state
      const currentCount = 115;
      const drift = Math.abs(currentCount - stored.expectedCount);
      const driftPercentage = (drift / stored.expectedCount) * 100;
      
      expect(drift).toBe(15);
      expect(driftPercentage).toBeCloseTo(15, 0);
      expect(drift).toBeGreaterThan(stored.threshold);
    });
  });
  
  describe('3. Encryption & Security', () => {
    it('should verify S3 server-side encryption', async () => {
      const ruleId = generateTestId('test-encryption-rule');
      const key = `baselines/${ruleId}.json`;
      
      testKeys.push(key);
      
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key,
        Body: JSON.stringify({ ruleId }),
        ContentType: 'application/json'
      }));
      
      const result = await clients.s3.send(new GetObjectCommand({
        Bucket: config.buckets.baselines,
        Key: key
      }));
      
      // S3 returns encryption headers
      expect(result.ServerSideEncryption).toBeDefined();
      expect(['AES256', 'aws:kms']).toContain(result.ServerSideEncryption);
    });
  });
});
