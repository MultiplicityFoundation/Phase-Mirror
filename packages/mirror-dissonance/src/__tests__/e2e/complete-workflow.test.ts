/**
 * E2E Tests: Complete Workflow
 * Tests end-to-end false positive flow with all components
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { config, clients, generateTestId, createTestTimestamp, verifyInfrastructure } from './setup';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { PutItemCommand, QueryCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { loadNonce, clearNonceCache } from '../../nonce/multi-version-loader';
import { redact, isValidRedactedText } from '../../redaction/redactor-multi-version';

describe('E2E: Complete Workflow', () => {
  let testIds: string[] = [];
  
  beforeAll(async () => {
    const infraReady = await verifyInfrastructure();
    if (!infraReady) {
      throw new Error('Infrastructure not ready for E2E tests');
    }
    
    clearNonceCache();
    await loadNonce(clients.ssm, config.parameters.nonceV1);
  });
  
  describe('Scenario: False Positive Submission with Circuit Breaker', () => {
    it('should complete end-to-end false positive flow', async () => {
      const ruleId = generateTestId('workflow-rule');
      const orgId = 'workflow-org-e2e';
      const userId = 'workflow-user-e2e';
      const findingId = generateTestId('workflow-finding');
      const timestamp = createTestTimestamp();
      
      testIds.push(ruleId);
      
      // Step 1: Redact sensitive data in reason
      const rawReason = 'API key sk-abc123 triggered this rule';
      const redactedReason = redact(rawReason, [
        { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[REDACTED-API-KEY]' }
      ]);
      
      expect(isValidRedactedText(redactedReason)).toBe(true);
      expect(redactedReason.value).toBe('API key [REDACTED-API-KEY] triggered this rule');
      
      // Step 2: Check circuit breaker
      const hourBucket = Math.floor(Date.now() / 3600000);
      const bucketKey = `${ruleId}:${hourBucket}`;
      const threshold = 100;
      
      const counterResult = await clients.dynamodb.send(new UpdateItemCommand({
        TableName: config.tables.blockCounter,
        Key: marshall({ bucketKey }),
        UpdateExpression: 'ADD blockCount :inc SET expiresAt = :ttl',
        ExpressionAttributeValues: marshall({
          ':inc': 1,
          ':ttl': Math.floor(Date.now() / 1000) + 7200
        }),
        ReturnValues: 'ALL_NEW'
      }));
      
      const counter = unmarshall(counterResult.Attributes!);
      const isBlocked = counter.blockCount > threshold;
      
      // Step 3: If not blocked, store FP event
      if (!isBlocked) {
        const event = {
          pk: `rule:${ruleId}`,
          sk: `event:${timestamp}#${findingId}`,
          gsi1pk: `finding:${findingId}`,
          gsi1sk: timestamp,
          ruleId,
          findingId,
          orgId,
          userId,
          reason: redactedReason, // Store redacted reason
          severity: 'high',
          createdAt: timestamp,
          expiresAt: Math.floor(Date.now() / 1000) + 7776000
        };
        
        await clients.dynamodb.send(new PutItemCommand({
          TableName: config.tables.fpEvents,
          Item: marshall(event)
        }));
        
        // Verify storage
        const stored = await clients.dynamodb.send(new GetItemCommand({
          TableName: config.tables.fpEvents,
          Key: marshall({
            pk: event.pk,
            sk: event.sk
          })
        }));
        
        const storedEvent = unmarshall(stored.Item!);
        expect(storedEvent.ruleId).toBe(ruleId);
        expect(isValidRedactedText(storedEvent.reason)).toBe(true);
      }
      
      // Step 4: Update drift baseline
      const baseline = {
        ruleId,
        fpCount: counter.blockCount,
        lastUpdated: timestamp,
        environment: config.environment
      };
      
      await clients.s3.send(new PutObjectCommand({
        Bucket: config.buckets.baselines,
        Key: `baselines/${ruleId}.json`,
        Body: JSON.stringify(baseline),
        ContentType: 'application/json'
      }));
      
      // Step 5: Verify complete workflow
      
      // Query FP events by rule
      const fpQuery = await clients.dynamodb.send(new QueryCommand({
        TableName: config.tables.fpEvents,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': `rule:${ruleId}`
        })
      }));
      
      expect(fpQuery.Items!.length).toBeGreaterThan(0);
      
      // Query by finding
      const findingQuery = await clients.dynamodb.send(new QueryCommand({
        TableName: config.tables.fpEvents,
        IndexName: 'FindingIndex',
        KeyConditionExpression: 'gsi1pk = :gsi1pk',
        ExpressionAttributeValues: marshall({
          ':gsi1pk': `finding:${findingId}`
        })
      }));
      
      expect(findingQuery.Items!.length).toBe(1);
      
      // Retrieve baseline
      const baselineResult = await clients.s3.send(new GetObjectCommand({
        Bucket: config.buckets.baselines,
        Key: `baselines/${ruleId}.json`
      }));
      
      const storedBaseline = JSON.parse(await baselineResult.Body!.transformToString());
      expect(storedBaseline.ruleId).toBe(ruleId);
      expect(storedBaseline.fpCount).toBe(counter.blockCount);
      
      console.log('✓ Complete workflow validated:');
      console.log(`  - Redaction: ${redactedReason.redactionHits} hits`);
      console.log(`  - Circuit breaker: ${counter.blockCount}/${threshold}`);
      console.log(`  - FP events stored: ${fpQuery.Items!.length}`);
      console.log(`  - Baseline updated: ${storedBaseline.fpCount} FPs`);
    });
  });
});
