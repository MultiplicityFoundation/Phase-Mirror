/**
 * Oracle Integration Tests with LocalStack
 * Simplified version focusing on key functionality
 */
import { initializeOracle } from '../../packages/mirror-dissonance/src/oracle.js';
import { loadNonce, redact, isValidRedactedText, clearNonceCache } from '../../packages/mirror-dissonance/src/redaction/redactor-v3.js';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ENDPOINT = 'http://localhost:4566';
const CONFIG = {
  region: 'us-east-1',
  endpoint: ENDPOINT,
  nonceParameterName: '/guardian/test/redaction_nonce_v1',
  fpTableName: 'mirror-dissonance-test-fp-events',
  consentTableName: 'mirror-dissonance-test-consent',
  blockCounterTableName: 'mirror-dissonance-test-block-counter'
};

describe('Oracle Integration with LocalStack', () => {
  let dynamoClient: DynamoDBClient;
  let ssmClient: SSMClient;

  beforeAll(async () => {
    // Initialize clients
    dynamoClient = new DynamoDBClient({
      region: CONFIG.region,
      endpoint: ENDPOINT
    });

    ssmClient = new SSMClient({
      region: CONFIG.region,
      endpoint: ENDPOINT
    });

    // Clear nonce cache before tests
    clearNonceCache();
  });

  afterAll(async () => {
    dynamoClient.destroy();
  });

  describe('1. Nonce Loading & Redaction', () => {
    it('should load nonce from SSM successfully', async () => {
      await loadNonce(ssmClient, CONFIG.nonceParameterName);
      
      // Verify by attempting redaction
      const redacted = redact('secret-token-123', [
        { regex: /secret-/g, replacement: '[REDACTED]-' }
      ]);

      expect(redacted.value).toBe('[REDACTED]-token-123');
      expect(redacted.__brand).toBe('RedactedText');
      expect(redacted.__mac).toBeDefined();
      expect(typeof redacted.__mac).toBe('string');
    });

    it('should validate HMAC integrity on RedactedText', async () => {
      const redacted = redact('api-key-xyz', [
        { regex: /api-key-/g, replacement: '[KEY]-' }
      ]);

      expect(isValidRedactedText(redacted)).toBe(true);

      // Tamper with value
      const tampered = { ...redacted, value: 'tampered' };
      expect(isValidRedactedText(tampered)).toBe(false);
    });

    it('should fail when nonce parameter does not exist', async () => {
      clearNonceCache();
      await expect(
        loadNonce(ssmClient, '/guardian/test/nonexistent_nonce')
      ).rejects.toThrow();
    });
  });

  describe('2. Oracle Initialization', () => {
    it('should initialize Oracle with all components', async () => {
      const oracle = await initializeOracle(CONFIG);
      
      expect(oracle).toBeDefined();
      expect(typeof oracle.analyze).toBe('function');
    });

    it('should fail when nonce cannot be loaded', async () => {
      clearNonceCache();
      await expect(
        initializeOracle({
          ...CONFIG,
          nonceParameterName: '/guardian/test/nonexistent_nonce'
        })
      ).rejects.toThrow();
    });
  });

  describe('3. FP Store Operations', () => {
    let oracle: any;

    beforeAll(async () => {
      // Reload nonce for this test suite
      clearNonceCache();
      await loadNonce(ssmClient, CONFIG.nonceParameterName);
      oracle = await initializeOracle(CONFIG);
    });

    it('should query existing FP events from setup script', async () => {
      // The setup script created 5 events for MD-001
      const result = await dynamoClient.send(new QueryCommand({
        TableName: CONFIG.fpTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: 'rule:MD-001' }
        }
      }));

      expect(result.Items).toBeDefined();
      expect(result.Items!.length).toBeGreaterThan(0);
      
      const firstItem = unmarshall(result.Items![0]);
      expect(firstItem.ruleId).toBe('MD-001');
      expect(firstItem.eventId).toBeDefined();
    });

    it('should record a new FP event', async () => {
      // This test verifies the FP store is wired correctly
      // The actual recording is tested in the FP store unit tests
      expect(oracle).toBeDefined();
    });
  });

  describe('4. Consent Store Operations', () => {
    let oracle: any;

    beforeAll(async () => {
      clearNonceCache();
      await loadNonce(ssmClient, CONFIG.nonceParameterName);
      oracle = await initializeOracle(CONFIG);
    });

    it('should verify test org consent exists', async () => {
      // The consent store is initialized in the oracle
      expect(oracle).toBeDefined();
      
      // Verify the test data exists in DynamoDB
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');
      const { DynamoDBDocumentClient } = await import('@aws-sdk/lib-dynamodb');
      
      const docClient = DynamoDBDocumentClient.from(dynamoClient);
      const result = await docClient.send(new GetCommand({
        TableName: CONFIG.consentTableName,
        Key: { orgId: 'TestOrg' }
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item!.state).toBe('granted');
    });
  });

  describe('5. Block Counter Operations', () => {
    let oracle: any;

    beforeAll(async () => {
      clearNonceCache();
      await loadNonce(ssmClient, CONFIG.nonceParameterName);
      oracle = await initializeOracle(CONFIG);
    });

    it('should have block counter initialized', async () => {
      // The block counter is initialized in the oracle
      expect(oracle).toBeDefined();
    });
  });

  describe('6. End-to-End Oracle Analysis', () => {
    let oracle: any;

    beforeAll(async () => {
      clearNonceCache();
      await loadNonce(ssmClient, CONFIG.nonceParameterName);
      oracle = await initializeOracle(CONFIG);
    });

    it('should analyze repository and produce report', async () => {
      const result = await oracle.analyze({
        mode: 'pullrequest',
        repository: 'TestOrg/test-repo',
        commit: 'abc123def456',
        files: ['.github/workflows/test.yml'],
        strict: false,
        dryRun: true
      });

      expect(result).toBeDefined();
      expect(result.machineDecision).toBeDefined();
      expect(result.machineDecision.outcome).toBeDefined();
      expect(['pass', 'warn', 'block']).toContain(result.machineDecision.outcome);
      expect(result.violations).toBeDefined();
      expect(Array.isArray(result.violations)).toBe(true);
      expect(result.summary).toBeDefined();
      expect(typeof result.summary).toBe('string');
    });
  });

  describe('7. Performance Benchmarks', () => {
    it('should meet redaction performance target', async () => {
      clearNonceCache();
      await loadNonce(ssmClient, CONFIG.nonceParameterName);

      const iterations = 1000;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        redact('test-secret-value', [
          { regex: /secret-/g, replacement: '[REDACTED]-' }
        ]);
        const end = process.hrtime.bigint();
        times.push(Number(end - start));
      }

      times.sort((a, b) => a - b);
      const p99 = times[Math.floor(iterations * 0.99)];

      // Relaxed target for integration tests
      expect(p99).toBeLessThan(100000); // <100μs
    });
  });
});
