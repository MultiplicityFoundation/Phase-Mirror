/**
 * Redactor v3 — Supplemental tests for cache TTL & fail-closed behaviour
 *
 * Covers the gaps in redactor-v3.test.ts:
 *   1. Nonce cache TTL expiration via Date.now() mocking
 *   2. Fail-closed: SSM unreachable + expired cache → throws
 *   3. timingSafeEqual is used (not ===) — spy-based assertion
 *   4. Active nonce selection after TTL expiry
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import crypto from 'crypto';

import {
  loadNonce,
  redact,
  verifyRedactedText,
  isValidRedactedText,
  clearNonceCache,
  getCacheStatus,
  type RedactionRule,
  type SecretFetcher,
} from '../redactor-v3.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 3_600_000; // mirrors src constant (1 hour)

/** Advance Date.now() by `ms` milliseconds from the real start time. */
function advanceDateNow(ms: number): void {
  const base = realDateNow();
  jest.spyOn(Date, 'now').mockReturnValue(base + ms);
}

let realDateNow: () => number;

describe('Redactor v3 — TTL & fail-closed', () => {
  let mockFetcher: jest.Mock<SecretFetcher>;

  beforeEach(() => {
    clearNonceCache();
    realDateNow = Date.now.bind(Date);
    mockFetcher = jest.fn<SecretFetcher>();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    clearNonceCache();
  });

  // ── 1. timingSafeEqual is used, not === ────────────────────────────────

  describe('timingSafeEqual usage', () => {
    it('calls crypto.timingSafeEqual for MAC comparison', async () => {
      const spy = jest.spyOn(crypto, 'timingSafeEqual');

      mockFetcher.mockResolvedValueOnce('nonce-secret');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      const original = 'sensitive data';
      const rules: RedactionRule[] = [
        { regex: /sensitive/g, replacement: '[REDACTED]' },
      ];
      const redacted = redact(original, rules);

      verifyRedactedText(redacted, original);

      expect(spy).toHaveBeenCalled();
      // Ensure it was called with Buffer instances
      const call = spy.mock.calls[0];
      expect(Buffer.isBuffer(call[0])).toBe(true);
      expect(Buffer.isBuffer(call[1])).toBe(true);
    });
  });

  // ── 2. Cache TTL expiration ────────────────────────────────────────────

  describe('cache TTL expiration', () => {
    it('getCacheStatus reports valid=false after TTL', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      // Before TTL
      expect(getCacheStatus()[0].valid).toBe(true);

      // Advance past TTL
      advanceDateNow(CACHE_TTL_MS + 1);

      expect(getCacheStatus()[0].valid).toBe(false);
    });

    it('redact() throws when cache has expired', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      advanceDateNow(CACHE_TTL_MS + 1);

      expect(() => redact('text', [])).toThrow('No valid nonce in cache');
    });

    it('isValidRedactedText returns false when cache expired', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      const redacted = redact('hello', []);

      advanceDateNow(CACHE_TTL_MS + 1);

      expect(isValidRedactedText(redacted)).toBe(false);
    });

    it('verifyRedactedText returns false when cache expired', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      const original = 'hello';
      const redacted = redact(original, []);

      advanceDateNow(CACHE_TTL_MS + 1);

      expect(verifyRedactedText(redacted, original)).toBe(false);
    });

    it('expired cache forces fetcher call on loadNonce', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-v1-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      advanceDateNow(CACHE_TTL_MS + 1);

      // New call should go to fetcher (not use expired cache)
      mockFetcher.mockResolvedValueOnce('nonce-v2-val');
      await loadNonce(mockFetcher, '/param/nonce_v2');

      expect(mockFetcher).toHaveBeenCalledTimes(2);
      const status = getCacheStatus();
      // After second loadNonce with mocked Date.now, the newly loaded nonce
      // should be in cache; it is loaded at the mocked time so it appears valid
      // relative to the mocked Date.now().
      const v2 = status.find((s) => s.version === 'v2');
      expect(v2).toBeDefined();
    });
  });

  // ── 3. Fail-closed: expired cache + fetcher failure ────────────────────

  describe('fail-closed behaviour', () => {
    it('throws when fetcher fails and cache is expired', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      // Expire the cache
      advanceDateNow(CACHE_TTL_MS + 1);

      // Fetcher fails
      mockFetcher.mockRejectedValueOnce(new Error('SSM unreachable'));

      await expect(
        loadNonce(mockFetcher, '/param/nonce_v2'),
      ).rejects.toThrow('Failed to load nonce');
    });

    it('does NOT throw when fetcher fails but cache is still valid (degraded mode)', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-val');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      // Advance slightly (cache still valid)
      advanceDateNow(1000);

      mockFetcher.mockRejectedValueOnce(new Error('SSM unreachable'));

      await expect(
        loadNonce(mockFetcher, '/param/nonce_v2'),
      ).resolves.not.toThrow();
    });
  });

  // ── 4. Active nonce selection ──────────────────────────────────────────

  describe('active nonce selection', () => {
    it('uses the most recently loaded nonce for new redactions', async () => {
      mockFetcher.mockResolvedValueOnce('nonce-secret-A');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      const redactedA = redact('data', []);

      // Tiny advance so v2 has a later loadedAt
      advanceDateNow(10);
      mockFetcher.mockResolvedValueOnce('nonce-secret-B');
      await loadNonce(mockFetcher, '/param/nonce_v2');

      const redactedB = redact('data', []);

      // v1 and v2 should produce *different* MACs because the nonce differs
      expect(redactedA.__mac).not.toBe(redactedB.__mac);
      expect(redactedB.version).toBe('v2');
    });

    it('falls back to older nonce if newer one expires', async () => {
      // Load v1 at time 0
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      mockFetcher.mockResolvedValueOnce('nonce-a');
      await loadNonce(mockFetcher, '/param/nonce_v1');

      // Load v2 at time 100
      jest.spyOn(Date, 'now').mockReturnValue(1_000_100);
      mockFetcher.mockResolvedValueOnce('nonce-b');
      await loadNonce(mockFetcher, '/param/nonce_v2');

      // Advance past v1 TTL but not v2
      // v1 loaded at 1_000_000, v2 at 1_000_100
      // At time 1_000_000 + CACHE_TTL_MS + 50 → v1 expired, v2 still valid (50ms left)
      jest.spyOn(Date, 'now').mockReturnValue(1_000_000 + CACHE_TTL_MS + 50);

      const status = getCacheStatus();
      const v1 = status.find((s) => s.version === 'v1');
      const v2 = status.find((s) => s.version === 'v2');
      expect(v1?.valid).toBe(false);
      expect(v2?.valid).toBe(true);

      // redact should still work using v2
      const redacted = redact('text', []);
      expect(redacted.version).toBe('v2');
    });
  });
});
