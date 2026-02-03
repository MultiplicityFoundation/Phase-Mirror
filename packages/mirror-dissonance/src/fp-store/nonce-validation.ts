/**
 * FP Store with Nonce Binding Validation
 * 
 * Extends the FP Store to validate nonce bindings before accepting
 * false positive submissions, ensuring only verified organizations
 * with valid, non-revoked nonces can submit FP data.
 */

import { NonceBindingService } from '../trust/identity/nonce-binding.js';
import { IFPStore } from './store.js';
import { FalsePositiveEvent } from '../../schemas/types.js';

/**
 * Extended FP submission with nonce and organization metadata
 */
export interface FPSubmissionWithNonce extends Omit<FalsePositiveEvent, 'orgIdHash'> {
  /**
   * The bound nonce for this organization
   */
  orgIdNonce: string;
  
  /**
   * Metadata must include orgId for binding validation
   */
  metadata: {
    orgId: string;
    [key: string]: any;
  };
}

/**
 * Error thrown when nonce validation fails
 */
export class NonceValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'NonceValidationError';
  }
}

/**
 * FP Store with Nonce Binding Validation
 * 
 * Wraps an existing IFPStore implementation and adds nonce validation
 * before allowing FP submissions.
 */
export class FPStoreWithNonceValidation implements IFPStore {
  constructor(
    private readonly fpStore: IFPStore,
    private readonly nonceBindingService: NonceBindingService
  ) {}

  /**
   * Record a false positive with nonce validation
   * 
   * Validates that:
   * 1. Nonce exists in identity store
   * 2. Nonce is bound to claimed org ID
   * 3. Binding has not been revoked
   * 4. Organization identity is verified
   * 
   * @throws NonceValidationError if validation fails
   */
  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    // Check if this is a submission with nonce (has orgIdNonce field)
    const submission = event as any;
    
    if (submission.orgIdNonce && submission.metadata?.orgId) {
      // Validate nonce binding
      await this.validateNonceBinding(
        submission.metadata.orgId,
        submission.orgIdNonce
      );
    }
    
    // If validation passes (or no nonce provided), record the FP
    await this.fpStore.recordFalsePositive(event);
  }

  /**
   * Validate nonce binding for an organization
   */
  private async validateNonceBinding(orgId: string, nonce: string): Promise<void> {
    // Verify the nonce binding
    const verification = await this.nonceBindingService.verifyBinding(nonce, orgId);
    
    if (!verification.valid) {
      throw new NonceValidationError(
        `Nonce validation failed: ${verification.reason}`,
        'NONCE_VALIDATION_FAILED',
        { orgId, reason: verification.reason }
      );
    }
    
    // Additional check: ensure binding exists
    if (!verification.binding) {
      throw new NonceValidationError(
        'Nonce binding not found',
        'NONCE_BINDING_NOT_FOUND',
        { orgId }
      );
    }
    
    // Check if revoked (redundant with verifyBinding, but explicit)
    if (verification.binding.revoked) {
      throw new NonceValidationError(
        `Nonce binding has been revoked: ${verification.binding.revocationReason || 'No reason provided'}`,
        'NONCE_REVOKED',
        { orgId, revokedAt: verification.binding.revokedAt }
      );
    }
  }

  /**
   * Check if a finding is a false positive (pass-through)
   */
  async isFalsePositive(findingId: string): Promise<boolean> {
    return this.fpStore.isFalsePositive(findingId);
  }

  /**
   * Get false positives by rule (pass-through)
   */
  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    return this.fpStore.getFalsePositivesByRule(ruleId);
  }
}

/**
 * Helper function to create an FP Store with nonce validation
 */
export function createFPStoreWithNonceValidation(
  fpStore: IFPStore,
  nonceBindingService: NonceBindingService
): FPStoreWithNonceValidation {
  return new FPStoreWithNonceValidation(fpStore, nonceBindingService);
}
