/**
 * Adapter Parity Tests
 * 
 * Interface conformance tests that validate all cloud providers (aws/gcp/local)
 * implement the same semantics for:
 * - FPStore: False positive tracking (FPStoreAdapter)
 * - ConsentStore: Consent management (ConsentStoreAdapter)
 * - BlockCounter: Rate limiting with TTL (BlockCounterAdapter)
 * - SecretStore: Nonce storage (SecretStoreAdapter)
 * - ObjectStore: Baseline storage (ObjectStoreAdapter)
 * 
 * These tests ensure multi-cloud abstraction doesn't drift and all adapters
 * maintain interface parity.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { CloudAdapters, CloudConfig, FPEvent } from '../types.js';
import { SecretStoreError } from '../errors.js';
import { randomUUID } from 'crypto';
import { tmpdir } from 'os';
import { rm } from 'fs/promises';
import { join } from 'path';

/**
 * Adapter test factory function
 * 
 * Each provider must implement this function to create adapters for testing.
 */
type AdapterFactory = (config: CloudConfig) => CloudAdapters | Promise<CloudAdapters>;

/**
 * Test cleanup function
 * 
 * Each provider can optionally provide cleanup logic.
 */
type CleanupFunction = () => void | Promise<void>;

/**
 * Provider test configuration
 */
interface ProviderTestConfig {
  name: string;
  factory: AdapterFactory;
  config: CloudConfig;
  cleanup?: CleanupFunction;
  skip?: boolean;
  skipReason?: string;
}

/**
 * Run adapter parity tests for a provider
 * 
 * This function contains all the interface conformance tests that every
 * adapter must pass to ensure parity across providers.
 */
function runAdapterParityTests(providerConfig: ProviderTestConfig) {
  const { name, factory, config, cleanup, skip, skipReason } = providerConfig;
  
  const describeFunc = skip ? describe.skip : describe;
  
  describeFunc(`${name} Adapter Parity`, () => {
    let adapters: CloudAdapters;
    
    beforeAll(async () => {
      if (skip) {
        console.log(`Skipping ${name} tests: ${skipReason}`);
        return;
      }
      adapters = await factory(config);
    });
    
    afterAll(async () => {
      if (cleanup) {
        await cleanup();
      }
    });
    
    describe('FPStore Interface Conformance', () => {
      it('should record and check false positive events', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        const findingId = `finding-${name}-${randomUUID()}`;
        const event: FPEvent = {
          eventId: randomUUID(),
          findingId,
          ruleId,
          ruleVersion: '1.0.0',
          outcome: 'block',
          isFalsePositive: true,
          timestamp: new Date(),
          context: { repo: 'test-repo', branch: 'main', eventType: 'pullrequest' },
        };
        
        await adapters.fpStore.recordEvent(event);
        const isFP = await adapters.fpStore.isFalsePositive(ruleId, findingId);
        
        expect(isFP).toBe(true);
      });
      
      it('should return false for non-existent findings', async () => {
        const isFP = await adapters.fpStore.isFalsePositive(
          `nonexistent-rule-${randomUUID()}`,
          `nonexistent-finding-${randomUUID()}`
        );
        expect(isFP).toBe(false);
      });
      
      it('should get window by count', async () => {
        const ruleId = `rule-${name}-window-${randomUUID()}`;
        
        for (let i = 0; i < 3; i++) {
          const event: FPEvent = {
            eventId: randomUUID(),
            findingId: `finding-${i}-${randomUUID()}`,
            ruleId,
            ruleVersion: '1.0.0',
            outcome: 'block',
            isFalsePositive: i % 2 === 0,
            timestamp: new Date(Date.now() - i * 1000),
            context: { repo: 'test-repo', branch: 'main', eventType: 'pullrequest' },
          };
          await adapters.fpStore.recordEvent(event);
        }
        
        const window = await adapters.fpStore.getWindowByCount(ruleId, 10);
        expect(window.ruleId).toBe(ruleId);
        expect(window.events.length).toBeGreaterThanOrEqual(3);
        expect(window.statistics.total).toBeGreaterThanOrEqual(3);
      });

      it('should compute window statistics correctly', () => {
        const ruleId = 'test-rule';
        const events: FPEvent[] = [
          {
            eventId: '1', ruleId, ruleVersion: '1.0', findingId: 'f1',
            outcome: 'block', isFalsePositive: true, timestamp: new Date(),
            context: { repo: 'r', branch: 'b', eventType: 'pullrequest' },
          },
          {
            eventId: '2', ruleId, ruleVersion: '1.0', findingId: 'f2',
            outcome: 'block', isFalsePositive: false, timestamp: new Date(),
            context: { repo: 'r', branch: 'b', eventType: 'pullrequest' },
          },
        ];

        const window = adapters.fpStore.computeWindow(ruleId, events);
        expect(window.ruleId).toBe(ruleId);
        expect(window.statistics.total).toBe(2);
        expect(window.statistics.falsePositives).toBe(1);
      });
    });
    
    describe('ConsentStore Interface Conformance', () => {
      it('should record and check consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        const repoId = 'test-repo';
        const scope = 'fp_patterns';
        
        await adapters.consentStore.recordConsent({
          orgId,
          repoId,
          scope,
          grantedBy: 'admin-user',
        });
        
        const hasConsent = await adapters.consentStore.hasValidConsent(orgId, repoId, scope);
        expect(hasConsent).toBe(true);
      });
      
      it('should return false for missing consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        const hasConsent = await adapters.consentStore.hasValidConsent(orgId, 'repo', 'fp_patterns');
        expect(hasConsent).toBe(false);
      });
      
      it('should revoke consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        const scope = 'fp_patterns';
        
        await adapters.consentStore.recordConsent({
          orgId,
          scope,
          grantedBy: 'admin-user',
        });
        
        await adapters.consentStore.revokeConsent(orgId, scope);
        
        const hasConsent = await adapters.consentStore.hasValidConsent(orgId, 'any-repo', scope);
        expect(hasConsent).toBe(false);
      });

      it('should get consent records', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        await adapters.consentStore.recordConsent({
          orgId,
          scope: 'fp_patterns',
          grantedBy: 'admin-user',
        });
        
        const records = await adapters.consentStore.getConsent(orgId);
        expect(records).toBeDefined();
      });
    });
    
    describe('BlockCounter Interface Conformance', () => {
      it('should increment and get counter', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        const orgId = `org-${name}-${randomUUID()}`;
        
        const count1 = await adapters.blockCounter.increment(ruleId, orgId);
        expect(count1).toBe(1);
        
        const count2 = await adapters.blockCounter.increment(ruleId, orgId);
        expect(count2).toBe(2);
        
        const count = await adapters.blockCounter.getCount(ruleId, orgId);
        expect(count).toBe(2);
      });
      
      it('should return 0 for non-existent rule', async () => {
        const count = await adapters.blockCounter.getCount(
          `nonexistent-${randomUUID()}`,
          `org-${randomUUID()}`
        );
        expect(count).toBe(0);
      });
      
      it('should check circuit breaker', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        const orgId = `org-${name}-${randomUUID()}`;
        
        // Not broken initially
        let broken = await adapters.blockCounter.isCircuitBroken(ruleId, orgId, 3);
        expect(broken).toBe(false);
        
        // Increment to threshold
        await adapters.blockCounter.increment(ruleId, orgId);
        await adapters.blockCounter.increment(ruleId, orgId);
        await adapters.blockCounter.increment(ruleId, orgId);
        
        broken = await adapters.blockCounter.isCircuitBroken(ruleId, orgId, 3);
        expect(broken).toBe(true);
      });
      
      it('should handle concurrent increments', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        const orgId = `org-${name}-${randomUUID()}`;
        
        const promises = Array.from({ length: 5 }, () => 
          adapters.blockCounter.increment(ruleId, orgId)
        );
        
        await Promise.all(promises);
        
        const count = await adapters.blockCounter.getCount(ruleId, orgId);
        expect(count).toBe(5);
      });
    });
    
    describe('SecretStore Interface Conformance', () => {
      it('should throw SecretStoreError when no nonce exists (empty store)', async () => {
        // Fresh adapter with no nonce data — must throw, not return null
        await expect(adapters.secretStore.getNonce()).rejects.toThrow(SecretStoreError);
      });

      it('should throw SecretStoreError from getNonces when no nonces exist', async () => {
        // Must run before any rotations — adapter store is still empty here
        await expect(adapters.secretStore.getNonces()).rejects.toThrow(SecretStoreError);
      });

      it('should throw with structured error code', async () => {
        try {
          await adapters.secretStore.getNonce();
          fail('Expected SecretStoreError to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(SecretStoreError);
          const secretError = error as SecretStoreError;
          expect(typeof secretError.code).toBe('string');
          expect(typeof secretError.context).toBe('object');
        }
      });

      it('should return NonceConfig after rotation', async () => {
        await adapters.secretStore.rotateNonce('test-nonce-value');
        const nonceConfig = await adapters.secretStore.getNonce();
        expect(typeof nonceConfig).toBe('object');
        expect(nonceConfig.value).toBe('test-nonce-value');
        expect(typeof nonceConfig.loadedAt).toBe('string');
        expect(typeof nonceConfig.source).toBe('string');
      });

      it('should retrieve nonces array after rotation', async () => {
        await adapters.secretStore.rotateNonce('nonce-v1');
        await adapters.secretStore.rotateNonce('nonce-v2');
        const nonces = await adapters.secretStore.getNonces();
        expect(Array.isArray(nonces)).toBe(true);
        expect(nonces.length).toBeGreaterThanOrEqual(2);
        // Newest first
        expect(nonces[0]).toBe('nonce-v2');
      });
    });
    
    describe('ObjectStore Interface Conformance', () => {
      it('should store and retrieve baselines', async () => {
        const repoId = `repo-${name}-${randomUUID()}`;
        const baseline = { version: '1.0', rules: ['MD-001'] };
        
        await adapters.objectStore.putBaseline(repoId, baseline);
        
        const retrieved = await adapters.objectStore.getBaseline(repoId);
        expect(retrieved).toEqual(baseline);
      });
      
      it('should return null for non-existent baselines', async () => {
        const baseline = await adapters.objectStore.getBaseline(`nonexistent-${randomUUID()}`);
        expect(baseline).toBeNull();
      });
      
      it('should list baseline versions', async () => {
        const repoId = `repo-${name}-${randomUUID()}`;
        const baseline = { version: '1.0' };
        
        await adapters.objectStore.putBaseline(repoId, baseline);
        
        const versions = await adapters.objectStore.listBaselineVersions(repoId);
        expect(Array.isArray(versions)).toBe(true);
      });
    });
  });
}

/**
 * Test suite for Local Provider
 */
describe('Adapter Parity Tests', () => {
  describe('Local Provider', () => {
    const testDataDir = join(tmpdir(), `parity-test-local-${Date.now()}`);
    
    runAdapterParityTests({
      name: 'Local',
      factory: async (config) => {
        const { createLocalAdapters } = await import('../local/index.js');
        return createLocalAdapters(config);
      },
      config: {
        provider: 'local',
        localDataDir: testDataDir,
      },
      cleanup: async () => {
        try {
          await rm(testDataDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore cleanup errors
        }
      },
    });
  });
  
  describe('AWS Provider', () => {
    runAdapterParityTests({
      name: 'AWS',
      factory: async (config) => {
        const { createAWSAdapters } = await import('../aws/index.js');
        return createAWSAdapters(config);
      },
      config: {
        provider: 'aws',
        region: 'us-east-1',
      },
      skip: true,
      skipReason: 'AWS credentials not configured in test environment',
    });
  });
  
  describe('GCP Provider', () => {
    runAdapterParityTests({
      name: 'GCP',
      factory: async (config) => {
        const { createGcpAdapters } = await import('../gcp/index.js');
        return createGcpAdapters(config);
      },
      config: {
        provider: 'gcp',
        gcpProjectId: 'test-project',
        region: 'us-central1',
      },
      skip: true,
      skipReason: 'GCP credentials not configured in test environment',
    });
  });
});
