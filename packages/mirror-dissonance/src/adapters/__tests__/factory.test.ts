/**
 * Tests for Adapter Factory
 */

import { createAdapters, loadCloudConfig } from '../factory.js';
import { CloudConfig } from '../config.js';

describe('Adapter Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should create local adapters when provider is local', async () => {
    const config: CloudConfig = {
      provider: 'local',
    };

    const adapters = await createAdapters(config);

    expect(adapters.fpStore).toBeDefined();
    expect(adapters.secretStore).toBeDefined();
    expect(adapters.blockCounter).toBeDefined();
    expect(adapters.objectStore).toBeDefined();
    expect(adapters.consentStore).toBeDefined();
  });

  it('should create AWS adapters when provider is aws', async () => {
    const config: CloudConfig = {
      provider: 'aws',
      region: 'us-east-1',
      endpoint: 'http://localhost:4566', // LocalStack
    };

    const adapters = await createAdapters(config);

    expect(adapters.fpStore).toBeDefined();
    expect(adapters.secretStore).toBeDefined();
    expect(adapters.blockCounter).toBeDefined();
    expect(adapters.objectStore).toBeDefined();
    expect(adapters.consentStore).toBeDefined();
  });

  it('should load config from environment', () => {
    process.env.CLOUD_PROVIDER = 'local';
    process.env.FP_TABLE_NAME = 'test-fp-table';

    const config = loadCloudConfig();

    expect(config.provider).toBe('local');
    expect(config.fpTableName).toBe('test-fp-table');
  });

  it('should default to aws provider', () => {
    delete process.env.CLOUD_PROVIDER;

    const config = loadCloudConfig();

    expect(config.provider).toBe('aws');
  });

  it('should throw error for unsupported providers', async () => {
    const config: CloudConfig = {
      provider: 'gcp' as any,
    };

    await expect(createAdapters(config)).rejects.toThrow('GCP adapters not yet implemented');
  });
});
