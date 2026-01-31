/**
 * Integration tests for nonce rotation
 * Tests rotation, grace periods, fail-closed, and degraded modes
 * 
 * Prerequisites: LocalStack running on localhost:4566
 * Run: docker run -d -p 4566:4566 localstack/localstack:latest
 */
import { 
  loadNonce, 
  redact, 
  isValidRedactedText, 
  clearNonceCache,
  getCacheStatus
} from '../redaction/redactor-v3';
import { 
  SSMClient, 
  PutParameterCommand, 
  DeleteParameterCommand,
  GetParameterCommand
} from '@aws-sdk/client-ssm';

describe('Nonce Rotation Integration', () => {
  let ssmClient: SSMClient;
  const testParamV1 = '/test/nonce_v1';
  const testParamV2 = '/test/nonce_v2';

  beforeAll(() => {
    // Configure SSM client for LocalStack
    ssmClient = new SSMClient({ 
      region: 'us-east-1', 
      endpoint: 'http://localhost:4566',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  });

  beforeEach(() => {
    // Clear cache before each test
    clearNonceCache();
  });

  afterAll(async () => {
    // Cleanup - try to delete parameters but don't fail if they don't exist
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: testParamV1 }));
    } catch (e) {
      // Parameter may not exist
    }
    try {
      await ssmClient.send(new DeleteParameterCommand({ Name: testParamV2 }));
    } catch (e) {
      // Parameter may not exist
    }
  });

  test('Rotation: v1 → v2 with grace period', async () => {
    // Step 1: Create v1 nonce
    await ssmClient.send(new PutParameterCommand({
      Name: testParamV1,
      Value: 'nonce-v1-test-secret',
      Type: 'SecureString',
      Overwrite: true,
    }));

    await loadNonce(ssmClient, testParamV1);

    // Create RedactedText with v1
    const text1 = redact('secret-token', [{ 
      regex: /secret-\w+/, 
      replacement: '[REDACTED]' 
    }]);
    expect(isValidRedactedText(text1)).toBe(true);
    expect(text1.value).toBe('[REDACTED]');
    expect(text1.version).toBe('v1');

    // Step 2: Create v2 nonce
    await ssmClient.send(new PutParameterCommand({
      Name: testParamV2,
      Value: 'nonce-v2-test-secret',
      Type: 'SecureString',
      Overwrite: true,
    }));

    // Step 3: Load both nonces (grace period)
    await loadNonce(ssmClient, testParamV1);
    await loadNonce(ssmClient, testParamV2);

    // Step 4: Verify v1 text still validates
    expect(isValidRedactedText(text1)).toBe(true);

    // Step 5: New text uses v2 (most recent)
    const text2 = redact('another-secret', [{ 
      regex: /another-\w+/, 
      replacement: '[REDACTED]' 
    }]);
    expect(isValidRedactedText(text2)).toBe(true);
    expect(text2.version).toBe('v2');

    // Step 6: Clear cache and reload only v2 (end grace period)
    clearNonceCache();
    await loadNonce(ssmClient, testParamV2);

    // Step 7: Verify v2 text still validates, v1 removed from cache
    expect(isValidRedactedText(text2)).toBe(true);
    
    // Check cache status - should only have v2
    const cacheStatus = getCacheStatus();
    expect(cacheStatus.length).toBe(1);
    expect(cacheStatus[0].version).toBe('v2');
  }, 30000);

  test('Fail-closed: SSM unreachable with expired cache', async () => {
    // Load nonce
    await ssmClient.send(new PutParameterCommand({
      Name: testParamV1,
      Value: 'nonce-test-secret',
      Type: 'SecureString',
      Overwrite: true,
    }));
    
    await loadNonce(ssmClient, testParamV1);

    // Simulate cache expiry by mocking Date.now
    const realDateNow = Date.now;
    const oneHourOneMinuteAgo = realDateNow() - 3660000; // 61 minutes ago
    jest.spyOn(Date, 'now').mockReturnValue(oneHourOneMinuteAgo);

    // Clear the actual cache to simulate expiry
    clearNonceCache();

    // Attempt to redact with stale cache + unreachable SSM
    // Should throw because cache is expired
    expect(() => {
      redact('test', []);
    }).toThrow(/cache expired/);

    // Restore Date.now
    Date.now = realDateNow;
  }, 30000);

  test('Degraded mode: SSM unreachable with valid cache', async () => {
    // Load nonce into cache
    await ssmClient.send(new PutParameterCommand({
      Name: testParamV1,
      Value: 'nonce-test-secret',
      Type: 'SecureString',
      Overwrite: true,
    }));
    
    await loadNonce(ssmClient, testParamV1);

    // Spy on console.warn to verify degraded mode is logged
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    // Create a new SSM client that will fail
    const failingClient = new SSMClient({ 
      region: 'us-east-1', 
      endpoint: 'http://localhost:9999', // Non-existent endpoint
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });

    // Attempt to reload nonce (should use cache in degraded mode)
    await loadNonce(failingClient, testParamV1);

    // Verify degraded mode was activated
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('degraded mode')
    );

    // Should still be able to redact using cached nonce
    const text = redact('test-value', []);
    expect(isValidRedactedText(text)).toBe(true);

    warnSpy.mockRestore();
  }, 30000);

  test('Cache validation respects TTL', async () => {
    // Load nonce
    await ssmClient.send(new PutParameterCommand({
      Name: testParamV1,
      Value: 'nonce-test-secret',
      Type: 'SecureString',
      Overwrite: true,
    }));
    
    await loadNonce(ssmClient, testParamV1);

    // Verify cache is valid
    let cacheStatus = getCacheStatus();
    expect(cacheStatus[0].valid).toBe(true);
    expect(cacheStatus[0].age).toBeLessThan(1000); // Less than 1 second old

    // Mock time to 59 minutes later (still valid)
    const realDateNow = Date.now;
    jest.spyOn(Date, 'now').mockReturnValue(realDateNow() + 59 * 60 * 1000);
    
    cacheStatus = getCacheStatus();
    expect(cacheStatus[0].valid).toBe(true);

    // Mock time to 61 minutes later (expired)
    Date.now = jest.fn().mockReturnValue(realDateNow() + 61 * 60 * 1000);
    
    cacheStatus = getCacheStatus();
    expect(cacheStatus[0].valid).toBe(false);

    // Restore Date.now
    Date.now = realDateNow;
  });
});
