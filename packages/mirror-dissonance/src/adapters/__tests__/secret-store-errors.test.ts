/**
 * SecretStore Error Propagation Tests
 *
 * Validates that all SecretStoreAdapter implementations throw
 * SecretStoreError on failure instead of returning null/[].
 *
 * Phase 0 contract: adapters throw structured errors, L0 callers
 * implement fail-closed or fail-open behavior.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createLocalAdapters } from '../local/index.js';
import { CloudAdapters, CloudConfig } from '../types.js';
import { SecretStoreError } from '../errors.js';
import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

describe('SecretStore Error Propagation', () => {
  let adapters: CloudAdapters;
  let testDataDir: string;

  beforeEach(() => {
    testDataDir = `/tmp/test-secret-errors-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const config: CloudConfig = {
      provider: 'local',
      localDataDir: testDataDir,
    };
    adapters = createLocalAdapters(config);
  });

  afterEach(async () => {
    try {
      await rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getNonce() error behavior', () => {
    it('should throw SecretStoreError with NONCE_NOT_FOUND when no nonce exists', async () => {
      await expect(adapters.secretStore.getNonce()).rejects.toThrow(SecretStoreError);

      try {
        await adapters.secretStore.getNonce();
      } catch (error) {
        expect(error).toBeInstanceOf(SecretStoreError);
        const secretError = error as SecretStoreError;
        expect(secretError.code).toBe('NONCE_NOT_FOUND');
        expect(secretError.context.source).toBe('local-file');
        expect(secretError.name).toBe('SecretStoreError');
      }
    });

    it('should throw SecretStoreError with READ_FAILED on corrupt data', async () => {
      // Write corrupt JSON to the nonce file
      await mkdir(testDataDir, { recursive: true });
      await writeFile(join(testDataDir, 'nonce.json'), 'not valid json{{{');

      await expect(adapters.secretStore.getNonce()).rejects.toThrow(SecretStoreError);

      try {
        await adapters.secretStore.getNonce();
      } catch (error) {
        const secretError = error as SecretStoreError;
        expect(secretError.code).toBe('READ_FAILED');
        expect(secretError.context.source).toBe('local-file');
        expect(secretError.context.originalError).toBeDefined();
      }
    });

    it('should return NonceConfig on success (not null)', async () => {
      // Write a valid nonce
      await mkdir(testDataDir, { recursive: true });
      await writeFile(
        join(testDataDir, 'nonce.json'),
        JSON.stringify([{ value: 'test-nonce-value', createdAt: new Date().toISOString(), version: 1 }]),
      );

      const nonceConfig = await adapters.secretStore.getNonce();
      expect(typeof nonceConfig).toBe('object');
      expect(nonceConfig.value).toBe('test-nonce-value');
      expect(nonceConfig.source).toBe('local-file');
      expect(typeof nonceConfig.loadedAt).toBe('string');
    });
  });

  describe('getNonces() error behavior', () => {
    it('should throw SecretStoreError when no nonces exist', async () => {
      await expect(adapters.secretStore.getNonces()).rejects.toThrow(SecretStoreError);

      try {
        await adapters.secretStore.getNonces();
      } catch (error) {
        const secretError = error as SecretStoreError;
        expect(secretError.code).toBe('NONCE_NOT_FOUND');
      }
    });

    it('should return nonce array on success', async () => {
      await mkdir(testDataDir, { recursive: true });
      await writeFile(
        join(testDataDir, 'nonce.json'),
        JSON.stringify([
          { value: 'nonce-v1', createdAt: new Date().toISOString(), version: 1 },
          { value: 'nonce-v2', createdAt: new Date().toISOString(), version: 2 },
        ]),
      );

      const nonces = await adapters.secretStore.getNonces();
      expect(nonces).toEqual(['nonce-v2', 'nonce-v1']); // newest first
    });
  });

  describe('rotateNonce() error behavior', () => {
    it('should successfully rotate nonce', async () => {
      await adapters.secretStore.rotateNonce('first-nonce');
      const nonceConfig = await adapters.secretStore.getNonce();
      expect(nonceConfig.value).toBe('first-nonce');
      expect(nonceConfig.source).toBe('local-file');
    });

    it('should create incrementing versions', async () => {
      await adapters.secretStore.rotateNonce('nonce-v1');
      await adapters.secretStore.rotateNonce('nonce-v2');

      const nonces = await adapters.secretStore.getNonces();
      expect(nonces[0]).toBe('nonce-v2');
      expect(nonces[1]).toBe('nonce-v1');
    });

    it('should retrieve latest after rotation', async () => {
      await adapters.secretStore.rotateNonce('old-nonce');
      await adapters.secretStore.rotateNonce('new-nonce');

      const nonceConfig = await adapters.secretStore.getNonce();
      expect(nonceConfig.value).toBe('new-nonce');
      expect(nonceConfig.source).toBe('local-file');
      expect(typeof nonceConfig.loadedAt).toBe('string');
    });
  });

  describe('error inheritance', () => {
    it('SecretStoreError should be instanceof AdapterError', async () => {
      const { AdapterError } = await import('../errors.js');

      try {
        await adapters.secretStore.getNonce();
      } catch (error) {
        expect(error).toBeInstanceOf(SecretStoreError);
        expect(error).toBeInstanceOf(AdapterError);
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('should preserve error context for debugging', async () => {
      try {
        await adapters.secretStore.getNonce();
      } catch (error) {
        const secretError = error as SecretStoreError;

        // Should have structured context for observability
        expect(secretError.message).toBeTruthy();
        expect(secretError.code).toBeTruthy();
        expect(secretError.context).toBeDefined();
        expect(typeof secretError.context).toBe('object');
      }
    });
  });

  describe('L0 caller patterns', () => {
    it('fail-closed: caller catches and re-throws domain error', async () => {
      // Simulates NonceBindingService behavior
      const performCriticalOperation = async () => {
        let masterNonce: string;

        try {
          const nonceConfig = await adapters.secretStore.getNonce();
          masterNonce = nonceConfig.value;
        } catch (error) {
          // L0 fail-closed: cannot proceed without nonce
          throw new Error(`Critical operation failed: nonce unavailable`);
        }

        return { success: true, nonce: masterNonce };
      };

      await expect(performCriticalOperation()).rejects.toThrow(
        'Critical operation failed: nonce unavailable',
      );
    });

    it('fail-open: caller catches and returns safe default', async () => {
      // Simulates analytics path behavior
      const performNonCriticalOperation = async () => {
        try {
          const nonceConfig = await adapters.secretStore.getNonce();
          return { available: true, nonce: nonceConfig.value };
        } catch {
          // L0 fail-open: analytics can proceed without nonce
          return { available: false, nonce: null };
        }
      };

      const result = await performNonCriticalOperation();
      expect(result.available).toBe(false);
      expect(result.nonce).toBeNull();
    });
  });
});
