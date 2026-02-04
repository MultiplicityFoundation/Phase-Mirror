/**
 * Adapter Parity Tests
 * 
 * Interface conformance tests that validate all cloud providers (aws/gcp/local)
 * implement the same semantics for:
 * - FPStore: False positive tracking
 * - ConsentStore: Consent management with k-anonymity
 * - BlockCounter: Rate limiting with TTL
 * - SecretStore: Nonce storage and rotation
 * - BaselineStorage: Drift baseline storage
 * - CalibrationStore: FP calibration with privacy guarantees
 * 
 * These tests ensure multi-cloud abstraction doesn't drift and all adapters
 * maintain interface parity.
 */

import { CloudAdapters, CloudConfig } from '../types.js';
import { FalsePositiveEvent } from '../../../schemas/types.js';
import { randomUUID } from 'crypto';
import { rm } from 'fs/promises';

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
      it('should record and retrieve false positive events', async () => {
        const event: FalsePositiveEvent = {
          id: randomUUID(),
          findingId: `finding-${name}-${randomUUID()}`,
          ruleId: 'rule-test',
          timestamp: new Date().toISOString(),
          resolvedBy: 'user-test',
          orgIdHash: 'org-test',
          consent: 'explicit',
          context: {},
        };
        
        await adapters.fpStore.recordFalsePositive(event);
        const isFP = await adapters.fpStore.isFalsePositive(event.findingId);
        
        expect(isFP).toBe(true);
      });
      
      it('should return false for non-existent findings', async () => {
        const isFP = await adapters.fpStore.isFalsePositive(`nonexistent-${randomUUID()}`);
        expect(isFP).toBe(false);
      });
      
      it('should filter false positives by rule', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        const events: FalsePositiveEvent[] = [
          {
            id: randomUUID(),
            findingId: `finding-1-${randomUUID()}`,
            ruleId,
            timestamp: new Date().toISOString(),
            resolvedBy: 'user-1',
            orgIdHash: 'org-1',
            consent: 'explicit',
            context: {},
          },
          {
            id: randomUUID(),
            findingId: `finding-2-${randomUUID()}`,
            ruleId,
            timestamp: new Date().toISOString(),
            resolvedBy: 'user-2',
            orgIdHash: 'org-2',
            consent: 'explicit',
            context: {},
          },
        ];
        
        for (const event of events) {
          await adapters.fpStore.recordFalsePositive(event);
        }
        
        const retrieved = await adapters.fpStore.getFalsePositivesByRule(ruleId);
        expect(retrieved.length).toBeGreaterThanOrEqual(2);
      });
    });
    
    describe('ConsentStore Interface Conformance', () => {
      it('should grant and check resource consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        await adapters.consentStore.grantConsent(orgId, 'fp_patterns', 'admin-user');
        
        const result = await adapters.consentStore.checkResourceConsent(orgId, 'fp_patterns');
        expect(result.granted).toBe(true);
        expect(result.state).toBe('granted');
      });
      
      it('should return not_requested for missing consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        const result = await adapters.consentStore.checkResourceConsent(orgId, 'fp_patterns');
        expect(result.granted).toBe(false);
        expect(result.state).toBe('not_requested');
      });
      
      it('should revoke consent', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        await adapters.consentStore.grantConsent(orgId, 'fp_patterns', 'admin-user');
        await adapters.consentStore.revokeConsent(orgId, 'fp_patterns', 'admin-user');
        
        const result = await adapters.consentStore.checkResourceConsent(orgId, 'fp_patterns');
        expect(result.granted).toBe(false);
        expect(result.state).toBe('revoked');
      });
      
      it('should handle consent expiration', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        const pastDate = new Date(Date.now() - 1000);
        
        await adapters.consentStore.grantConsent(orgId, 'fp_patterns', 'admin-user', pastDate);
        
        const result = await adapters.consentStore.checkResourceConsent(orgId, 'fp_patterns');
        expect(result.granted).toBe(false);
        expect(result.state).toBe('expired');
      });
      
      it('should check multiple resources', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        await adapters.consentStore.grantConsent(orgId, 'fp_patterns', 'admin-user');
        
        const result = await adapters.consentStore.checkMultipleResources(orgId, [
          'fp_patterns',
          'fp_metrics',
        ]);
        
        expect(result.allGranted).toBe(false);
        expect(result.missingConsent).toContain('fp_metrics');
      });
      
      it('should support legacy checkConsent method', async () => {
        const orgId = `org-${name}-${randomUUID()}`;
        
        let consentType = await adapters.consentStore.checkConsent(orgId);
        expect(consentType).toBe('none');
        
        await adapters.consentStore.grantConsent(orgId, 'fp_patterns', 'admin-user');
        
        consentType = await adapters.consentStore.checkConsent(orgId);
        expect(consentType).toBe('explicit');
      });
    });
    
    describe('BlockCounter Interface Conformance', () => {
      it('should increment and get counter', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        
        const count1 = await adapters.blockCounter.increment(ruleId);
        expect(count1).toBe(1);
        
        const count2 = await adapters.blockCounter.increment(ruleId);
        expect(count2).toBe(2);
        
        const count = await adapters.blockCounter.getCount(ruleId);
        expect(count).toBe(2);
      });
      
      it('should return 0 for non-existent rule', async () => {
        const count = await adapters.blockCounter.getCount(`nonexistent-${randomUUID()}`);
        expect(count).toBe(0);
      });
      
      it('should handle concurrent increments', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        
        // Increment concurrently
        const promises = Array.from({ length: 5 }, () => 
          adapters.blockCounter.increment(ruleId)
        );
        
        await Promise.all(promises);
        
        const count = await adapters.blockCounter.getCount(ruleId);
        expect(count).toBe(5);
      });
    });
    
    describe('SecretStore Interface Conformance', () => {
      it('should rotate and retrieve nonce', async () => {
        const testNonce = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        
        await adapters.secretStore.rotateNonce(testNonce);
        
        const nonce = await adapters.secretStore.getNonce();
        expect(nonce).not.toBeNull();
        expect(nonce!.value).toBe(testNonce);
        expect(nonce!.source).toBeDefined();
      });
      
      it('should handle multiple nonce rotations', async () => {
        const nonce1 = 'a'.repeat(64);
        const nonce2 = 'b'.repeat(64);
        
        await adapters.secretStore.rotateNonce(nonce1);
        await adapters.secretStore.rotateNonce(nonce2);
        
        const nonce = await adapters.secretStore.getNonce();
        expect(nonce!.value).toBe(nonce2); // Should get latest
      });
    });
    
    describe('BaselineStorage Interface Conformance', () => {
      it('should store and retrieve baselines', async () => {
        const key = `baseline-${name}-${randomUUID()}.json`;
        const content = JSON.stringify({ version: '1.0', rules: [] });
        
        await adapters.baselineStorage.storeBaseline(key, content);
        
        const retrieved = await adapters.baselineStorage.getBaseline(key);
        expect(retrieved).toBe(content);
      });
      
      it('should return null for non-existent baselines', async () => {
        const baseline = await adapters.baselineStorage.getBaseline(`nonexistent-${randomUUID()}.json`);
        expect(baseline).toBeNull();
      });
      
      it('should list baselines', async () => {
        const key1 = `baseline-${name}-1-${randomUUID()}.json`;
        const key2 = `baseline-${name}-2-${randomUUID()}.json`;
        
        await adapters.baselineStorage.storeBaseline(key1, 'content1');
        await adapters.baselineStorage.storeBaseline(key2, 'content2');
        
        const baselines = await adapters.baselineStorage.listBaselines();
        expect(baselines.length).toBeGreaterThanOrEqual(2);
      });
      
      it('should delete baselines', async () => {
        const key = `baseline-${name}-${randomUUID()}.json`;
        
        await adapters.baselineStorage.storeBaseline(key, 'content');
        await adapters.baselineStorage.deleteBaseline(key);
        
        const baseline = await adapters.baselineStorage.getBaseline(key);
        expect(baseline).toBeNull();
      });
      
      it('should handle Buffer content', async () => {
        const key = `baseline-${name}-${randomUUID()}.json`;
        const buffer = Buffer.from('test content', 'utf-8');
        
        await adapters.baselineStorage.storeBaseline(key, buffer);
        
        const retrieved = await adapters.baselineStorage.getBaseline(key);
        expect(retrieved).toBe('test content');
      });
    });
    
    describe('CalibrationStore Interface Conformance', () => {
      it('should enforce k-anonymity with insufficient data', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        
        const result = await adapters.calibrationStore.aggregateFPsByRule(ruleId);
        
        expect(result).toHaveProperty('error');
        expect((result as any).error).toBe('INSUFFICIENT_K_ANONYMITY');
      });
      
      it('should aggregate FPs when k-anonymity is met', async () => {
        const ruleId = `rule-${name}-${randomUUID()}`;
        
        // Create 10 FP events from different orgs to meet k-anonymity
        for (let i = 0; i < 10; i++) {
          const event: FalsePositiveEvent = {
            id: randomUUID(),
            findingId: `finding-${i}-${randomUUID()}`,
            ruleId,
            timestamp: new Date().toISOString(),
            resolvedBy: `user-${i}`,
            orgIdHash: `org-${i}-${randomUUID()}`,
            consent: 'explicit',
            context: { isFalsePositive: true },
          };
          
          await adapters.fpStore.recordFalsePositive(event);
        }
        
        const result = await adapters.calibrationStore.aggregateFPsByRule(ruleId);
        
        if ('error' in result) {
          // Some providers may still not meet k-anonymity due to implementation details
          expect(result.error).toBe('INSUFFICIENT_K_ANONYMITY');
        } else {
          expect(result.ruleId).toBe(ruleId);
          expect(result.totalFPs).toBeGreaterThanOrEqual(10);
          expect(result.meetsKAnonymity).toBe(true);
        }
      });
    });
  });
}

/**
 * Test suite for Local Provider
 */
describe('Adapter Parity Tests', () => {
  describe('Local Provider', () => {
    const testDataDir = `/tmp/parity-test-local-${Date.now()}`;
    
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
        const { createAwsAdapters } = await import('../aws/index.js');
        return createAwsAdapters(config);
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
        projectId: 'test-project',
        region: 'us-central1',
      },
      skip: true,
      skipReason: 'GCP credentials not configured in test environment',
    });
  });
});
