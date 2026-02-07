// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * Cryptographic Operations Benchmarks
 * Tests nonce loading, HMAC, redaction performance
 */

import { SSMClient } from '@aws-sdk/client-ssm';
import { benchmark, BenchmarkResult, generateReport } from './framework.js';
import {
  loadNonce,
  getLatestNonce,
  clearNonceCache
} from '../../nonce/multi-version-loader.js';
import {
  redact,
  isValidRedactedText
} from '../../redaction/redactor-multi-version.js';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';
const NONCE_PARAM = `/guardian/${ENVIRONMENT}/redaction_nonce_v1`;

describe('Benchmark: Cryptographic Operations', () => {
  let ssmClient: SSMClient;
  const results: BenchmarkResult[] = [];

  beforeAll(async () => {
    ssmClient = new SSMClient({ region: REGION });
    clearNonceCache();
    await loadNonce(ssmClient, NONCE_PARAM);
  });

  describe('1. Nonce Operations', () => {
    it('should benchmark nonce loading from SSM', async () => {
      const result = await benchmark(
        'SSM Nonce Load',
        async () => {
          clearNonceCache();
          await loadNonce(ssmClient, NONCE_PARAM);
        },
        { iterations: 50, warmupIterations: 5, logProgress: true }
      );

      results.push(result);

      // Target: <500ms
      expect(result.avgMs).toBeLessThan(500);
      expect(result.p95Ms).toBeLessThan(750);
    });

    it('should benchmark cached nonce retrieval', async () => {
      const result = await benchmark(
        'Cached Nonce Retrieval',
        () => {
          getLatestNonce();
        },
        { iterations: 10000, logProgress: true }
      );

      results.push(result);

      // Target: <0.1ms (should be near-instant)
      expect(result.avgMs).toBeLessThan(0.1);
    });
  });

  describe('2. Redaction Operations', () => {
    it('should benchmark single pattern redaction', async () => {
      const testData = 'User API key: sk-abc123def456xyz789';

      const result = await benchmark(
        'Single Pattern Redaction',
        () => {
          redact(testData, [
            { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[REDACTED-API-KEY]' }
          ]);
        },
        { iterations: 10000, logProgress: true }
      );

      results.push(result);

      // Target: <5ms
      expect(result.avgMs).toBeLessThan(5);
      expect(result.p95Ms).toBeLessThan(10);
    });

    it('should benchmark multi-pattern redaction', async () => {
      const testData = 'Email: user@example.com, Phone: +1-555-1234, SSN: 123-45-6789, IP: 192.168.1.1';

      const result = await benchmark(
        'Multi-Pattern Redaction',
        () => {
          redact(testData, [
            { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
            { regex: /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
            { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
            { regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP]' }
          ]);
        },
        { iterations: 5000, logProgress: true }
      );

      results.push(result);

      // Target: <10ms
      expect(result.avgMs).toBeLessThan(10);
    });

    it('should benchmark large text redaction', async () => {
      const largeText = `
Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
User email: alice@example.com, API Key: sk-prod-abc123xyz789.
Phone: +1-555-0100, SSN: 123-45-6789.
`.repeat(100); // ~10KB text

      const result = await benchmark(
        'Large Text Redaction (10KB)',
        () => {
          redact(largeText, [
            { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
            { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[API-KEY]' },
            { regex: /\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, replacement: '[PHONE]' },
            { regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' }
          ]);
        },
        { iterations: 1000, logProgress: true }
      );

      results.push(result);

      // Target: <50ms for 10KB
      expect(result.avgMs).toBeLessThan(50);
    });
  });

  describe('3. Validation Operations', () => {
    it('should benchmark HMAC validation', async () => {
      const testData = 'sensitive data';
      const redacted = redact(testData, []);

      const result = await benchmark(
        'HMAC Validation',
        () => {
          isValidRedactedText(redacted);
        },
        { iterations: 10000, logProgress: true }
      );

      results.push(result);

      // Target: <1ms
      expect(result.avgMs).toBeLessThan(1);
    });

    it('should benchmark tamper detection', async () => {
      const original = redact('secret', []);
      const tampered = { ...original, value: 'modified' };

      const result = await benchmark(
        'Tamper Detection',
        () => {
          isValidRedactedText(tampered);
        },
        { iterations: 10000, logProgress: true }
      );

      results.push(result);

      expect(result.avgMs).toBeLessThan(1);
    });
  });

  afterAll(() => {
    const report = generateReport(results);
    console.log(report);
  });
});
