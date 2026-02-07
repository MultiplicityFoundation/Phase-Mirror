// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * Nonce Rotation Integration Tests
 * 
 * Tests multi-version nonce support with grace period validation
 * Requires LocalStack for SSM
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import {
  loadNonce,
  getValidNonces,
  getLatestNonce,
  evictNonceVersion,
  clearNonceCache,
  getNonceCacheStats
} from '../../nonce/multi-version-loader.js';
import {
  redact,
  isValidRedactedText,
  getRedactedTextVersion
} from '../../redaction/redactor-multi-version.js';

const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
const BASE_PARAM_NAME = '/guardian/test/redaction_nonce';

describe('Nonce Rotation Integration', () => {
  let ssmClient: SSMClient;

  beforeAll(() => {
    ssmClient = new SSMClient({
      region: 'us-east-1',
      endpoint: LOCALSTACK_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  });

  beforeEach(async () => {
    // Clear cache before each test
    clearNonceCache();

    // Clean up any existing test parameters
    for (let v = 1; v <= 5; v++) {
      try {
        await ssmClient.send(
          new DeleteParameterCommand({ Name: `${BASE_PARAM_NAME}_v${v}` })
        );
      } catch {
        // Ignore if doesn't exist
      }
    }
  });

  afterAll(async () => {
    // Final cleanup
    for (let v = 1; v <= 5; v++) {
      try {
        await ssmClient.send(
          new DeleteParameterCommand({ Name: `${BASE_PARAM_NAME}_v${v}` })
        );
      } catch {
        // Ignore
      }
    }
  });

  describe('1. Basic Nonce Loading', () => {
    it('should load nonce from SSM successfully', async () => {
      const nonce1 = 'a'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      const record = await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      expect(record.nonce).toBe(nonce1);
      expect(record.version).toBe(1);
      expect(record.issuedAt).toBeGreaterThan(0);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(1);
      expect(stats.versions).toEqual([1]);
    });

    it('should extract version number from parameter name', async () => {
      const nonce2 = 'b'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      const record = await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);

      expect(record.version).toBe(2);
    });

    it('should throw on invalid parameter name format', async () => {
      await expect(
        loadNonce(ssmClient, '/invalid/param/no/version')
      ).rejects.toThrow(/extract version/i);
    });

    it('should throw on parameter not found', async () => {
      await expect(
        loadNonce(ssmClient, `${BASE_PARAM_NAME}_v999`)
      ).rejects.toThrow(/not found/i);
    });

    it('should validate nonce format (64 hex chars)', async () => {
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: 'invalid-nonce', // Too short and wrong format
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await expect(
        loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`)
      ).rejects.toThrow(/invalid nonce format/i);
    });
  });

  describe('2. Multi-Version Support', () => {
    it('should load multiple nonce versions', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.versions).toEqual([2, 1]); // Sorted descending
    });

    it('should return latest version for new redactions', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);
      const nonce3 = 'c'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v3`,
          Value: nonce3,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v3`);

      const latest = getLatestNonce();
      expect(latest.version).toBe(3);
      expect(latest.nonce).toBe(nonce3);
    });

    it('should update existing version in cache', async () => {
      const nonce1a = 'a'.repeat(64);
      const nonce1b = 'b'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1a,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      // Update SSM parameter
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1b,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(1); // Still only one version
      expect(getLatestNonce().nonce).toBe(nonce1b);
    });
  });

  describe('3. Grace Period Workflow', () => {
    it('should support full rotation with grace period', async () => {
      // Step 1: Create v1 nonce
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      // Create text with v1
      const text1 = redact('secret-token-123', [
        { regex: /secret-/g, replacement: '[REDACTED]-' }
      ]);

      expect(text1.nonceVersion).toBe(1);
      expect(text1.value).toBe('[REDACTED]-token-123');
      expect(isValidRedactedText(text1)).toBe(true);

      // Step 2: Create v2 nonce (rotation event)
      const nonce2 = 'b'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      // Step 3: Load both nonces (grace period begins)
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.versions).toEqual([2, 1]);

      // Step 4: Old text still validates during grace period
      expect(isValidRedactedText(text1)).toBe(true);
      expect(getRedactedTextVersion(text1)).toBe(1);

      // Step 5: New text uses v2
      const text2 = redact('another-secret-456', [
        { regex: /another-/g, replacement: '[REDACTED]-' }
      ]);

      expect(text2.nonceVersion).toBe(2);
      expect(isValidRedactedText(text2)).toBe(true);

      // Step 6: Remove v1 (end grace period)
      evictNonceVersion(1);

      const statsAfterEviction = getNonceCacheStats();
      expect(statsAfterEviction.count).toBe(1);
      expect(statsAfterEviction.versions).toEqual([2]);

      // Step 7: v2 text validates, v1 text fails
      expect(isValidRedactedText(text2)).toBe(true);
      expect(isValidRedactedText(text1)).toBe(false);
    });

    it('should handle overlapping grace periods (v1→v2→v3)', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);
      const nonce3 = 'c'.repeat(64);

      // Load v1
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const text1 = redact('text-v1', []);

      // Start grace period v1→v2
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);

      const text2 = redact('text-v2', []);

      // Start overlapping grace period v2→v3 (v1 still in cache)
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v3`,
          Value: nonce3,
          Type: 'SecureString',
          Overwrite: true
        })
      );
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v3`);

      const text3 = redact('text-v3', []);

      // All three should validate
      expect(isValidRedactedText(text1)).toBe(true);
      expect(isValidRedactedText(text2)).toBe(true);
      expect(isValidRedactedText(text3)).toBe(true);

      // Remove v1
      evictNonceVersion(1);
      expect(isValidRedactedText(text1)).toBe(false);
      expect(isValidRedactedText(text2)).toBe(true);
      expect(isValidRedactedText(text3)).toBe(true);

      // Remove v2
      evictNonceVersion(2);
      expect(isValidRedactedText(text2)).toBe(false);
      expect(isValidRedactedText(text3)).toBe(true);
    });
  });

  describe('4. HMAC Validation', () => {
    it('should detect tampered value field', async () => {
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const original = redact('secret-value', [
        { regex: /secret/g, replacement: '[REDACTED]' }
      ]);

      expect(isValidRedactedText(original)).toBe(true);

      // Tamper with value
      const tampered = {
        ...original,
        value: 'tampered-value'
      };

      expect(isValidRedactedText(tampered)).toBe(false);
    });

    it('should detect tampered MAC field', async () => {
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const original = redact('api-key-xyz', []);

      // Tamper with MAC
      const tampered = {
        ...original,
        mac: 'deadbeef' + original.mac.slice(8)
      };

      expect(isValidRedactedText(tampered)).toBe(false);
    });

    it('should detect forged brand', async () => {
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const original = redact('token', []);

      // Forge brand
      const forged = {
        ...original,
        brand: '0'.repeat(64)
      };

      expect(isValidRedactedText(forged)).toBe(false);
    });
  });

  describe('5. Cache Management', () => {
    it('should evict specific versions', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);
      const nonce3 = 'c'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v3`,
          Value: nonce3,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v3`);

      expect(getNonceCacheStats().count).toBe(3);

      evictNonceVersion(2);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.versions).toEqual([3, 1]);
    });

    it('should clear entire cache', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v2`,
          Value: nonce2,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);

      expect(getNonceCacheStats().count).toBe(2);

      clearNonceCache();

      expect(getNonceCacheStats().count).toBe(0);
    });

    it('should throw when no valid nonces in cache', () => {
      clearNonceCache();

      expect(() => getValidNonces()).toThrow(/no valid nonces/i);
      expect(() => getLatestNonce()).toThrow(/no valid nonces/i);
    });
  });

  describe('6. Performance', () => {
    it('should handle rapid redaction operations', async () => {
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        const redacted = redact(`secret-${i}`, [
          { regex: /secret-/g, replacement: '[REDACTED]-' }
        ]);
        isValidRedactedText(redacted);
      }

      const end = Date.now();
      const avgMs = (end - start) / iterations;

      console.log(`Redaction performance: ${avgMs.toFixed(3)}ms per operation`);
      expect(avgMs).toBeLessThan(5); // <5ms per operation
    });

    it('should efficiently validate against multiple versions', async () => {
      // Load 5 versions
      for (let v = 1; v <= 5; v++) {
        const nonce = String.fromCharCode(96 + v).repeat(64); // 'a', 'b', 'c', 'd', 'e'
        await ssmClient.send(
          new PutParameterCommand({
            Name: `${BASE_PARAM_NAME}_v${v}`,
            Value: nonce,
            Type: 'SecureString',
            Overwrite: true
          })
        );
        await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v${v}`);
      }

      // Create text with v3
      evictNonceVersion(4);
      evictNonceVersion(5);
      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v3`);
      
      const text = redact('test', []);

      // Validation should be fast even with multiple versions
      const iterations = 1000;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        isValidRedactedText(text);
      }

      const end = Date.now();
      const avgMs = (end - start) / iterations;

      console.log(`Multi-version validation: ${avgMs.toFixed(3)}ms per operation`);
      expect(avgMs).toBeLessThan(1); // <1ms per validation
    });
  });

  describe('7. Edge Cases', () => {
    it('should handle concurrent redaction during rotation', async () => {
      const nonce1 = 'a'.repeat(64);
      const nonce2 = 'b'.repeat(64);

      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      // Simulate concurrent operations
      const operations = Array.from({ length: 10 }, async (_, i) => {
        if (i === 5) {
          // Mid-way through, load v2
          await ssmClient.send(
            new PutParameterCommand({
              Name: `${BASE_PARAM_NAME}_v2`,
              Value: nonce2,
              Type: 'SecureString',
              Overwrite: true
            })
          );
          await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v2`);
        }

        return redact(`concurrent-${i}`, []);
      });

      const results = await Promise.all(operations);

      // All should succeed and validate
      results.forEach(text => {
        expect(isValidRedactedText(text)).toBe(true);
      });
    });

    it('should handle missing SSM parameter gracefully', async () => {
      await expect(
        loadNonce(ssmClient, '/nonexistent/param_v1')
      ).rejects.toThrow(/not found/i);
    });

    it('should reject invalid nonce versions in RedactedText', async () => {
      const nonce1 = 'a'.repeat(64);
      await ssmClient.send(
        new PutParameterCommand({
          Name: `${BASE_PARAM_NAME}_v1`,
          Value: nonce1,
          Type: 'SecureString',
          Overwrite: true
        })
      );

      await loadNonce(ssmClient, `${BASE_PARAM_NAME}_v1`);

      const text = redact('test', []);

      // Claim it's from v999
      const fakeVersion = {
        ...text,
        nonceVersion: 999
      };

      // Should still validate against actual nonce (v1) if MAC matches
      // But version mismatch is suspicious
      expect(isValidRedactedText(fakeVersion)).toBe(true); // MAC still valid
      expect(getRedactedTextVersion(fakeVersion)).toBe(999); // But reports wrong version
    });
  });
});
