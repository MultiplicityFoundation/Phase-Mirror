/**
 * Nonce Rotation Integration Tests
 * Tests multi-version nonce support and grace period behavior
 */
import { loadNonce, redact, isValidRedactedText, clearNonceCache, getCacheStatus } from '../../packages/mirror-dissonance/src/redaction/redactor-v3.js';
import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';

const ENDPOINT = 'http://localhost:4566';
const v1Param = '/guardian/test/rotation_nonce_v1';
const v2Param = '/guardian/test/rotation_nonce_v2';

describe('Nonce Rotation with Grace Period', () => {
  let ssmClient: SSMClient;

  beforeAll(() => {
    ssmClient = new SSMClient({
      region: 'us-east-1',
      endpoint: ENDPOINT
    });
  });

  beforeEach(() => {
    // Clear cache before each test
    clearNonceCache();
  });

  afterAll(async () => {
    // Cleanup parameters
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: v1Param }));
    } catch (e) {
      // Ignore if doesn't exist
    }
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: v2Param }));
    } catch (e) {
      // Ignore if doesn't exist
    }
  });

  it('should support multi-version nonce loading', async () => {
    // Step 1: Create v1 nonce
    const nonce1 = 'a'.repeat(64);
    await ssmClient.send(new PutParameterCommand({
      Name: v1Param,
      Value: nonce1,
      Type: 'SecureString',
      Overwrite: true
    }));

    await loadNonce(ssmClient, v1Param);

    // Create text with v1
    const text1 = redact('secret-value-1', [
      { regex: /secret-/g, replacement: '[REDACTED]-' }
    ]);

    expect(text1.value).toBe('[REDACTED]-value-1');
    expect(isValidRedactedText(text1)).toBe(true);
    expect(text1.version).toBe('v1');

    // Step 2: Create v2 nonce (rotation event)
    const nonce2 = 'b'.repeat(64);
    await ssmClient.send(new PutParameterCommand({
      Name: v2Param,
      Value: nonce2,
      Type: 'SecureString',
      Overwrite: true
    }));

    // Step 3: Load v2 nonce (grace period - both v1 and v2 active)
    await loadNonce(ssmClient, v2Param);

    // Check cache status
    const cacheStatus = getCacheStatus();
    expect(cacheStatus.length).toBeGreaterThanOrEqual(2); // Should have both v1 and v2

    // Step 4: Old text still validates during grace period
    expect(isValidRedactedText(text1)).toBe(true);

    // Step 5: New text uses v2
    const text2 = redact('secret-value-2', [
      { regex: /secret-/g, replacement: '[REDACTED]-' }
    ]);

    expect(text2.value).toBe('[REDACTED]-value-2');
    expect(isValidRedactedText(text2)).toBe(true);
    expect(text2.version).toBe('v2');

    // Both texts should validate during grace period
    expect(isValidRedactedText(text1)).toBe(true);
    expect(isValidRedactedText(text2)).toBe(true);
  });

  it('should handle single nonce version', async () => {
    const nonce = 'c'.repeat(64);
    await ssmClient.send(new PutParameterCommand({
      Name: v1Param,
      Value: nonce,
      Type: 'SecureString',
      Overwrite: true
    }));

    await loadNonce(ssmClient, v1Param);

    const text = redact('test-value', [
      { regex: /test-/g, replacement: '[TEST]-' }
    ]);

    expect(text.value).toBe('[TEST]-value');
    expect(isValidRedactedText(text)).toBe(true);
  });

  it('should fail gracefully when no nonce is loaded', () => {
    clearNonceCache();

    expect(() => {
      redact('test-value', [
        { regex: /test-/g, replacement: '[TEST]-' }
      ]);
    }).toThrow(/No valid nonce in cache/);
  });

  it('should report cache status correctly', async () => {
    const nonce = 'd'.repeat(64);
    await ssmClient.send(new PutParameterCommand({
      Name: v1Param,
      Value: nonce,
      Type: 'SecureString',
      Overwrite: true
    }));

    await loadNonce(ssmClient, v1Param);

    const status = getCacheStatus();
    expect(status.length).toBeGreaterThan(0);
    expect(status[0].version).toBeDefined();
    expect(status[0].age).toBeGreaterThanOrEqual(0);
    expect(status[0].valid).toBe(true);
  });
});
