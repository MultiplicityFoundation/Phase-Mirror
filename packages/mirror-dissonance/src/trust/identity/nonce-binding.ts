/**
 * Nonce Binding with Identity
 * 
 * Extends the existing nonce system to bind nonces with payment/GitHub verification.
 * Prevents nonce reuse across multiple identities (Sybil resistance).
 */

import { createHash, randomBytes } from 'node:crypto';
import { IIdentityStoreAdapter } from '../adapters/types.js';

/**
 * Maximum depth to traverse when walking the rotation chain.
 * Prevents infinite loops in case of circular references or corrupted data.
 */
const MAX_ROTATION_CHAIN_DEPTH = 100;

/**
 * Extended nonce with identity binding and cryptographic proof
 */
export interface NonceBinding {
  /** Unique nonce value (64 hex chars) */
  nonce: string;
  
  /** Organization ID this nonce is bound to */
  orgId: string;
  
  /** Public key of the organization (for signature verification) */
  publicKey: string;
  
  /** Cryptographic signature proving nonce ownership */
  signature: string;
  
  /** When the binding was created */
  issuedAt: Date;
  
  /** When the binding expires (optional, null for no expiration) */
  expiresAt: Date | null;
  
  /** Number of times this nonce has been used */
  usageCount: number;
  
  /** Whether this binding has been revoked */
  revoked: boolean;
  
  /** Reason for revocation (if revoked) */
  revocationReason?: string;
  
  /** When the binding was revoked (if revoked) */
  revokedAt?: Date;
  
  /** Previous nonce in rotation chain (if this is a rotated nonce) */
  previousNonce?: string;
}

/**
 * Result of nonce binding generation
 */
export interface NonceBindingResult {
  /** The binding record */
  binding: NonceBinding;
  
  /** Whether this is a new binding or replaced an existing one */
  isNew: boolean;
  
  /** Previous binding if this was a rotation */
  previousBinding?: NonceBinding;
}

/**
 * Result of nonce verification
 */
export interface NonceVerificationResult {
  /** Whether the nonce is valid and bound correctly */
  valid: boolean;
  
  /** Reason for invalid nonce */
  reason?: string;
  
  /** The binding record if valid */
  binding?: NonceBinding;
}

/**
 * Nonce Binding Service
 * 
 * Cryptographically binds unique nonces to verified organizational identities.
 * Ensures one-to-one mapping between verified identity and nonce.
 */
export class NonceBindingService {
  constructor(private identityStore: IIdentityStoreAdapter) {}

  /**
   * Generate a unique nonce and bind it to a verified organization
   * 
   * @param orgId - Organization ID (must be verified)
   * @param publicKey - Organization's public key for signature verification
   * @returns NonceBindingResult with the new binding
   * @throws Error if orgId is not verified or already has a non-revoked binding
   */
  async generateAndBindNonce(
    orgId: string,
    publicKey: string
  ): Promise<NonceBindingResult> {
    // 1. Verify the organization identity exists
    const identity = await this.identityStore.getIdentity(orgId);
    if (!identity) {
      throw new Error(`Organization ${orgId} not found or not verified`);
    }

    // 2. Validate public key format
    this.validatePublicKey(publicKey);

    // 3. Check if organization already has an active (non-revoked) binding
    const existingBinding = await this.identityStore.getNonceBinding(orgId);
    if (existingBinding && !existingBinding.revoked) {
      throw new Error(
        `Organization ${orgId} already has an active nonce binding. ` +
        `Use rotateNonce() to replace it.`
      );
    }

    // 4. Generate a unique nonce (64 hex chars = 32 bytes)
    const nonce = randomBytes(32).toString('hex');

    // 5. Verify nonce is not already in use (extremely unlikely but check anyway)
    const nonceUsageCount = await this.identityStore.getNonceUsageCount(nonce);
    if (nonceUsageCount > 0) {
      // Collision detected (astronomically rare), try again
      return this.generateAndBindNonce(orgId, publicKey);
    }

    // 6. Create signature: HMAC-SHA256(nonce + orgId + publicKey)
    const signatureData = `${nonce}:${orgId}:${publicKey}`;
    const signature = createHash('sha256')
      .update(signatureData)
      .digest('hex');

    // 7. Create the binding record
    const binding: NonceBinding = {
      nonce,
      orgId,
      publicKey,
      signature,
      issuedAt: new Date(),
      expiresAt: null, // No expiration by default
      usageCount: 0,
      revoked: false,
    };

    // 8. Store the binding
    await this.identityStore.storeNonceBinding(binding);

    // 9. Update the identity record with the new nonce
    await this.identityStore.storeIdentity({
      ...identity,
      uniqueNonce: nonce,
    });

    return {
      binding,
      isNew: !existingBinding,
      previousBinding: existingBinding || undefined,
    };
  }

  /**
   * Verify that a nonce is validly bound to an organization
   * 
   * @param nonce - The nonce to verify
   * @param orgId - The claimed organization ID
   * @returns NonceVerificationResult indicating validity
   */
  async verifyBinding(
    nonce: string,
    orgId: string
  ): Promise<NonceVerificationResult> {
    // 1. Look up the nonce binding
    const binding = await this.identityStore.getNonceBinding(orgId);

    if (!binding) {
      return {
        valid: false,
        reason: `No nonce binding found for organization ${orgId}`,
      };
    }

    // 2. Verify the nonce matches
    if (binding.nonce !== nonce) {
      return {
        valid: false,
        reason: `Nonce mismatch: expected ${binding.nonce.substring(0, 8)}..., got ${nonce.substring(0, 8)}...`,
      };
    }

    // 3. Check if revoked
    if (binding.revoked) {
      return {
        valid: false,
        reason: `Nonce binding has been revoked: ${binding.revocationReason || 'No reason provided'}`,
      };
    }

    // 4. Check if expired
    if (binding.expiresAt && binding.expiresAt < new Date()) {
      return {
        valid: false,
        reason: `Nonce binding expired at ${binding.expiresAt.toISOString()}`,
      };
    }

    // 5. Verify the signature
    const signatureData = `${binding.nonce}:${binding.orgId}:${binding.publicKey}`;
    const expectedSignature = createHash('sha256')
      .update(signatureData)
      .digest('hex');

    if (binding.signature !== expectedSignature) {
      return {
        valid: false,
        reason: 'Invalid signature: binding has been tampered with',
      };
    }

    // 6. All checks passed - nonce is valid
    return {
      valid: true,
      binding,
    };
  }

  /**
   * Revoke a nonce binding (e.g., due to security violation or org leaving)
   * 
   * @param orgId - Organization ID
   * @param reason - Reason for revocation
   */
  async revokeBinding(orgId: string, reason: string): Promise<void> {
    const binding = await this.identityStore.getNonceBinding(orgId);

    if (!binding) {
      throw new Error(`No nonce binding found for organization ${orgId}`);
    }

    if (binding.revoked) {
      throw new Error(
        `Nonce binding for ${orgId} is already revoked: ${binding.revocationReason}`
      );
    }

    // Update the binding with revocation info
    const revokedBinding: NonceBinding = {
      ...binding,
      revoked: true,
      revocationReason: reason,
      revokedAt: new Date(),
    };

    await this.identityStore.storeNonceBinding(revokedBinding);
  }

  /**
   * Rotate a nonce for an organization (creates new nonce, revokes old one)
   * Preserves identity continuity through rotation chain.
   * 
   * @param orgId - Organization ID
   * @param newPublicKey - New public key (or same if not rotating keys)
   * @param reason - Reason for rotation
   * @returns NonceBindingResult with new binding
   */
  async rotateNonce(
    orgId: string,
    newPublicKey: string,
    reason: string
  ): Promise<NonceBindingResult> {
    // 1. Get current binding
    const currentBinding = await this.identityStore.getNonceBinding(orgId);

    if (!currentBinding) {
      throw new Error(`No nonce binding found for organization ${orgId}`);
    }

    if (currentBinding.revoked) {
      throw new Error(
        `Cannot rotate revoked nonce for ${orgId}. Use generateAndBindNonce() to create a new binding.`
      );
    }

    // 2. Validate new public key
    this.validatePublicKey(newPublicKey);

    // 3. Revoke the current binding
    await this.revokeBinding(orgId, `Rotated: ${reason}`);

    // 4. Generate new nonce
    const nonce = randomBytes(32).toString('hex');

    // 5. Create signature for new binding
    const signatureData = `${nonce}:${orgId}:${newPublicKey}`;
    const signature = createHash('sha256')
      .update(signatureData)
      .digest('hex');

    // 6. Create new binding with link to previous nonce
    const newBinding: NonceBinding = {
      nonce,
      orgId,
      publicKey: newPublicKey,
      signature,
      issuedAt: new Date(),
      expiresAt: null,
      usageCount: 0,
      revoked: false,
      previousNonce: currentBinding.nonce, // Link to rotation chain
    };

    // 7. Store new binding
    await this.identityStore.storeNonceBinding(newBinding);

    // 8. Update identity record
    const identity = await this.identityStore.getIdentity(orgId);
    if (identity) {
      await this.identityStore.storeIdentity({
        ...identity,
        uniqueNonce: nonce,
        publicKey: newPublicKey,
      });
    }

    return {
      binding: newBinding,
      isNew: false,
      previousBinding: currentBinding,
    };
  }

  /**
   * Increment usage count for a nonce after successful FP submission
   * 
   * @param nonce - The nonce that was used
   * @param orgId - Organization ID
   */
  async incrementUsageCount(nonce: string, orgId: string): Promise<void> {
    const binding = await this.identityStore.getNonceBinding(orgId);

    if (!binding || binding.nonce !== nonce) {
      throw new Error(`Nonce ${nonce} is not bound to organization ${orgId}`);
    }

    const updatedBinding: NonceBinding = {
      ...binding,
      usageCount: binding.usageCount + 1,
    };

    await this.identityStore.storeNonceBinding(updatedBinding);
  }

  /**
   * Get the rotation history for an organization's nonces
   * Follows the previousNonce chain backwards.
   * 
   * @param orgId - Organization ID
   * @returns Array of bindings in chronological order (oldest first)
   */
  async getRotationHistory(orgId: string): Promise<NonceBinding[]> {
    const currentBinding = await this.identityStore.getNonceBinding(orgId);
    
    if (!currentBinding) {
      return [];
    }

    const history: NonceBinding[] = [currentBinding];
    let previousNonce = currentBinding.previousNonce;

    // Walk back through the chain (with safety limit to prevent infinite loops)
    let maxIterations = MAX_ROTATION_CHAIN_DEPTH;
    while (previousNonce && maxIterations > 0) {
      const previousBinding = await this.identityStore.getNonceBindingByNonce(previousNonce);
      if (!previousBinding) {
        break; // Chain ends here
      }
      
      history.unshift(previousBinding); // Add to front (chronological order)
      previousNonce = previousBinding.previousNonce;
      maxIterations--;
    }

    return history;
  }

  /**
   * Validate public key format
   * 
   * @param publicKey - Public key to validate
   * @throws Error if public key is invalid
   */
  private validatePublicKey(publicKey: string): void {
    // Check if public key is hexadecimal
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(publicKey)) {
      throw new Error('Public key must be hexadecimal');
    }

    // Check if public key has valid length (should be at least 32 chars, typically 64)
    if (publicKey.length < 32) {
      throw new Error('Public key length invalid: must be at least 32 characters');
    }
  }
}
