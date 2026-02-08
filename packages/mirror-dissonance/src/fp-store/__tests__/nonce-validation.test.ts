/**
 * Tests for FP Store with Nonce Validation
 */

import { promises as fs } from 'node:fs';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  FPStoreWithNonceValidation,
  NonceValidationError,
  createFPStoreWithNonceValidation,
} from '../nonce-validation.js';

const TEST_PUBKEY = 'a'.repeat(64);
const NEW_PUBKEY = 'b'.repeat(64);
import { NoOpFPStore, IFPStore } from '../store.js';
import { NonceBindingService } from '../../trust/identity/nonce-binding.js';
import { createLocalTrustAdapters } from '../../trust/adapters/local/index.js';
import { OrganizationIdentity } from '../../trust/identity/types.js';
import { FalsePositiveEvent } from '../../schemas/types.js';

describe('FPStoreWithNonceValidation', () => {
  const testDataDir = '.test-data-fp-nonce';
  let fpStore: IFPStore;
  let nonceBindingService: NonceBindingService;
  let fpStoreWithValidation: FPStoreWithNonceValidation;

  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }

    // Setup test identity and nonce binding
    const adapters = createLocalTrustAdapters(testDataDir);
    nonceBindingService = new NonceBindingService(adapters.identityStore);

    // Create a verified identity
    const identity: OrganizationIdentity = {
      orgId: 'test-org',
      publicKey: TEST_PUBKEY,
      verificationMethod: 'github_org',
      verifiedAt: new Date(),
      uniqueNonce: '',
      githubOrgId: 12345,
    };
    await adapters.identityStore.storeIdentity(identity);

    // Generate and bind a nonce
    await nonceBindingService.generateAndBindNonce('test-org', TEST_PUBKEY);

    // Create FP Store with nonce validation
    fpStore = new NoOpFPStore();
    fpStoreWithValidation = createFPStoreWithNonceValidation(fpStore, nonceBindingService);
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('recordFalsePositive', () => {
    it('should accept FP submission with valid nonce', async () => {
      // Get the bound nonce
      const history = await nonceBindingService.getRotationHistory('test-org');
      const nonce = history[0].nonce;

      // Create FP event with valid nonce
      const fpEvent: any = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: nonce,
        metadata: {
          orgId: 'test-org',
        },
      };

      // Should not throw
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).resolves.not.toThrow();
    });

    it('should reject FP submission with invalid nonce', async () => {
      // Create FP event with invalid nonce
      const fpEvent: any = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: 'invalid-nonce',
        metadata: {
          orgId: 'test-org',
        },
      };

      // Should throw NonceValidationError
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).rejects.toThrow(
        NonceValidationError
      );
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).rejects.toThrow(
        'Nonce mismatch'
      );
    });

    it('should reject FP submission with wrong org ID', async () => {
      // Get the bound nonce
      const history = await nonceBindingService.getRotationHistory('test-org');
      const nonce = history[0].nonce;

      // Create FP event with wrong org ID
      const fpEvent: any = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: nonce,
        metadata: {
          orgId: 'wrong-org', // Wrong org ID
        },
      };

      // Should throw NonceValidationError
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).rejects.toThrow(
        NonceValidationError
      );
    });

    it('should reject FP submission with revoked nonce', async () => {
      // Get the bound nonce
      const history = await nonceBindingService.getRotationHistory('test-org');
      const nonce = history[0].nonce;

      // Revoke the nonce
      await nonceBindingService.revokeBinding('test-org', 'Test revocation');

      // Create FP event with revoked nonce
      const fpEvent: any = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: nonce,
        metadata: {
          orgId: 'test-org',
        },
      };

      // Should throw NonceValidationError
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).rejects.toThrow(
        NonceValidationError
      );
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).rejects.toThrow('revoked');
    });

    it('should accept FP submission without nonce (legacy mode)', async () => {
      // Create FP event without nonce
      const fpEvent: FalsePositiveEvent = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
      };

      // Should not throw (backward compatibility)
      await expect(fpStoreWithValidation.recordFalsePositive(fpEvent)).resolves.not.toThrow();
    });

    it('should accept FP submission after nonce rotation', async () => {
      // Get the original nonce
      const history1 = await nonceBindingService.getRotationHistory('test-org');
      const oldNonce = history1[0].nonce;

      // Rotate the nonce
      await nonceBindingService.rotateNonce('test-org', NEW_PUBKEY, 'Test rotation');

      // Get the new nonce
      const history2 = await nonceBindingService.getRotationHistory('test-org');
      const newNonce = history2[history2.length - 1].nonce;

      // Old nonce should be rejected
      const fpEventOld: any = {
        id: 'fp-1',
        findingId: 'finding-1',
        ruleId: 'rule-1',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: oldNonce,
        metadata: {
          orgId: 'test-org',
        },
      };

      await expect(fpStoreWithValidation.recordFalsePositive(fpEventOld)).rejects.toThrow(
        NonceValidationError
      );

      // New nonce should be accepted
      const fpEventNew: any = {
        id: 'fp-2',
        findingId: 'finding-2',
        ruleId: 'rule-2',
        timestamp: new Date().toISOString(),
        resolvedBy: 'user-1',
        context: {},
        orgIdNonce: newNonce,
        metadata: {
          orgId: 'test-org',
        },
      };

      await expect(fpStoreWithValidation.recordFalsePositive(fpEventNew)).resolves.not.toThrow();
    });
  });

  describe('pass-through methods', () => {
    it('should pass through isFalsePositive', async () => {
      const result = await fpStoreWithValidation.isFalsePositive('finding-1');
      expect(result).toBe(false); // NoOp always returns false
    });

    it('should pass through getFalsePositivesByRule', async () => {
      const result = await fpStoreWithValidation.getFalsePositivesByRule('rule-1');
      expect(result).toEqual([]); // NoOp always returns empty array
    });
  });

  describe('NonceValidationError', () => {
    it('should have proper error properties', () => {
      const error = new NonceValidationError('Test message', 'TEST_CODE', { detail: 'test' });

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ detail: 'test' });
      expect(error.name).toBe('NonceValidationError');
    });
  });
});
