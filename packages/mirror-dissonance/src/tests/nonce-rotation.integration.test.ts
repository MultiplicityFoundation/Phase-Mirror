/**
 * Integration Test 1 — Nonce Rotation
 *
 * Validates the full nonce rotation lifecycle against LocalStack SSM:
 *   1. Create v1 nonce → loadNonce → redact → validate
 *   2. Create v2 nonce → enter grace period (both v1 & v2 in cache)
 *   3. Grace period: v1 text still validates; new text uses v2
 *   4. Delete v1, reload v2 only → v2 still validates; v1 fails
 *   5. Degraded mode: SSM unreachable + fresh cache → still works
 *   6. Fail-closed: SSM unreachable + expired cache → throws
 *
 * Prerequisites:
 *   docker run -d --name localstack -p 4566:4566 localstack/localstack
 *   export AWS_ENDPOINT=http://localhost:4566
 *
 * Run:
 *   pnpm test --testPathPattern=nonce-rotation.integration
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import {
  SSMClient,
  PutParameterCommand,
  DeleteParameterCommand,
  GetParameterCommand,
} from '@aws-sdk/client-ssm';
import {
  loadNonce,
  redact,
  isValidRedactedText,
  verifyRedactedText,
  clearNonceCache,
  getCacheStatus,
  type SecretFetcher,
  type RedactedText,
} from '../redaction/redactor-v3.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const ENDPOINT =
  process.env.AWS_ENDPOINT ||
  process.env.LOCALSTACK_ENDPOINT ||
  'http://localhost:4566';

const CREDENTIALS = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
};

const REGION = 'us-east-1';

const testParamV1 = '/phase-mirror/test/rotation_nonce_v1';
const testParamV2 = '/phase-mirror/test/rotation_nonce_v2';

// ---------------------------------------------------------------------------
// SSM → SecretFetcher adapter
// ---------------------------------------------------------------------------

/**
 * Create a SecretFetcher backed by a real SSM client.
 * This bridges the cloud-agnostic `loadNonce(fetcher, param)` API with
 * the AWS SSM SDK used by LocalStack.
 */
function makeSSMFetcher(client: SSMClient): SecretFetcher {
  return async (parameterName: string): Promise<string> => {
    const result = await client.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      }),
    );
    return result.Parameter?.Value ?? '';
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Nonce Rotation Integration (LocalStack SSM)', () => {
  let ssmClient: SSMClient;
  let fetcher: SecretFetcher;
  let localStackAvailable = false;

  // ── Setup / teardown ──────────────────────────────────────────────────

  beforeAll(async () => {
    ssmClient = new SSMClient({
      region: REGION,
      endpoint: ENDPOINT,
      credentials: CREDENTIALS,
    });

    fetcher = makeSSMFetcher(ssmClient);

    // Health-check: try a benign GetParameter call
    try {
      await ssmClient.send(
        new GetParameterCommand({ Name: '/test/health-check' }),
      );
      localStackAvailable = true;
    } catch (error: any) {
      if (error.name === 'ParameterNotFound') {
        // LocalStack answered; it just doesn't have this param → OK
        localStackAvailable = true;
      } else {
        console.warn(
          `LocalStack not reachable at ${ENDPOINT} — integration tests will be skipped.`,
        );
        localStackAvailable = false;
      }
    }
  });

  beforeEach(() => {
    clearNonceCache();
  });

  afterAll(async () => {
    // Best-effort cleanup of SSM parameters
    for (const name of [testParamV1, testParamV2]) {
      try {
        await ssmClient.send(new DeleteParameterCommand({ Name: name }));
      } catch {
        /* ignore */
      }
    }
    ssmClient.destroy();
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  /** Skip the current test if LocalStack is not reachable. */
  function requireLocalStack(): void {
    if (!localStackAvailable) {
      // eslint-disable-next-line no-console
      console.log('Skipping: LocalStack not available');
      return;
    }
  }

  /** Create (or overwrite) an SSM SecureString parameter. */
  async function putParam(name: string, value: string): Promise<void> {
    await ssmClient.send(
      new PutParameterCommand({
        Name: name,
        Value: value,
        Type: 'SecureString',
        Overwrite: true,
      }),
    );
  }

  /** Delete an SSM parameter (ignores ParameterNotFound). */
  async function deleteParam(name: string): Promise<void> {
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: name }));
    } catch {
      /* ignore */
    }
  }

  // ── Scenario: v1 → v2 rotation with grace period ──────────────────────

  it('full rotation lifecycle: v1 → grace period → v2 only', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    // ── Step 1: Create v1 nonce in SSM and load into cache ──────────
    await putParam(testParamV1, 'nonce-v1-test-secret');
    await loadNonce(fetcher, testParamV1);

    // Cache should contain exactly v1
    let status = getCacheStatus();
    expect(status).toHaveLength(1);
    expect(status[0].version).toBe('v1');
    expect(status[0].valid).toBe(true);

    // Redact a string → text1
    const originalText1 = 'secret-token-alpha';
    const text1: RedactedText = redact(originalText1, [
      { regex: /secret-token-alpha/g, replacement: '[REDACTED]' },
    ]);
    expect(text1.value).toBe('[REDACTED]');
    expect(text1.version).toBe('v1');
    expect(text1.__mac).toHaveLength(64); // SHA-256 hex
    expect(isValidRedactedText(text1)).toBe(true);
    expect(verifyRedactedText(text1, originalText1)).toBe(true);

    // ── Step 2: Create v2 nonce in SSM ──────────────────────────────
    await putParam(testParamV2, 'nonce-v2-test-secret');

    // ── Step 3: Load both v1 & v2 → grace period ────────────────────
    await loadNonce(fetcher, testParamV1);
    await loadNonce(fetcher, testParamV2);

    status = getCacheStatus();
    expect(status.length).toBeGreaterThanOrEqual(2);
    const versions = status.map((s) => s.version).sort();
    expect(versions).toContain('v1');
    expect(versions).toContain('v2');

    // ── Step 4: v1 text still validates during grace period ──────────
    expect(isValidRedactedText(text1)).toBe(true);
    expect(verifyRedactedText(text1, originalText1)).toBe(true);

    // ── Step 5: New redaction uses v2 (most recently loaded) ─────────
    const originalText2 = 'another-sensitive-payload';
    const text2: RedactedText = redact(originalText2, [
      { regex: /another-sensitive-payload/g, replacement: '[REDACTED]' },
    ]);
    expect(text2.version).toBe('v2');
    expect(isValidRedactedText(text2)).toBe(true);
    expect(verifyRedactedText(text2, originalText2)).toBe(true);

    // ── Step 6: Delete v1, clear cache, reload v2 only ───────────────
    await deleteParam(testParamV1);
    clearNonceCache();
    await loadNonce(fetcher, testParamV2);

    status = getCacheStatus();
    expect(status).toHaveLength(1);
    expect(status[0].version).toBe('v2');

    // ── Step 7: v2 text still validates; v1 text fails ───────────────
    expect(isValidRedactedText(text2)).toBe(true);
    expect(verifyRedactedText(text2, originalText2)).toBe(true);

    // v1 text can no longer validate (nonce not in cache)
    expect(isValidRedactedText(text1)).toBe(true); // structural check passes (v2 in cache)
    expect(verifyRedactedText(text1, originalText1)).toBe(false); // MAC mismatch
  }, 30_000);

  // ── Degraded mode: SSM unreachable but cache is fresh ────────────────

  it('degraded mode: SSM unreachable + fresh cache → still works', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    // Load nonce into cache via real SSM
    await putParam(testParamV1, 'nonce-degraded-test');
    await loadNonce(fetcher, testParamV1);

    // Create a fetcher pointing to a non-existent endpoint
    const badClient = new SSMClient({
      region: REGION,
      endpoint: 'http://localhost:1', // will fail
      credentials: CREDENTIALS,
      requestHandler: {
        // 1-second timeouts so the test doesn't hang
        connectionTimeout: 1000,
        requestTimeout: 1000,
      } as any,
    });
    const badFetcher = makeSSMFetcher(badClient);

    // loadNonce should NOT throw — cache is still valid
    await expect(
      loadNonce(badFetcher, testParamV2),
    ).resolves.not.toThrow();

    // Redaction still works using the cached v1 nonce
    const original = 'degraded-mode-data';
    const redacted = redact(original, []);
    expect(isValidRedactedText(redacted)).toBe(true);
    expect(verifyRedactedText(redacted, original)).toBe(true);

    badClient.destroy();
  }, 30_000);

  // ── Fail-closed: SSM unreachable + expired cache → throws ────────────

  it('fail-closed: SSM unreachable + expired cache → throws', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    // Load a nonce first
    await putParam(testParamV1, 'nonce-failclosed-test');
    await loadNonce(fetcher, testParamV1);

    // Expire the cache by advancing Date.now past TTL
    const realDateNow = Date.now;
    const CACHE_TTL_MS = 3_600_000; // 1 hour
    jest.spyOn(Date, 'now').mockReturnValue(realDateNow() + CACHE_TTL_MS + 1);

    // Create a fetcher pointing to a non-existent endpoint
    const badClient = new SSMClient({
      region: REGION,
      endpoint: 'http://localhost:1',
      credentials: CREDENTIALS,
      requestHandler: {
        connectionTimeout: 1000,
        requestTimeout: 1000,
      } as any,
    });
    const badFetcher = makeSSMFetcher(badClient);

    // loadNonce MUST throw — cache expired AND fetcher fails
    await expect(
      loadNonce(badFetcher, testParamV2),
    ).rejects.toThrow('Failed to load nonce');

    // redact should also throw — no valid nonce in cache
    expect(() => redact('test', [])).toThrow('No valid nonce in cache');

    badClient.destroy();

    // Restore
    jest.restoreAllMocks();
  }, 30_000);

  // ── Cache TTL validation ─────────────────────────────────────────────

  it('cache reports valid=true within TTL, valid=false after', async () => {
    requireLocalStack();
    if (!localStackAvailable) return;

    await putParam(testParamV1, 'nonce-ttl-test');
    await loadNonce(fetcher, testParamV1);

    // Immediately after load — valid
    let status = getCacheStatus();
    expect(status[0].valid).toBe(true);
    expect(status[0].age).toBeLessThan(2000);

    // Mock time to 59 minutes (still valid)
    const realDateNow = Date.now;
    jest.spyOn(Date, 'now').mockReturnValue(realDateNow() + 59 * 60 * 1000);
    status = getCacheStatus();
    expect(status[0].valid).toBe(true);

    // Mock time to 61 minutes (expired)
    jest.spyOn(Date, 'now').mockReturnValue(realDateNow() + 61 * 60 * 1000);
    status = getCacheStatus();
    expect(status[0].valid).toBe(false);

    jest.restoreAllMocks();
  }, 30_000);

  // ── No nonce loaded → throws ─────────────────────────────────────────

  it('redact throws when no nonce is loaded', () => {
    clearNonceCache();

    expect(() => {
      redact('test-value', [
        { regex: /test-/g, replacement: '[TEST]-' },
      ]);
    }).toThrow(/No valid nonce in cache/);
  });
});
