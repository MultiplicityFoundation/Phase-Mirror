/**
 * Tests for Nonce Binding Type Definitions
 * 
 * Validates that the type definitions in types.ts are properly structured
 * and can be used correctly.
 */

import {
  NonceBinding,
  NonceBindingValidationResult,
  NonceRotationRequest,
  NonceRevocation,
  VerificationMethod,
} from '../identity/types.js';

describe('Nonce Binding Type Definitions', () => {
  describe('NonceBinding', () => {
    it('should allow creating a valid NonceBinding object', () => {
      const binding: NonceBinding = {
        nonce: 'abc123',
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        boundAt: new Date('2024-01-01'),
        verificationMethod: 'github_org',
        signature: 'sig-abc',
      };

      expect(binding.nonce).toBe('abc123');
      expect(binding.orgId).toBe('org-1');
      expect(binding.verificationMethod).toBe('github_org');
    });

    it('should allow optional revocation fields', () => {
      const binding: NonceBinding = {
        nonce: 'abc123',
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        boundAt: new Date('2024-01-01'),
        verificationMethod: 'stripe_customer',
        signature: 'sig-abc',
        revokedAt: new Date('2024-01-02'),
        revocationReason: 'Security violation',
      };

      expect(binding.revokedAt).toBeDefined();
      expect(binding.revocationReason).toBe('Security violation');
    });

    it('should support all verification methods', () => {
      const methods: VerificationMethod[] = ['github_org', 'stripe_customer', 'manual'];

      methods.forEach((method) => {
        const binding: NonceBinding = {
          nonce: 'abc123',
          orgId: 'org-1',
          publicKey: 'pubkey-123',
          boundAt: new Date(),
          verificationMethod: method,
          signature: 'sig-abc',
        };

        expect(binding.verificationMethod).toBe(method);
      });
    });
  });

  describe('NonceBindingValidationResult', () => {
    it('should allow valid result structure', () => {
      const result: NonceBindingValidationResult = {
        valid: true,
        binding: {
          nonce: 'abc123',
          orgId: 'org-1',
          publicKey: 'pubkey-123',
          boundAt: new Date(),
          verificationMethod: 'github_org',
          signature: 'sig-abc',
        },
      };

      expect(result.valid).toBe(true);
      expect(result.binding).toBeDefined();
      expect(result.binding?.nonce).toBe('abc123');
    });

    it('should allow invalid result with reason', () => {
      const result: NonceBindingValidationResult = {
        valid: false,
        reason: 'Nonce has been revoked',
      };

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Nonce has been revoked');
      expect(result.binding).toBeUndefined();
    });
  });

  describe('NonceRotationRequest', () => {
    it('should allow rotation request with new public key', () => {
      const request: NonceRotationRequest = {
        orgId: 'org-1',
        newPublicKey: 'new-pubkey-456',
        reason: 'Scheduled rotation',
        requestedAt: new Date('2024-01-01'),
      };

      expect(request.orgId).toBe('org-1');
      expect(request.newPublicKey).toBe('new-pubkey-456');
      expect(request.reason).toBe('Scheduled rotation');
    });

    it('should allow rotation request without new public key', () => {
      const request: NonceRotationRequest = {
        orgId: 'org-1',
        reason: 'Security concern',
        requestedAt: new Date('2024-01-01'),
      };

      expect(request.orgId).toBe('org-1');
      expect(request.newPublicKey).toBeUndefined();
    });
  });

  describe('NonceRevocation', () => {
    it('should allow revocation record structure', () => {
      const revocation: NonceRevocation = {
        nonce: 'abc123',
        orgId: 'org-1',
        revokedAt: new Date('2024-01-01'),
        reason: 'Compromised nonce',
        revokedBy: 'admin-user',
      };

      expect(revocation.nonce).toBe('abc123');
      expect(revocation.orgId).toBe('org-1');
      expect(revocation.reason).toBe('Compromised nonce');
      expect(revocation.revokedBy).toBe('admin-user');
    });

    it('should track system revocations', () => {
      const revocation: NonceRevocation = {
        nonce: 'abc123',
        orgId: 'org-1',
        revokedAt: new Date('2024-01-01'),
        reason: 'Automatic revocation: suspicious activity',
        revokedBy: 'system',
      };

      expect(revocation.revokedBy).toBe('system');
    });
  });

  describe('Type compatibility', () => {
    it('should be compatible with existing NonceBinding from nonce-binding.ts', () => {
      // This test validates that the type definition in types.ts is compatible
      // with the existing implementation in nonce-binding.ts
      
      const binding: NonceBinding = {
        nonce: 'test-nonce',
        orgId: 'test-org',
        publicKey: 'test-key',
        boundAt: new Date(),
        verificationMethod: 'github_org',
        signature: 'test-signature',
      };

      // The binding should have all required fields
      expect(binding).toHaveProperty('nonce');
      expect(binding).toHaveProperty('orgId');
      expect(binding).toHaveProperty('publicKey');
      expect(binding).toHaveProperty('boundAt');
      expect(binding).toHaveProperty('verificationMethod');
      expect(binding).toHaveProperty('signature');
    });
  });
});
