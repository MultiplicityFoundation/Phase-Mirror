/**
 * Unit tests for multi-version nonce loader and redactor
 * Tests the new multi-version implementation
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { 
  loadNonce, 
  getValidNonces, 
  getLatestNonce,
  evictNonceVersion,
  clearNonceCache,
  getNonceCacheStats,
  setNonceTTL,
  type SecretFetcher
} from '../nonce/multi-version-loader.js';
import {
  redact,
  isValidRedactedText,
  getRedactedTextVersion
} from '../redaction/redactor-multi-version.js';

describe('Multi-Version Nonce Loader', () => {
  let mockFetcher: jest.Mock<SecretFetcher>;

  beforeEach(() => {
    clearNonceCache();
    mockFetcher = jest.fn<SecretFetcher>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadNonce', () => {
    it('should load and cache a nonce version', async () => {
      mockFetcher.mockResolvedValue('a'.repeat(64));

      const record = await loadNonce(mockFetcher, '/test/nonce_v1');

      expect(record.version).toBe(1);
      expect(record.nonce).toBe('a'.repeat(64));
      expect(record.parameterName).toBe('/test/nonce_v1');
    });

    it('should extract version from parameter name', async () => {
      mockFetcher.mockResolvedValue('b'.repeat(64));

      const record = await loadNonce(mockFetcher, '/guardian/staging/redaction_nonce_v5');

      expect(record.version).toBe(5);
    });

    it('should throw error for invalid parameter name format', async () => {
      mockFetcher.mockResolvedValue('c'.repeat(64));
      
      await expect(
        loadNonce(mockFetcher, '/test/nonce_invalid')
      ).rejects.toThrow('Cannot extract version from parameter name');
    });

    it('should validate nonce format', async () => {
      mockFetcher.mockResolvedValue('invalid-nonce');
      
      await expect(
        loadNonce(mockFetcher, '/test/nonce_v1')
      ).rejects.toThrow('Invalid nonce format');
    });

    it('should handle multiple versions in cache', async () => {
      mockFetcher.mockResolvedValue('a'.repeat(64));
      
      await loadNonce(mockFetcher, '/test/nonce_v1');
      
      mockFetcher.mockResolvedValue('b'.repeat(64));
      
      await loadNonce(mockFetcher, '/test/nonce_v2');

      const stats = getNonceCacheStats();
      expect(stats.count).toBe(2);
      expect(stats.versions).toEqual([2, 1]); // Sorted descending
    });
  });

  describe('getValidNonces', () => {
    it('should return all valid cached nonces', async () => {
      mockFetcher.mockResolvedValue('a'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

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
      mockFetcher.mockResolvedValue('a'.repeat(64));
      
      await loadNonce(mockFetcher, '/test/nonce_v1');
      await loadNonce(mockFetcher, '/test/nonce_v3');
      await loadNonce(mockFetcher, '/test/nonce_v2');

      const latest = getLatestNonce();
      expect(latest.version).toBe(3);
    });
  });

  describe('evictNonceVersion', () => {
    it('should remove specific version from cache', async () => {
      mockFetcher.mockResolvedValue('a'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');
      await loadNonce(mockFetcher, '/test/nonce_v2');

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
  let mockFetcher: jest.Mock<SecretFetcher>;

  beforeEach(() => {
    clearNonceCache();
    mockFetcher = jest.fn<SecretFetcher>();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('redact', () => {
    it('should redact text using latest nonce', async () => {
      mockFetcher.mockResolvedValue('a'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

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
      mockFetcher.mockResolvedValue('b'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

      const redacted = redact('secret1 and secret2 and secret3', [
        { regex: /secret\d+/g, replacement: '[REDACTED]' }
      ]);

      expect(redacted.value).toBe('[REDACTED] and [REDACTED] and [REDACTED]');
      expect(redacted.redactionHits).toBe(3);
    });
  });

  describe('isValidRedactedText', () => {
    it('should validate RedactedText created with same nonce', async () => {
      mockFetcher.mockResolvedValue('c'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

      const redacted = redact('test', []);

      expect(isValidRedactedText(redacted)).toBe(true);
    });

    it('should validate RedactedText with any valid cached nonce (grace period)', async () => {
      mockFetcher.mockResolvedValue('d'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

      const redacted = redact('test', []);

      // Load v2
      mockFetcher.mockResolvedValue('e'.repeat(64));
      await loadNonce(mockFetcher, '/test/nonce_v2');

      // Should still validate with v1 in cache
      expect(isValidRedactedText(redacted)).toBe(true);
    });

    it('should reject tampered RedactedText', async () => {
      mockFetcher.mockResolvedValue('f'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v1');

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
      mockFetcher.mockResolvedValue('f'.repeat(64));

      await loadNonce(mockFetcher, '/test/nonce_v3');

      const redacted = redact('test', []);

      expect(getRedactedTextVersion(redacted)).toBe(3);
    });

    it('should return null for invalid RedactedText', () => {
      expect(getRedactedTextVersion({} as any)).toBe(null);
    });
  });
});
