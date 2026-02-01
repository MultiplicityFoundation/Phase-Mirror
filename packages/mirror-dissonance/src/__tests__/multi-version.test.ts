/**
 * Unit tests for multi-version nonce loader and redactor
 * Tests the new multi-version implementation
 */
import { 
  loadNonce, 
  getValidNonces, 
  getLatestNonce,
  evictNonceVersion,
  clearNonceCache,
  getNonceCacheStats,
  setNonceTTL
} from '../nonce/multi-version-loader.js';
import {
  redact,
  isValidRedactedText,
  getRedactedTextVersion
} from '../redaction/redactor-multi-version.js';
import { 
  SSMClient, 
  GetParameterCommand
} from '@aws-sdk/client-ssm';

// Mock AWS SDK
jest.mock('@aws-sdk/client-ssm');

describe('Multi-Version Nonce Loader', () => {
  let mockSend: jest.Mock;
  let ssmClient: SSMClient;

  beforeEach(() => {
    clearNonceCache();
    mockSend = jest.fn();
    ssmClient = new SSMClient({ region: 'us-east-1' });
    (ssmClient.send as jest.Mock) = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadNonce', () => {
    it('should load and cache a nonce version', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64) // 64 hex characters
        }
      });

      const record = await loadNonce(ssmClient, '/test/nonce_v1');

      expect(record.version).toBe(1);
      expect(record.nonce).toBe('a'.repeat(64));
      expect(record.parameterName).toBe('/test/nonce_v1');
    });

    it('should extract version from parameter name', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'b'.repeat(64)
        }
      });

      const record = await loadNonce(ssmClient, '/guardian/staging/redaction_nonce_v5');

      expect(record.version).toBe(5);
    });

    it('should throw error for invalid parameter name format', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'c'.repeat(64)
        }
      });
      
      await expect(
        loadNonce(ssmClient, '/test/nonce_invalid')
      ).rejects.toThrow('Cannot extract version from parameter name');
    });

    it('should validate nonce format', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'invalid-nonce'
        }
      });
      
      await expect(
        loadNonce(ssmClient, '/test/nonce_v1')
      ).rejects.toThrow('Invalid nonce format');
    });

    it('should handle multiple versions in cache', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64)
        }
      });
      
      await loadNonce(ssmClient, '/test/nonce_v1');
      
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'b'.repeat(64)
        }
      });
      
      await loadNonce(ssmClient, '/test/nonce_v2');

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.versions).toEqual([2, 1]); // Sorted descending
    });
  });

  describe('getValidNonces', () => {
    it('should return all valid cached nonces', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const validNonces = getValidNonces();
      expect(validNonces.length).toBe(1);
      expect(validNonces[0].version).toBe(1);
    });

    it('should throw error when no valid nonces exist', () => {
      expect(() => getValidNonces()).toThrow(
        'No valid nonces in cache'
      );
    });
  });

  describe('getLatestNonce', () => {
    it('should return the highest version nonce', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64)
        }
      });
      
      await loadNonce(ssmClient, '/test/nonce_v1');
      await loadNonce(ssmClient, '/test/nonce_v3');
      await loadNonce(ssmClient, '/test/nonce_v2');

      const latest = getLatestNonce();
      expect(latest.version).toBe(3);
    });
  });

  describe('evictNonceVersion', () => {
    it('should remove specific version from cache', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');
      await loadNonce(ssmClient, '/test/nonce_v2');

      evictNonceVersion(1);

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(1);
      expect(stats.versions).toEqual([2]);
    });

    it('should handle evicting non-existent version', () => {
      expect(() => evictNonceVersion(99)).not.toThrow();
    });
  });
});

describe('Multi-Version Redactor', () => {
  let mockSend: jest.Mock;
  let ssmClient: SSMClient;

  beforeEach(() => {
    clearNonceCache();
    mockSend = jest.fn();
    ssmClient = new SSMClient({ region: 'us-east-1' });
    (ssmClient.send as jest.Mock) = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('redact', () => {
    it('should redact text using latest nonce', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'a'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const redacted = redact('secret-value', [
        { regex: /secret-\w+/, replacement: '[REDACTED]' }
      ]);

      expect(redacted.value).toBe('[REDACTED]');
      expect(redacted.nonceVersion).toBe(1);
      expect(redacted.redactionHits).toBe(1);
      expect(redacted.brand).toBeTruthy();
      expect(redacted.mac).toBeTruthy();
    });

    it('should track multiple redaction hits', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'b'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const redacted = redact('secret1 and secret2 and secret3', [
        { regex: /secret\d+/g, replacement: '[REDACTED]' }
      ]);

      expect(redacted.value).toBe('[REDACTED] and [REDACTED] and [REDACTED]');
      expect(redacted.redactionHits).toBe(3);
    });
  });

  describe('isValidRedactedText', () => {
    it('should validate RedactedText created with same nonce', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'c'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const redacted = redact('test', []);

      expect(isValidRedactedText(redacted)).toBe(true);
    });

    it('should validate RedactedText with any valid cached nonce (grace period)', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'd'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const redacted = redact('test', []);

      // Load v2
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'e'.repeat(64)
        }
      });
      await loadNonce(ssmClient, '/test/nonce_v2');

      // Should still validate with v1 in cache
      expect(isValidRedactedText(redacted)).toBe(true);
    });

    it('should reject tampered RedactedText', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'f'.repeat(64)
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v1');

      const redacted = redact('test', []);
      
      // Tamper with value
      const tampered = { ...redacted, value: 'modified' };

      expect(isValidRedactedText(tampered)).toBe(false);
    });

    it('should reject invalid structure', () => {
      expect(isValidRedactedText(null)).toBe(false);
      expect(isValidRedactedText({})).toBe(false);
      expect(isValidRedactedText({ brand: 'test' })).toBe(false);
    });
  });

  describe('getRedactedTextVersion', () => {
    it('should return version for valid RedactedText', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'f'.repeat(64) // Use 'f' instead of 'g' - valid hex char
        }
      });

      await loadNonce(ssmClient, '/test/nonce_v3');

      const redacted = redact('test', []);

      expect(getRedactedTextVersion(redacted)).toBe(3);
    });

    it('should return null for invalid RedactedText', () => {
      expect(getRedactedTextVersion({} as any)).toBe(null);
    });
  });
});
