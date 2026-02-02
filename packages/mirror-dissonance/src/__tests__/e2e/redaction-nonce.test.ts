/**
 * E2E Tests: Redaction with SSM Nonce
 * Tests nonce loading, redaction, and validation with real SSM
 */

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { config, clients, verifyInfrastructure } from './setup';
import {
  loadNonce,
  getLatestNonce,
  clearNonceCache
} from '../../nonce/multi-version-loader';
import {
  redact,
  isValidRedactedText
} from '../../redaction/redactor-multi-version';

describe('E2E: Redaction with SSM Nonce', () => {
  beforeAll(async () => {
    const infraReady = await verifyInfrastructure();
    if (!infraReady) {
      throw new Error('Infrastructure not ready for E2E tests');
    }
  });
  
  beforeEach(() => {
    clearNonceCache();
  });
  
  describe('1. Nonce Loading from SSM', () => {
    it('should load nonce from staging SSM parameter', async () => {
      const record = await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      expect(record.nonce).toMatch(/^[0-9a-f]{64}$/i);
      expect(record.version).toBe(1);
      expect(record.parameterName).toBe(config.parameters.nonceV1);
      expect(record.issuedAt).toBeGreaterThan(0);
    });
    
    it('should validate nonce format from SSM', async () => {
      const response = await clients.ssm.send(new GetParameterCommand({
        Name: config.parameters.nonceV1,
        WithDecryption: true
      }));
      
      expect(response.Parameter?.Value).toBeDefined();
      expect(response.Parameter!.Value).toMatch(/^[0-9a-f]{64}$/i);
      expect(response.Parameter?.Type).toBe('SecureString');
    });
    
    it('should cache nonce after loading', async () => {
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      const latest = getLatestNonce();
      expect(latest.version).toBe(1);
      expect(latest.nonce).toMatch(/^[0-9a-f]{64}$/i);
    });
  });
  
  describe('2. Redaction with Real Nonce', () => {
    it('should redact sensitive data using SSM nonce', async () => {
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      const input = 'User API key: sk-abc123def456, password: secret123';
      const redacted = redact(input, [
        { regex: /sk-[a-zA-Z0-9]+/g, replacement: '[REDACTED-API-KEY]' },
        { regex: /password: \S+/g, replacement: 'password: [REDACTED]' }
      ]);
      
      expect(redacted.value).toBe('User API key: [REDACTED-API-KEY], password: [REDACTED]');
      expect(redacted.nonceVersion).toBe(1);
      expect(redacted.redactionHits).toBe(2);
      expect(redacted.brand).toMatch(/^[0-9a-f]{64}$/i);
      expect(redacted.mac).toMatch(/^[0-9a-f]{64}$/i);
    });
    
    it('should validate redacted text with SSM nonce', async () => {
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      const input = 'Confidential: token-xyz789';
      const redacted = redact(input, [
        { regex: /token-\S+/g, replacement: '[REDACTED-TOKEN]' }
      ]);
      
      expect(isValidRedactedText(redacted)).toBe(true);
    });
    
    it('should detect tampered redacted text', async () => {
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      const original = redact('secret data', []);
      
      // Tamper with value
      const tampered = {
        ...original,
        value: 'modified data'
      };
      
      expect(isValidRedactedText(tampered)).toBe(false);
    });
  });
  
  describe('3. Performance with Real SSM', () => {
    it('should load nonce within acceptable time', async () => {
      const start = Date.now();
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      const duration = Date.now() - start;
      
      // SSM calls typically <200ms
      expect(duration).toBeLessThan(500);
    });
    
    it('should redact efficiently after nonce cached', async () => {
      await loadNonce(clients.ssm, config.parameters.nonceV1);
      
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        redact(`test-${i}`, [
          { regex: /test-/g, replacement: '[REDACTED]-' }
        ]);
      }
      
      const duration = Date.now() - start;
      const avgMs = duration / iterations;
      
      expect(avgMs).toBeLessThan(5); // <5ms per redaction
    });
  });
});
