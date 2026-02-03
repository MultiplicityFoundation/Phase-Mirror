/**
 * Unit tests for Nonce Binding Service
 */

import { promises as fs } from 'node:fs';
import { NonceBindingService } from '../identity/nonce-binding.js';
import { createLocalTrustAdapters } from '../adapters/local/index.js';
import { OrganizationIdentity } from '../identity/types.js';

describe('NonceBindingService', () => {
  const testDataDir = '.test-data-nonce-binding';
  let service: NonceBindingService;
  let adapters: ReturnType<typeof createLocalTrustAdapters>;

  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }

    // Create fresh adapters and service
    adapters = createLocalTrustAdapters(testDataDir);
    service = new NonceBindingService(adapters.identityStore);
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('generateAndBindNonce', () => {
    it('should generate and bind a unique nonce to a verified organization', async () => {
      // Create a verified identity
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '', // Will be set by binding service
      };

      await adapters.identityStore.storeIdentity(identity);

      // Generate and bind nonce
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      expect(result.isNew).toBe(true);
      expect(result.binding.nonce).toHaveLength(64); // 32 bytes in hex
      expect(result.binding.orgId).toBe('org-1');
      expect(result.binding.publicKey).toBe('pubkey-123');
      expect(result.binding.revoked).toBe(false);
      expect(result.binding.usageCount).toBe(0);
      expect(result.binding.signature).toHaveLength(64); // SHA-256 hex
    });

    it('should reject binding for non-existent organization', async () => {
      await expect(
        service.generateAndBindNonce('non-existent', 'pubkey-123')
      ).rejects.toThrow('Organization non-existent not found or not verified');
    });

    it('should reject binding if organization already has active binding', async () => {
      // Create verified identity
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);

      // First binding should succeed
      await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Second binding should fail
      await expect(
        service.generateAndBindNonce('org-1', 'pubkey-123')
      ).rejects.toThrow('already has an active nonce binding');
    });

    it('should update identity record with generated nonce', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);

      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Check that identity was updated
      const updatedIdentity = await adapters.identityStore.getIdentity('org-1');
      expect(updatedIdentity!.uniqueNonce).toBe(result.binding.nonce);
    });

    it('should generate unique nonces for different organizations', async () => {
      // Create two verified identities
      const identity1: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-1',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      const identity2: OrganizationIdentity = {
        orgId: 'org-2',
        publicKey: 'pubkey-2',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity1);
      await adapters.identityStore.storeIdentity(identity2);

      // Generate nonces for both
      const result1 = await service.generateAndBindNonce('org-1', 'pubkey-1');
      const result2 = await service.generateAndBindNonce('org-2', 'pubkey-2');

      // Nonces should be different
      expect(result1.binding.nonce).not.toBe(result2.binding.nonce);
    });
  });

  describe('verifyBinding', () => {
    it('should verify a valid nonce binding', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Verify the binding
      const verification = await service.verifyBinding(result.binding.nonce, 'org-1');

      expect(verification.valid).toBe(true);
      expect(verification.binding).toBeDefined();
      expect(verification.binding!.nonce).toBe(result.binding.nonce);
    });

    it('should reject verification for non-existent organization', async () => {
      const verification = await service.verifyBinding('fake-nonce', 'non-existent');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('No nonce binding found');
    });

    it('should reject verification with incorrect nonce', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Try to verify with wrong nonce
      const verification = await service.verifyBinding('wrong-nonce', 'org-1');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('Nonce mismatch');
    });

    it('should reject verification for revoked binding', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Revoke the binding
      await service.revokeBinding('org-1', 'Security violation');

      // Verify should fail
      const verification = await service.verifyBinding(result.binding.nonce, 'org-1');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('revoked');
      expect(verification.reason).toContain('Security violation');
    });

    it('should reject verification if signature is tampered', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Tamper with the signature
      const tamperedBinding = {
        ...result.binding,
        signature: 'tampered-signature',
      };

      await adapters.identityStore.storeNonceBinding(tamperedBinding);

      // Verify should fail
      const verification = await service.verifyBinding(result.binding.nonce, 'org-1');

      expect(verification.valid).toBe(false);
      expect(verification.reason).toContain('Invalid signature');
    });
  });

  describe('revokeBinding', () => {
    it('should revoke a nonce binding', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Revoke
      await service.revokeBinding('org-1', 'Security violation');

      // Check that it's revoked
      const binding = await adapters.identityStore.getNonceBinding('org-1');
      expect(binding!.revoked).toBe(true);
      expect(binding!.revocationReason).toBe('Security violation');
      expect(binding!.revokedAt).toBeDefined();
    });

    it('should reject revocation for non-existent organization', async () => {
      await expect(
        service.revokeBinding('non-existent', 'Test reason')
      ).rejects.toThrow('No nonce binding found');
    });

    it('should reject revocation of already revoked binding', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      await service.generateAndBindNonce('org-1', 'pubkey-123');

      // First revocation should succeed
      await service.revokeBinding('org-1', 'First reason');

      // Second revocation should fail
      await expect(
        service.revokeBinding('org-1', 'Second reason')
      ).rejects.toThrow('already revoked');
    });
  });

  describe('rotateNonce', () => {
    it('should rotate nonce for an organization', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const originalResult = await service.generateAndBindNonce('org-1', 'pubkey-123');
      const originalNonce = originalResult.binding.nonce;

      // Rotate
      const rotationResult = await service.rotateNonce('org-1', 'pubkey-123', 'Scheduled rotation');

      // Check new binding
      expect(rotationResult.isNew).toBe(false);
      expect(rotationResult.binding.nonce).not.toBe(originalNonce);
      expect(rotationResult.binding.previousNonce).toBe(originalNonce);
      expect(rotationResult.binding.revoked).toBe(false);
      expect(rotationResult.previousBinding).toBeDefined();

      // Check old binding is revoked
      const oldBinding = await adapters.identityStore.getNonceBindingByNonce(originalNonce);
      expect(oldBinding!.revoked).toBe(true);
      expect(oldBinding!.revocationReason).toContain('Rotated');
    });

    it('should support key rotation along with nonce rotation', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'old-pubkey',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      await service.generateAndBindNonce('org-1', 'old-pubkey');

      // Rotate with new public key
      const rotationResult = await service.rotateNonce('org-1', 'new-pubkey', 'Key rotation');

      expect(rotationResult.binding.publicKey).toBe('new-pubkey');

      // Check identity was updated
      const updatedIdentity = await adapters.identityStore.getIdentity('org-1');
      expect(updatedIdentity!.publicKey).toBe('new-pubkey');
      expect(updatedIdentity!.uniqueNonce).toBe(rotationResult.binding.nonce);
    });

    it('should reject rotation for non-existent organization', async () => {
      await expect(
        service.rotateNonce('non-existent', 'pubkey', 'Test')
      ).rejects.toThrow('No nonce binding found');
    });

    it('should reject rotation for revoked binding', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Revoke
      await service.revokeBinding('org-1', 'Security violation');

      // Try to rotate
      await expect(
        service.rotateNonce('org-1', 'pubkey-123', 'Attempted rotation')
      ).rejects.toThrow('Cannot rotate revoked nonce');
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count for valid nonce', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Initial count should be 0
      expect(result.binding.usageCount).toBe(0);

      // Increment once
      await service.incrementUsageCount(result.binding.nonce, 'org-1');

      let binding = await adapters.identityStore.getNonceBinding('org-1');
      expect(binding!.usageCount).toBe(1);

      // Increment again
      await service.incrementUsageCount(result.binding.nonce, 'org-1');

      binding = await adapters.identityStore.getNonceBinding('org-1');
      expect(binding!.usageCount).toBe(2);
    });

    it('should reject incrementing for mismatched nonce', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Try to increment with wrong nonce
      await expect(
        service.incrementUsageCount('wrong-nonce', 'org-1')
      ).rejects.toThrow('not bound to organization');
    });
  });

  describe('getRotationHistory', () => {
    it('should return rotation history in chronological order', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-1',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);

      // Generate initial nonce
      const result1 = await service.generateAndBindNonce('org-1', 'pubkey-1');
      const nonce1 = result1.binding.nonce;

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Rotate once
      const result2 = await service.rotateNonce('org-1', 'pubkey-2', 'First rotation');
      const nonce2 = result2.binding.nonce;

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      // Rotate again
      const result3 = await service.rotateNonce('org-1', 'pubkey-3', 'Second rotation');
      const nonce3 = result3.binding.nonce;

      // Get history
      const history = await service.getRotationHistory('org-1');

      expect(history).toHaveLength(3);
      expect(history[0].nonce).toBe(nonce1); // Oldest first
      expect(history[1].nonce).toBe(nonce2);
      expect(history[2].nonce).toBe(nonce3); // Newest last
    });

    it('should return empty array for organization with no binding', async () => {
      const history = await service.getRotationHistory('non-existent');
      expect(history).toEqual([]);
    });

    it('should return single item for organization with no rotations', async () => {
      // Setup: Create identity and binding
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);
      const result = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Get history
      const history = await service.getRotationHistory('org-1');

      expect(history).toHaveLength(1);
      expect(history[0].nonce).toBe(result.binding.nonce);
    });
  });

  describe('Sybil attack prevention', () => {
    it('should prevent one organization from having multiple active nonces', async () => {
      // Setup: Create verified identity
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);

      // First binding succeeds
      const result1 = await service.generateAndBindNonce('org-1', 'pubkey-123');
      expect(result1.isNew).toBe(true);

      // Second binding attempt fails (Sybil attack prevented)
      await expect(
        service.generateAndBindNonce('org-1', 'pubkey-123')
      ).rejects.toThrow('already has an active nonce binding');
    });

    it('should allow new binding after revocation', async () => {
      // Setup: Create verified identity
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
      };

      await adapters.identityStore.storeIdentity(identity);

      // First binding
      const result1 = await service.generateAndBindNonce('org-1', 'pubkey-123');

      // Revoke
      await service.revokeBinding('org-1', 'Test revocation');

      // New binding should now work (not rotation, but fresh binding)
      const result2 = await service.generateAndBindNonce('org-1', 'pubkey-123');
      expect(result2.isNew).toBe(false); // Not "new" because there was a previous binding
      expect(result2.binding.nonce).not.toBe(result1.binding.nonce);
      expect(result2.previousBinding).toBeDefined();
    });
  });

  describe('Integration with identity verification', () => {
    it('should work with GitHub-verified organizations', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'github-org-1',
        publicKey: 'pubkey-github',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
        githubOrgId: 12345,
      };

      await adapters.identityStore.storeIdentity(identity);

      const result = await service.generateAndBindNonce('github-org-1', 'pubkey-github');

      expect(result.binding.orgId).toBe('github-org-1');
      expect(result.binding.publicKey).toBe('pubkey-github');
    });

    it('should work with Stripe-verified organizations', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'stripe-org-1',
        publicKey: 'pubkey-stripe',
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: '',
        stripeCustomerId: 'cus_123abc',
      };

      await adapters.identityStore.storeIdentity(identity);

      const result = await service.generateAndBindNonce('stripe-org-1', 'pubkey-stripe');

      expect(result.binding.orgId).toBe('stripe-org-1');
      expect(result.binding.publicKey).toBe('pubkey-stripe');
    });
  });
});
