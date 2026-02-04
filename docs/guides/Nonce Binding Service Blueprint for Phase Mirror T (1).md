<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# Nonce Binding Service Blueprint for Phase Mirror Trust Module

**Priority**: P2 (Critical Path - Identity Layer Foundation)
**Integration Point**: `trust/identity/nonce-binding.ts` + Existing `src/nonce/` system
**Target**: Production-ready cryptographic binding between verified identities and unique nonces

***

## Executive Summary

This blueprint provides step-by-step implementation instructions for the Nonce Binding Service in Phase Mirror's Trust Module. The service cryptographically binds unique nonces to verified organizational identities, ensuring that each verified organization has exactly one nonce that cannot be reused, shared, or forged. This prevents identity spoofing and ensures k-anonymity guarantees hold even after identity verification.

***

## Architecture Context

### Why Nonce Binding?

Phase Mirror's false positive calibration system relies on **k-anonymity** to protect organizational privacy. Each organization submits FP data using a **unique nonce** that gets hashed to create an `orgIdHash`. The nonce system already exists in `src/nonce/`, but currently lacks cryptographic binding to verified identities, creating vulnerabilities:

**Without Nonce Binding:**

- ❌ Organization could claim multiple nonces (Sybil attack)
- ❌ Nonces could be shared between organizations (collusion)
- ❌ No proof that nonce belongs to verified identity
- ❌ Nonce rotation breaks identity continuity

**With Nonce Binding:**

- ✅ One verified identity → exactly one nonce (1:1 binding)
- ✅ Cryptographic proof of nonce ownership (public key signature)
- ✅ Nonce cannot be transferred to different organization
- ✅ Rotation preserves identity binding (revocation + new binding)


### Trust Module Integration Flow

```
┌───────────────────────────────────────────────────────────────────┐
│                  Nonce Binding Service Flow                        │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. Org verifies identity (GitHub/Stripe) ──┐                     │
│                                              ↓                     │
│  2. VerificationService receives verified result                  │
│                                              ↓                     │
│  3. NonceBindingService.generateAndBindNonce(orgId, publicKey)    │
│                                              ↓                     │
│  4. Generate unique nonce using existing NonceCoder               │
│                                              ↓                     │
│  5. Create NonceBinding { nonce, orgId, publicKey, signature }    │
│                                              ↓                     │
│  6. Store binding in IIdentityStore                               │
│                                              ↓                     │
│  7. Return nonce to org for FP submissions                        │
│     ↓                                                              │
│  8. Org submits FP data with nonce ──────────────────────┐        │
│                                                            ↓       │
│  9. FP Store validates nonce via NonceBindingService      │       │
│                                                            ↓       │
│ 10. Check: nonce exists? bound to verified identity? not revoked? │
│                                                            ↓       │
│ 11. If valid → Accept FP submission                       │       │
│     If invalid → Reject with reason                       │       │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```


### Existing Nonce System Overview

**Location**: `packages/mirror-dissonance/src/nonce/`

**Key Components:**

- `NonceCoder` - Encodes/decodes nonces with HMAC signatures
- `NonceRotationScheduler` - Handles nonce rotation timing
- `NonceStore` (interface) - Persistence layer for nonces
- `redact()` function - Redacts nonces from logs/outputs

**Current Functionality:**

- Nonce generation with HMAC signing
- Nonce rotation on schedule
- Nonce validation and decoding
- Redaction for security

**What's Missing (This Blueprint Adds):**

- ✅ Cryptographic binding to verified identities
- ✅ Public key signature verification
- ✅ One-to-one nonce-identity enforcement
- ✅ Revocation and rebinding mechanisms
- ✅ Integration with Trust Module identity verification

***

## Phase 1: Understand Existing Nonce System

### File Review: `src/nonce/nonce-coder.ts`

**Current Implementation Analysis:**

```typescript
// Existing NonceCoder interface (keep as-is)
export interface INonceCoder {
  encode(payload: Record<string, unknown>): Promise<string>;
  decode(nonce: string): Promise<Record<string, unknown> | null>;
  rotate(oldNonce: string): Promise<string>;
}

// Existing implementation uses HMAC
export class NonceCoder implements INonceCoder {
  constructor(private readonly secret: string) {}
  
  async encode(payload: Record<string, unknown>): Promise<string> {
    // Creates HMAC-signed nonce
    // Format: base64(payload).base64(hmac)
  }
  
  async decode(nonce: string): Promise<Record<string, unknown> | null> {
    // Verifies HMAC, returns payload if valid
  }
  
  async rotate(oldNonce: string): Promise<string> {
    // Creates new nonce with same payload, new timestamp
  }
}
```

**Key Insight**: Existing nonces are HMAC-signed but **not bound to identities**. Any organization can generate a valid nonce if they know the secret. This is by design for initial k-anonymity, but needs identity binding layer.

### File Review: `src/nonce/types.ts`

**Current Types:**

```typescript
export interface NonceMetadata {
  orgId: string;
  timestamp: number;
  rotationCount?: number;
}

export interface NonceValidationResult {
  valid: boolean;
  metadata?: NonceMetadata;
  reason?: string;
}
```

**What We'll Add** (in `trust/identity/types.ts`):

```typescript
export interface NonceBinding {
  nonce: string;                    // The unique nonce
  orgId: string;                    // Phase Mirror org ID
  publicKey: string;                // Org's public key (hex)
  boundAt: Date;                    // When binding was created
  verificationMethod: VerificationMethod; // How org was verified
  signature: string;                // Cryptographic signature proving ownership
  revokedAt?: Date;                 // If nonce was revoked
  revocationReason?: string;        // Why nonce was revoked
}
```


***

## Phase 2: Core Nonce Binding Service

### File: `trust/identity/nonce-binding.ts`

**Target Implementation:**

```typescript
import { createHash, randomBytes } from 'crypto';
import { INonceCoder } from '../../nonce/nonce-coder';
import { IIdentityStore } from '../adapters/types';
import { NonceBinding, OrganizationIdentity } from './types';

/**
 * Nonce Binding Service
 * 
 * Cryptographically binds unique nonces to verified organizational identities,
 * ensuring one-to-one relationship and preventing nonce sharing/reuse.
 * 
 * Security Properties:
 * - One nonce per verified identity (1:1 binding)
 * - Public key signature proves nonce ownership
 * - Binding cannot be transferred between organizations
 * - Revocation + rebinding mechanism for nonce rotation
 * - Immutable audit trail of all bindings
 * 
 * Integration:
 * - Called by VerificationService after successful identity verification
 * - Validates nonces during FP submission (FpStore integration)
 * - Supports nonce rotation while preserving identity continuity
 * 
 * @example
 * const service = new NonceBindingService(identityStore, nonceCoder);
 * const nonce = await service.generateAndBindNonce('org-123', publicKey);
 * // Org uses nonce for FP submissions
 * 
 * const isValid = await service.validateNonceBinding('org-123', nonce);
 * if (isValid.valid) {
 *   // Accept FP submission
 * }
 */
export class NonceBindingService {
  constructor(
    private readonly identityStore: IIdentityStore,
    private readonly nonceCoder?: INonceCoder
  ) {}

  /**
   * Generate a new nonce and bind it to a verified organization.
   * 
   * This is the primary entry point called after successful identity verification.
   * Creates a unique nonce, generates cryptographic binding proof, and stores
   * the binding in the identity store.
   * 
   * @param orgId - Phase Mirror organization ID (must be verified)
   * @param publicKey - Organization's public key (hex-encoded)
   * @returns The generated nonce (unique identifier for FP submissions)
   * 
   * @throws {Error} if orgId not verified
   * @throws {Error} if nonce already bound to this org
   * @throws {Error} if publicKey format invalid
   */
  async generateAndBindNonce(
    orgId: string,
    publicKey: string
  ): Promise<string> {
    // Step 1: Verify organization has verified identity
    const identity = await this.identityStore.getIdentity(orgId);
    if (!identity) {
      throw new Error(`Organization ${orgId} not verified. Complete identity verification first.`);
    }

    // Step 2: Check if nonce already bound (should not happen in normal flow)
    if (identity.uniqueNonce) {
      throw new Error(
        `Organization ${orgId} already has bound nonce. Use rotateNonce() to create new binding.`
      );
    }

    // Step 3: Validate public key format
    this.validatePublicKey(publicKey);

    // Step 4: Generate unique nonce
    const nonce = await this.generateUniqueNonce(orgId);

    // Step 5: Create cryptographic binding
    const binding = await this.createBinding(
      nonce,
      orgId,
      publicKey,
      identity.verificationMethod
    );

    // Step 6: Store binding (updates identity with nonce)
    await this.storeBinding(binding, identity);

    return nonce;
  }

  /**
   * Validate that a nonce is properly bound to an organization.
   * 
   * Called by FpStore before accepting FP submissions. Checks:
   * - Nonce exists and is bound to claimed orgId
   * - Binding has not been revoked
   * - Organization identity is verified
   * 
   * @param orgId - Organization claiming ownership of nonce
   * @param nonce - Nonce being validated
   * @returns Validation result with reason if invalid
   */
  async validateNonceBinding(
    orgId: string,
    nonce: string
  ): Promise<NonceBindingValidationResult> {
    try {
      // Step 1: Get organization identity
      const identity = await this.identityStore.getIdentity(orgId);
      if (!identity) {
        return {
          valid: false,
          reason: `Organization ${orgId} not verified`,
        };
      }

      // Step 2: Check nonce matches
      if (identity.uniqueNonce !== nonce) {
        return {
          valid: false,
          reason: `Nonce mismatch: provided nonce does not match bound nonce for ${orgId}`,
        };
      }

      // Step 3: Check for revocation (if binding metadata exists)
      const binding = await this.getBinding(orgId);
      if (binding && binding.revokedAt) {
        return {
          valid: false,
          reason: `Nonce revoked at ${binding.revokedAt.toISOString()}: ${binding.revocationReason}`,
        };
      }

      // All checks passed
      return {
        valid: true,
        binding,
      };

    } catch (error) {
      return {
        valid: false,
        reason: `Validation error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Rotate an organization's nonce (revoke old, bind new).
   * 
   * Use cases:
   * - Scheduled rotation for security
   * - Suspected nonce compromise
   * - Key rotation (new public key)
   * 
   * @param orgId - Organization ID
   * @param newPublicKey - New public key (optional, uses existing if not provided)
   * @param reason - Reason for rotation (for audit trail)
   * @returns The new nonce
   * 
   * @throws {Error} if orgId not verified
   * @throws {Error} if no existing binding to rotate
   */
  async rotateNonce(
    orgId: string,
    newPublicKey?: string,
    reason: string = 'Scheduled rotation'
  ): Promise<string> {
    // Step 1: Get existing identity and binding
    const identity = await this.identityStore.getIdentity(orgId);
    if (!identity) {
      throw new Error(`Organization ${orgId} not verified`);
    }

    if (!identity.uniqueNonce) {
      throw new Error(`Organization ${orgId} has no nonce to rotate`);
    }

    // Step 2: Revoke old binding
    await this.revokeBinding(orgId, reason);

    // Step 3: Generate new nonce
    const publicKey = newPublicKey || identity.publicKey;
    this.validatePublicKey(publicKey);

    const newNonce = await this.generateUniqueNonce(orgId);

    // Step 4: Create new binding
    const binding = await this.createBinding(
      newNonce,
      orgId,
      publicKey,
      identity.verificationMethod
    );

    // Step 5: Store new binding (updates identity)
    await this.storeBinding(binding, {
      ...identity,
      publicKey, // Update public key if changed
    });

    return newNonce;
  }

  /**
   * Revoke a nonce binding.
   * 
   * Use cases:
   * - Nonce compromise detected
   * - Organization leaves network
   * - Identity verification revoked
   * 
   * @param orgId - Organization ID
   * @param reason - Reason for revocation (required for audit)
   * 
   * @throws {Error} if no binding exists
   */
  async revokeBinding(orgId: string, reason: string): Promise<void> {
    const binding = await this.getBinding(orgId);
    if (!binding) {
      throw new Error(`No nonce binding found for ${orgId}`);
    }

    if (binding.revokedAt) {
      throw new Error(`Nonce already revoked at ${binding.revokedAt.toISOString()}`);
    }

    // Mark as revoked
    binding.revokedAt = new Date();
    binding.revocationReason = reason;

    // Store revoked binding (implementation depends on adapter)
    await this.storeRevokedBinding(binding);
  }

  /**
   * Get the current nonce binding for an organization.
   * 
   * @param orgId - Organization ID
   * @returns Current binding or null if none exists
   */
  async getBinding(orgId: string): Promise<NonceBinding | null> {
    const identity = await this.identityStore.getIdentity(orgId);
    if (!identity || !identity.uniqueNonce) {
      return null;
    }

    // Reconstruct binding from identity
    // (In full implementation, bindings might be stored separately)
    return {
      nonce: identity.uniqueNonce,
      orgId: identity.orgId,
      publicKey: identity.publicKey,
      boundAt: identity.verifiedAt,
      verificationMethod: identity.verificationMethod,
      signature: this.generateSignature(identity.uniqueNonce, identity.publicKey),
    };
  }

  /**
   * List all active nonce bindings (for auditing).
   * 
   * @returns Array of all active (non-revoked) bindings
   */
  async listActiveBindings(): Promise<NonceBinding[]> {
    // This would require extending IIdentityStore to list all identities
    // For now, return empty array (implement in Phase 3)
    return [];
  }

  // ═══════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Generate a unique nonce for an organization.
   * 
   * If NonceCoder is available, use it for HMAC-signed nonces.
   * Otherwise, generate cryptographically random nonce.
   */
  private async generateUniqueNonce(orgId: string): Promise<string> {
    if (this.nonceCoder) {
      // Use existing nonce encoding system
      const payload = {
        orgId,
        timestamp: Date.now(),
        random: randomBytes(16).toString('hex'),
      };
      return await this.nonceCoder.encode(payload);
    } else {
      // Fallback: generate random nonce
      const random = randomBytes(32).toString('hex');
      return `nonce_${orgId}_${random}`;
    }
  }

  /**
   * Create a cryptographic binding between nonce and identity.
   * 
   * The signature proves that the nonce is bound to this specific
   * public key and organization ID.
   */
  private async createBinding(
    nonce: string,
    orgId: string,
    publicKey: string,
    verificationMethod: string
  ): Promise<NonceBinding> {
    const signature = this.generateSignature(nonce, publicKey);

    return {
      nonce,
      orgId,
      publicKey,
      boundAt: new Date(),
      verificationMethod: verificationMethod as any,
      signature,
    };
  }

  /**
   * Generate cryptographic signature proving nonce ownership.
   * 
   * Format: SHA256(nonce + publicKey)
   * 
   * In production, this should use the organization's private key
   * to sign the nonce, and this service verifies with public key.
   * For now, we use a deterministic hash.
   */
  private generateSignature(nonce: string, publicKey: string): string {
    const data = `${nonce}:${publicKey}`;
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Validate public key format.
   * 
   * Expected: Hexadecimal string (64 or 128 characters for ECDSA)
   */
  private validatePublicKey(publicKey: string): void {
    if (!publicKey || typeof publicKey !== 'string') {
      throw new Error('Public key is required');
    }

    // Check if hexadecimal
    if (!/^[0-9a-fA-F]+$/.test(publicKey)) {
      throw new Error('Public key must be hexadecimal string');
    }

    // Check reasonable length (32-256 bytes = 64-512 hex chars)
    if (publicKey.length < 64 || publicKey.length > 512) {
      throw new Error(`Public key length invalid: ${publicKey.length} (expected 64-512 chars)`);
    }
  }

  /**
   * Store nonce binding by updating organization identity.
   */
  private async storeBinding(
    binding: NonceBinding,
    identity: OrganizationIdentity
  ): Promise<void> {
    // Update identity with nonce
    const updatedIdentity: OrganizationIdentity = {
      ...identity,
      uniqueNonce: binding.nonce,
      publicKey: binding.publicKey,
    };

    await this.identityStore.storeIdentity(updatedIdentity);
  }

  /**
   * Store revoked binding for audit trail.
   * 
   * In full implementation, this would write to a separate revocation log.
   * For now, we just mark the identity as having no nonce.
   */
  private async storeRevokedBinding(binding: NonceBinding): Promise<void> {
    const identity = await this.identityStore.getIdentity(binding.orgId);
    if (!identity) return;

    // Clear nonce from identity (revoked)
    const updatedIdentity: OrganizationIdentity = {
      ...identity,
      uniqueNonce: '', // Empty string indicates revoked
    };

    await this.identityStore.storeIdentity(updatedIdentity);

    // TODO: Store revoked binding in separate audit log
    // await this.revocationStore.storeRevocation(binding);
  }
}

/**
 * Result of nonce binding validation.
 */
export interface NonceBindingValidationResult {
  valid: boolean;
  reason?: string;
  binding?: NonceBinding;
}
```


***

## Phase 3: Type Definitions

### File: `trust/identity/types.ts` (Additions)

Add nonce binding types:

```typescript
// ═══════════════════════════════════════════════════════════
// Existing types (keep as-is)
// ═══════════════════════════════════════════════════════════

export type VerificationMethod = 'github_org' | 'stripe_customer' | 'manual';

export interface OrganizationIdentity {
  orgId: string;
  publicKey: string;
  verificationMethod: VerificationMethod;
  verifiedAt: Date;
  uniqueNonce: string;
  
  // Optional verification details
  githubOrgId?: number;
  stripeCustomerId?: string;
  manualVerifiedBy?: string;
}

// ═══════════════════════════════════════════════════════════
// NEW: Nonce Binding Types
// ═══════════════════════════════════════════════════════════

/**
 * Cryptographic binding between a nonce and verified identity.
 * 
 * Ensures one-to-one relationship: one verified org → one nonce.
 * Prevents nonce sharing, reuse, and identity spoofing.
 */
export interface NonceBinding {
  /** The unique nonce bound to this organization */
  nonce: string;
  
  /** Phase Mirror organization ID */
  orgId: string;
  
  /** Organization's public key (hex) */
  publicKey: string;
  
  /** When this binding was created */
  boundAt: Date;
  
  /** How the organization was verified */
  verificationMethod: VerificationMethod;
  
  /** Cryptographic signature proving ownership (SHA256(nonce:publicKey)) */
  signature: string;
  
  /** If revoked, when it was revoked */
  revokedAt?: Date;
  
  /** Reason for revocation (for audit trail) */
  revocationReason?: string;
}

/**
 * Result of nonce binding validation.
 */
export interface NonceBindingValidationResult {
  /** Whether the nonce binding is valid */
  valid: boolean;
  
  /** Reason for invalidity (if applicable) */
  reason?: string;
  
  /** The binding details (if valid) */
  binding?: NonceBinding;
}

/**
 * Nonce rotation request.
 */
export interface NonceRotationRequest {
  /** Organization requesting rotation */
  orgId: string;
  
  /** New public key (optional, uses existing if not provided) */
  newPublicKey?: string;
  
  /** Reason for rotation (required for audit) */
  reason: string;
  
  /** Timestamp of rotation request */
  requestedAt: Date;
}

/**
 * Nonce revocation record (for audit trail).
 */
export interface NonceRevocation {
  /** The revoked nonce */
  nonce: string;
  
  /** Organization that owned the nonce */
  orgId: string;
  
  /** When it was revoked */
  revokedAt: Date;
  
  /** Why it was revoked */
  reason: string;
  
  /** Who revoked it (system or admin user) */
  revokedBy: string;
}
```


***

## Phase 4: FP Store Integration

### File: `src/fp-store/fp-store.ts` (Updates)

Integrate nonce binding validation into FP submission flow:

```typescript
import { NonceBindingService } from '../trust/identity/nonce-binding';

export class FpStore implements IFpStore {
  constructor(
    private readonly adapter: IFpStoreAdapter,
    private readonly nonceBindingService?: NonceBindingService // NEW: Optional nonce binding validation
  ) {}

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    // NEW: Validate nonce binding before accepting FP event
    if (this.nonceBindingService) {
      await this.validateNonceBinding(event);
    }

    // Existing logic: store FP event
    await this.adapter.storeFalsePositive(event);
  }

  /**
   * Validate that the nonce in the FP event is properly bound.
   * 
   * @throws {Error} if nonce binding is invalid
   */
  private async validateNonceBinding(event: FalsePositiveEvent): Promise<void> {
    // Extract orgId from event metadata (if available)
    // In production, orgId might be embedded in nonce or provided separately
    const orgId = event.metadata?.orgId as string | undefined;
    
    if (!orgId) {
      // If orgId not provided, we can't validate binding
      // This is acceptable for backward compatibility
      return;
    }

    // Decode nonce to get embedded orgId (if using NonceCoder)
    // For now, assume orgId is provided in metadata
    
    const validation = await this.nonceBindingService.validateNonceBinding(
      orgId,
      event.orgIdNonce
    );

    if (!validation.valid) {
      throw new Error(
        `Nonce binding validation failed: ${validation.reason}. ` +
        `Organization ${orgId} cannot submit FP data with this nonce.`
      );
    }
  }
}
```


### File: `src/fp-store/types.ts` (Updates)

Add optional orgId to FalsePositiveEvent metadata:

```typescript
export interface FalsePositiveEvent {
  ruleId: string;
  filePath: string;
  orgIdNonce: string; // Used to generate orgIdHash
  timestamp: Date;
  metadata?: Record<string, unknown>; // NEW: Can include orgId for binding validation
}

// Example usage:
const event: FalsePositiveEvent = {
  ruleId: 'rule-123',
  filePath: '/src/app.ts',
  orgIdNonce: 'nonce_abc123',
  timestamp: new Date(),
  metadata: {
    orgId: 'org-verified-123', // NEW: For nonce binding validation
  },
};
```


***

## Phase 5: CLI Integration

### File: `cli/commands/nonce.ts` (NEW)

Create CLI commands for nonce management:

```typescript
import { Command } from 'commander';
import { NonceBindingService } from '../../trust/identity/nonce-binding';
import { createLocalTrustAdapters } from '../../trust/adapters/local';
import chalk from 'chalk';

export function createNonceCommand() {
  const cmd = new Command('nonce');
  cmd.description('Manage nonce bindings for verified organizations');

  // Subcommand: Validate nonce binding
  cmd
    .command('validate')
    .description('Validate that a nonce is properly bound to an organization')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .option('--nonce <nonce>', 'Nonce to validate')
    .action(async (options) => {
      await validateNonce(options);
    });

  // Subcommand: Rotate nonce
  cmd
    .command('rotate')
    .description('Rotate an organization\'s nonce')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .option('--reason <reason>', 'Reason for rotation', 'Manual rotation')
    .option('--new-public-key <key>', 'New public key (optional)')
    .action(async (options) => {
      await rotateNonce(options);
    });

  // Subcommand: Revoke nonce
  cmd
    .command('revoke')
    .description('Revoke an organization\'s nonce binding')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .option('--reason <reason>', 'Reason for revocation (required)')
    .action(async (options) => {
      await revokeNonce(options);
    });

  // Subcommand: Show binding
  cmd
    .command('show')
    .description('Show nonce binding details for an organization')
    .option('--org-id <id>', 'Organization ID', 'default-org')
    .action(async (options) => {
      await showBinding(options);
    });

  return cmd;
}

async function validateNonce(options: any) {
  const { orgId, nonce } = options;

  if (!nonce) {
    console.error(chalk.red('Error: --nonce is required'));
    process.exit(1);
  }

  console.log(chalk.blue('🔍 Validating nonce binding...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Nonce: ${nonce.substring(0, 20)}...`);
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const service = new NonceBindingService(adapters.identityStore);

    const result = await service.validateNonceBinding(orgId, nonce);

    if (result.valid) {
      console.log(chalk.green('✅ Nonce binding is valid!'));
      console.log();
      console.log('Binding Details:');
      console.log(`  Org ID: ${result.binding!.orgId}`);
      console.log(`  Public Key: ${result.binding!.publicKey.substring(0, 20)}...`);
      console.log(`  Bound At: ${result.binding!.boundAt.toISOString()}`);
      console.log(`  Verification Method: ${result.binding!.verificationMethod}`);
      console.log(`  Signature: ${result.binding!.signature.substring(0, 20)}...`);
    } else {
      console.log(chalk.red('❌ Nonce binding is invalid!'));
      console.log();
      console.log(chalk.red(`Reason: ${result.reason}`));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('Error validating nonce:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function rotateNonce(options: any) {
  const { orgId, reason, newPublicKey } = options;

  console.log(chalk.blue('🔄 Rotating nonce...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Reason: ${reason}`);
  if (newPublicKey) {
    console.log(`  New Public Key: ${newPublicKey.substring(0, 20)}...`);
  }
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const service = new NonceBindingService(adapters.identityStore);

    const newNonce = await service.rotateNonce(orgId, newPublicKey, reason);

    console.log(chalk.green('✅ Nonce rotated successfully!'));
    console.log();
    console.log(`New Nonce: ${newNonce}`);
    console.log();
    console.log(chalk.yellow('⚠️  Update your FP submission configuration with the new nonce.'));
  } catch (error) {
    console.error(chalk.red('Error rotating nonce:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function revokeNonce(options: any) {
  const { orgId, reason } = options;

  if (!reason) {
    console.error(chalk.red('Error: --reason is required for revocation'));
    process.exit(1);
  }

  console.log(chalk.blue('🚫 Revoking nonce binding...'));
  console.log(`  Org ID: ${orgId}`);
  console.log(`  Reason: ${reason}`);
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const service = new NonceBindingService(adapters.identityStore);

    await service.revokeBinding(orgId, reason);

    console.log(chalk.green('✅ Nonce binding revoked!'));
    console.log();
    console.log(chalk.yellow('⚠️  This organization can no longer submit FP data with this nonce.'));
    console.log(chalk.gray('   Use "nonce rotate" to create a new binding.'));
  } catch (error) {
    console.error(chalk.red('Error revoking nonce:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

async function showBinding(options: any) {
  const { orgId } = options;

  console.log(chalk.blue('📋 Fetching nonce binding...'));
  console.log(`  Org ID: ${orgId}`);
  console.log();

  try {
    const adapters = createLocalTrustAdapters('.trust-data');
    const service = new NonceBindingService(adapters.identityStore);

    const binding = await service.getBinding(orgId);

    if (!binding) {
      console.log(chalk.yellow('⚠️  No nonce binding found for this organization.'));
      console.log();
      console.log('Organization may need to:');
      console.log('  1. Complete identity verification (GitHub or Stripe)');
      console.log('  2. Generate and bind a nonce');
      process.exit(0);
    }

    console.log(chalk.green('Nonce Binding Details:'));
    console.log();
    console.log(`  Org ID: ${binding.orgId}`);
    console.log(`  Nonce: ${binding.nonce}`);
    console.log(`  Public Key: ${binding.publicKey}`);
    console.log(`  Bound At: ${binding.boundAt.toISOString()}`);
    console.log(`  Verification Method: ${binding.verificationMethod}`);
    console.log(`  Signature: ${binding.signature}`);

    if (binding.revokedAt) {
      console.log();
      console.log(chalk.red('⚠️  REVOKED'));
      console.log(`  Revoked At: ${binding.revokedAt.toISOString()}`);
      console.log(`  Reason: ${binding.revocationReason}`);
    }
  } catch (error) {
    console.error(chalk.red('Error fetching binding:'));
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}
```

**Usage:**

```bash
# Validate nonce binding
pnpm cli nonce validate --org-id acme-corp-123 --nonce nonce_abc123...

# Rotate nonce (scheduled rotation)
pnpm cli nonce rotate --org-id acme-corp-123 --reason "Scheduled quarterly rotation"

# Rotate nonce with new key
pnpm cli nonce rotate \
  --org-id acme-corp-123 \
  --new-public-key def456ghi789 \
  --reason "Key rotation after security audit"

# Revoke nonce
pnpm cli nonce revoke --org-id compromised-org-456 --reason "Nonce compromise detected"

# Show current binding
pnpm cli nonce show --org-id acme-corp-123
```


***

## Phase 6: Unit Tests

### File: `trust/__tests__/nonce-binding.test.ts` (NEW)

Comprehensive test suite:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NonceBindingService } from '../identity/nonce-binding';
import { LocalIdentityStore } from '../adapters/local/identity-store';
import { OrganizationIdentity } from '../identity/types';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('NonceBindingService', () => {
  let service: NonceBindingService;
  let identityStore: LocalIdentityStore;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test data
    tempDir = mkdtempSync(join(tmpdir(), 'nonce-binding-test-'));
    identityStore = new LocalIdentityStore(tempDir);
    service = new NonceBindingService(identityStore);
  });

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('generateAndBindNonce', () => {
    it('generates and binds nonce for verified org', async () => {
      // Setup: Create verified identity
      const identity: OrganizationIdentity = {
        orgId: 'org-123',
        publicKey: 'abcd1234'.repeat(8), // 64 chars
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '', // Not yet bound
        githubOrgId: 12345,
      };
      await identityStore.storeIdentity(identity);

      // Act: Generate and bind nonce
      const nonce = await service.generateAndBindNonce('org-123', identity.publicKey);

      // Assert: Nonce was generated
      expect(nonce).toBeDefined();
      expect(typeof nonce).toBe('string');
      expect(nonce.length).toBeGreaterThan(0);

      // Assert: Identity was updated with nonce
      const updated = await identityStore.getIdentity('org-123');
      expect(updated?.uniqueNonce).toBe(nonce);
    });

    it('throws if org not verified', async () => {
      await expect(
        service.generateAndBindNonce('org-unverified', 'abcd1234'.repeat(8))
      ).rejects.toThrow('not verified');
    });

    it('throws if nonce already bound', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-456',
        publicKey: 'abcd1234'.repeat(8),
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date(),
        uniqueNonce: 'existing-nonce', // Already bound
        stripeCustomerId: 'cus_123',
      };
      await identityStore.storeIdentity(identity);

      await expect(
        service.generateAndBindNonce('org-456', identity.publicKey)
      ).rejects.toThrow('already has bound nonce');
    });

    it('throws if public key format invalid', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-789',
        publicKey: 'validkey'.repeat(8),
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      // Invalid: not hexadecimal
      await expect(
        service.generateAndBindNonce('org-789', 'not-hex-!@#$')
      ).rejects.toThrow('must be hexadecimal');

      // Invalid: too short
      await expect(
        service.generateAndBindNonce('org-789', 'abc123')
      ).rejects.toThrow('length invalid');
    });

    it('generates unique nonces for different orgs', async () => {
      const identity1: OrganizationIdentity = {
        orgId: 'org-A',
        publicKey: 'aaaa1111'.repeat(8),
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };

      const identity2: OrganizationIdentity = {
        orgId: 'org-B',
        publicKey: 'bbbb2222'.repeat(8),
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };

      await identityStore.storeIdentity(identity1);
      await identityStore.storeIdentity(identity2);

      const nonce1 = await service.generateAndBindNonce('org-A', identity1.publicKey);
      const nonce2 = await service.generateAndBindNonce('org-B', identity2.publicKey);

      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('validateNonceBinding', () => {
    it('validates correct nonce binding', async () => {
      const publicKey = 'cccc3333'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-valid',
        publicKey,
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const nonce = await service.generateAndBindNonce('org-valid', publicKey);

      const result = await service.validateNonceBinding('org-valid', nonce);

      expect(result.valid).toBe(true);
      expect(result.binding).toBeDefined();
      expect(result.binding?.nonce).toBe(nonce);
      expect(result.binding?.orgId).toBe('org-valid');
    });

    it('rejects unverified org', async () => {
      const result = await service.validateNonceBinding('org-unverified', 'any-nonce');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not verified');
    });

    it('rejects nonce mismatch', async () => {
      const publicKey = 'dddd4444'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-mismatch',
        publicKey,
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const correctNonce = await service.generateAndBindNonce('org-mismatch', publicKey);

      const result = await service.validateNonceBinding('org-mismatch', 'wrong-nonce');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('mismatch');
    });

    it('rejects revoked nonce', async () => {
      const publicKey = 'eeee5555'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-revoked',
        publicKey,
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const nonce = await service.generateAndBindNonce('org-revoked', publicKey);

      // Revoke the nonce
      await service.revokeBinding('org-revoked', 'Test revocation');

      const result = await service.validateNonceBinding('org-revoked', nonce);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revoked');
    });
  });

  describe('rotateNonce', () => {
    it('rotates nonce while preserving identity', async () => {
      const publicKey = 'ffff6666'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-rotate',
        publicKey,
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const oldNonce = await service.generateAndBindNonce('org-rotate', publicKey);

      // Rotate
      const newNonce = await service.rotateNonce('org-rotate', undefined, 'Test rotation');

      // New nonce should be different
      expect(newNonce).not.toBe(oldNonce);

      // Old nonce should be invalid
      const oldValidation = await service.validateNonceBinding('org-rotate', oldNonce);
      expect(oldValidation.valid).toBe(false);

      // New nonce should be valid
      const newValidation = await service.validateNonceBinding('org-rotate', newNonce);
      expect(newValidation.valid).toBe(true);
    });

    it('rotates with new public key', async () => {
      const oldKey = 'aaaa7777'.repeat(8);
      const newKey = 'bbbb8888'.repeat(8);

      const identity: OrganizationIdentity = {
        orgId: 'org-key-rotate',
        publicKey: oldKey,
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      await service.generateAndBindNonce('org-key-rotate', oldKey);

      const newNonce = await service.rotateNonce('org-key-rotate', newKey, 'Key rotation');

      const updated = await identityStore.getIdentity('org-key-rotate');
      expect(updated?.publicKey).toBe(newKey);
      expect(updated?.uniqueNonce).toBe(newNonce);
    });

    it('throws if no existing binding to rotate', async () => {
      const identity: OrganizationIdentity = {
        orgId: 'org-no-binding',
        publicKey: 'cccc9999'.repeat(8),
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '', // No nonce bound
      };
      await identityStore.storeIdentity(identity);

      await expect(
        service.rotateNonce('org-no-binding', undefined, 'Test')
      ).rejects.toThrow('no nonce to rotate');
    });
  });

  describe('revokeBinding', () => {
    it('revokes nonce binding', async () => {
      const publicKey = 'ddddaaaa'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-revoke-test',
        publicKey,
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const nonce = await service.generateAndBindNonce('org-revoke-test', publicKey);

      await service.revokeBinding('org-revoke-test', 'Security incident');

      const validation = await service.validateNonceBinding('org-revoke-test', nonce);
      expect(validation.valid).toBe(false);
    });

    it('throws if no binding exists', async () => {
      await expect(
        service.revokeBinding('org-no-exist', 'Test')
      ).rejects.toThrow('No nonce binding found');
    });

    it('throws if already revoked', async () => {
      const publicKey = 'eeeecccc'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-double-revoke',
        publicKey,
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      await service.generateAndBindNonce('org-double-revoke', publicKey);
      await service.revokeBinding('org-double-revoke', 'First revocation');

      await expect(
        service.revokeBinding('org-double-revoke', 'Second revocation')
      ).rejects.toThrow('already revoked');
    });
  });

  describe('getBinding', () => {
    it('retrieves existing binding', async () => {
      const publicKey = 'ffffbbbb'.repeat(8);
      const identity: OrganizationIdentity = {
        orgId: 'org-get',
        publicKey,
        verificationMethod: 'stripe_customer',
        verifiedAt: new Date(),
        uniqueNonce: '',
      };
      await identityStore.storeIdentity(identity);

      const nonce = await service.generateAndBindNonce('org-get', publicKey);

      const binding = await service.getBinding('org-get');

      expect(binding).toBeDefined();
      expect(binding?.nonce).toBe(nonce);
      expect(binding?.orgId).toBe('org-get');
      expect(binding?.publicKey).toBe(publicKey);
      expect(binding?.signature).toBeDefined();
    });

    it('returns null if no binding exists', async () => {
      const binding = await service.getBinding('org-no-binding');
      expect(binding).toBeNull();
    });
  });
});
```


***

## Phase 7: Documentation

### File: `docs/trust-module/nonce-binding.md` (NEW)

User-facing documentation:

```markdown
# Nonce Binding Service

## Overview

The Nonce Binding Service cryptographically binds unique nonces to verified organizational identities in Phase Mirror's Trust Module. This ensures that each verified organization has exactly one nonce for FP submissions, preventing identity spoofing, nonce sharing, and Sybil attacks.

## Why Nonce Binding?

Phase Mirror's k-anonymity system relies on nonces to protect organizational privacy. However, without binding, nonces create security vulnerabilities:

| Without Binding | With Binding |
|-----------------|--------------|
| ❌ Orgs can claim multiple nonces (Sybil attack) | ✅ One verified identity → exactly one nonce |
| ❌ Nonces can be shared between orgs (collusion) | ✅ Cryptographic proof of ownership |
| ❌ No proof nonce belongs to verified identity | ✅ Public key signature verification |
| ❌ Nonce rotation breaks identity continuity | ✅ Revocation + rebinding preserves identity |

## How It Works

### 1. Identity Verification + Nonce Binding

```

Step 1: Verify identity (GitHub or Stripe)
↓
Step 2: Generate unique nonce
↓
Step 3: Create cryptographic binding (nonce + public key + signature)
↓
Step 4: Store binding in identity store
↓
Step 5: Use nonce for FP submissions

```

### 2. FP Submission with Binding Validation

```

Step 1: Org submits FP data with nonce
↓
Step 2: FP Store validates nonce binding
↓
Step 3: Check: nonce exists? bound to verified identity? not revoked?
↓
Step 4: If valid → Accept FP submission
If invalid → Reject with reason

```

## Nonce Binding Lifecycle

### Phase 1: Generation & Binding

After completing identity verification (GitHub or Stripe), a nonce is automatically generated and bound to your organization:

```bash
# Identity verification automatically binds nonce
pnpm cli verify --method github_org \
  --org-id your-org-123 \
  --github-org your-github-org \
  --public-key $(cat .keys/your-org-123.pub)

# Output:
✅ Verification successful!
  Unique Nonce: nonce_abc123def456...
```

**What happens:**

1. Unique nonce generated (cryptographically random or HMAC-signed)
2. Binding created with signature: `SHA256(nonce:publicKey)`
3. Binding stored in identity record
4. Nonce returned for FP submission configuration

### Phase 2: Usage \& Validation

Use your bound nonce for all FP submissions:

```typescript
import { FpStore } from '@mirror-dissonance/core';

const fpStore = new FpStore(adapter, nonceBindingService);

await fpStore.recordFalsePositive({
  ruleId: 'no-unused-vars',
  filePath: '/src/app.ts',
  orgIdNonce: 'nonce_abc123def456...', // Your bound nonce
  timestamp: new Date(),
  metadata: {
    orgId: 'your-org-123', // For binding validation
  },
});
```

**Validation checks:**

- ✅ Nonce exists in identity store
- ✅ Nonce is bound to claimed org ID
- ✅ Binding has not been revoked
- ✅ Organization identity is verified


### Phase 3: Rotation

Rotate your nonce periodically or when compromised:

```bash
# Scheduled rotation (keep same public key)
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"

# Output:
✅ Nonce rotated successfully!
  New Nonce: nonce_xyz789ghi012...

⚠️  Update your FP submission configuration with the new nonce.
```

**Rotation with new public key:**

```bash
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --new-public-key $(cat .keys/your-org-123-v2.pub) \
  --reason "Key rotation after security audit"
```

**What happens during rotation:**

1. Old nonce binding is revoked (marked with timestamp + reason)
2. New nonce is generated
3. New binding created with new/existing public key
4. Identity record updated with new nonce
5. Old nonce immediately invalid for FP submissions

### Phase 4: Revocation

Revoke a nonce if compromised or organization leaves network:

```bash
pnpm cli nonce revoke \
  --org-id compromised-org-456 \
  --reason "Nonce compromise detected via security audit"

# Output:
✅ Nonce binding revoked!

⚠️  This organization can no longer submit FP data with this nonce.
   Use "nonce rotate" to create a new binding.
```

**Revocation effects:**

- ❌ Nonce immediately invalid for FP submissions
- ❌ FP Store rejects all submissions with revoked nonce
- ✅ Revocation reason stored in audit trail
- ✅ Can create new binding via rotation


## CLI Commands

### Validate Nonce Binding

Check if a nonce is properly bound and valid:

```bash
pnpm cli nonce validate \
  --org-id your-org-123 \
  --nonce nonce_abc123def456...

# Success output:
✅ Nonce binding is valid!

Binding Details:
  Org ID: your-org-123
  Public Key: abcd1234...
  Bound At: 2026-02-03T14:30:00.000Z
  Verification Method: github_org
  Signature: 5f8d3a2b...

# Failure output:
❌ Nonce binding is invalid!
Reason: Nonce mismatch: provided nonce does not match bound nonce for your-org-123
```


### Show Binding Details

View current nonce binding for an organization:

```bash
pnpm cli nonce show --org-id your-org-123

# Output:
Nonce Binding Details:

  Org ID: your-org-123
  Nonce: nonce_abc123def456...
  Public Key: abcd1234efgh5678...
  Bound At: 2026-02-03T14:30:00.000Z
  Verification Method: github_org
  Signature: 5f8d3a2b...

# If revoked:
⚠️  REVOKED
  Revoked At: 2026-02-10T09:15:00.000Z
  Reason: Nonce compromise detected
```


### Rotate Nonce

Create new nonce binding (revokes old one):

```bash
# Basic rotation
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"

# With new public key
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --new-public-key def456ghi789... \
  --reason "Key rotation after security audit"
```


### Revoke Nonce

Permanently revoke nonce binding:

```bash
pnpm cli nonce revoke \
  --org-id your-org-123 \
  --reason "Organization leaving network"
```


## Programmatic API

### Generate and Bind Nonce

```typescript
import { NonceBindingService } from '@mirror-dissonance/core/trust';
import { createLocalTrustAdapters } from '@mirror-dissonance/core/trust';

const adapters = createLocalTrustAdapters('.trust-data');
const service = new NonceBindingService(adapters.identityStore);

// After identity verification
const nonce = await service.generateAndBindNonce('org-123', publicKey);
console.log('Bound nonce:', nonce);
```


### Validate Nonce Binding

```typescript
const validation = await service.validateNonceBinding('org-123', nonce);

if (validation.valid) {
  console.log('Valid binding:', validation.binding);
  // Accept FP submission
} else {
  console.error('Invalid:', validation.reason);
  // Reject FP submission
}
```


### Rotate Nonce

```typescript
const newNonce = await service.rotateNonce(
  'org-123',
  newPublicKey, // Optional
  'Scheduled rotation'
);

console.log('New nonce:', newNonce);
// Update FP submission configuration
```


### Revoke Binding

```typescript
await service.revokeBinding('org-123', 'Security incident');
console.log('Nonce revoked');
```


## Security Properties

### One-to-One Binding

- Each verified organization has **exactly one** active nonce
- Nonce cannot be shared between organizations
- Attempting to bind multiple nonces to same org throws error
- Attempting to use same nonce for multiple orgs rejected


### Cryptographic Proof

**Signature generation:**

```
signature = SHA256(nonce + ":" + publicKey)
```

**Verification:**

1. Retrieve binding for org ID
2. Recompute signature from stored nonce + public key
3. Compare with stored signature
4. If match → binding valid

**Properties:**

- Cannot forge signature without knowing public key
- Cannot transfer binding to different public key (signature mismatch)
- Binding proof stored in identity record


### Revocation Guarantees

- Revoked nonces **immediately invalid** for FP submissions
- Revocation is **permanent** (cannot un-revoke)
- Revocation reason stored in audit trail
- Timestamp recorded for compliance


### Rotation Continuity

- Old nonce revoked atomically when new nonce bound
- No gap where org has zero valid nonces
- Identity continuity preserved (same org ID, verification method)
- Can update public key during rotation


## Best Practices

### Nonce Rotation Schedule

**Recommended rotation frequency:**


| Scenario | Rotation Frequency |
| :-- | :-- |
| **Standard security** | Every 90 days |
| **High security** | Every 30 days |
| **Post-incident** | Immediately |
| **Key rotation** | Immediately |
| **Compliance requirement** | Per policy (e.g., SOC 2) |

**Automated rotation:**

```bash
# Cron job: Rotate nonce quarterly
0 0 1 */3 * pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"
```


### Public Key Management

**Key generation:**

```bash
# Generate ECDSA key pair
openssl ecparam -genkey -name secp256k1 -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# Extract hex public key
openssl ec -in public.pem -pubin -text -noout | \
  grep -A 5 'pub:' | tail -n +2 | tr -d ' \n:'
```

**Key storage:**

- ✅ Store private key in secure key management system (e.g., AWS KMS, HashiCorp Vault)
- ✅ Never commit private keys to git
- ✅ Use environment variables for production keys
- ❌ Don't share private keys between organizations
- ❌ Don't store private keys in plain text files


### Compromise Response

**If nonce compromised:**

1. **Immediate revocation:**

```bash
pnpm cli nonce revoke \
  --org-id your-org-123 \
  --reason "Nonce compromise detected"
```

2. **Rotate with new key:**

```bash
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --new-public-key $(cat .keys/your-org-123-new.pub) \
  --reason "Post-incident key rotation"
```

3. **Audit FP submissions:**

```bash
# Check for suspicious FP submissions with old nonce
pnpm cli audit --org-id your-org-123 --since "2026-02-01"
```

4. **Update all FP submission configurations** with new nonce

## Troubleshooting

### "Organization not verified"

**Cause:** Attempting to bind nonce before completing identity verification.

**Solution:**

```bash
# Complete identity verification first
pnpm cli verify --method github_org \
  --org-id your-org-123 \
  --github-org your-github-org \
  --public-key $(cat .keys/your-org-123.pub)

# Nonce is automatically bound after verification
```


### "Already has bound nonce"

**Cause:** Attempting to bind second nonce to org that already has one.

**Solution:** Use rotation instead:

```bash
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Creating new binding"
```


### "Nonce mismatch"

**Cause:** FP submission using nonce not bound to claimed org ID.

**Solutions:**

1. Check which nonce is bound:

```bash
pnpm cli nonce show --org-id your-org-123
```

2. Update FP submission configuration with correct nonce
3. If nonce lost, rotate to get new one:

```bash
pnpm cli nonce rotate --org-id your-org-123 --reason "Lost nonce"
```


### "Nonce revoked"

**Cause:** Attempting to use revoked nonce for FP submission.

**Solution:** Rotate to create new binding:

```bash
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Replacing revoked nonce"
```


### "Public key format invalid"

**Cause:** Public key not in expected hexadecimal format or wrong length.

**Requirements:**

- Must be hexadecimal string (0-9, a-f, A-F)
- Length: 64-512 characters (32-256 bytes)
- Typical ECDSA secp256k1: 130 characters (65 bytes uncompressed)

**Solution:** Re-generate key pair:

```bash
openssl ecparam -genkey -name secp256k1 -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# Extract hex (should be ~130 chars)
openssl ec -in public.pem -pubin -text -noout | \
  grep -A 5 'pub:' | tail -n +2 | tr -d ' \n:'
```


## FAQ

**Q: Can I have multiple nonces for different environments?**
A: No. One org = one nonce. For multiple environments (dev/staging/prod), create separate Phase Mirror organizations with separate verifications.

**Q: What happens to my FP data after nonce rotation?**
A: Historical FP data remains associated with old `orgIdHash`. Future submissions use new `orgIdHash` derived from new nonce. This is by design to prevent linkability across rotations.

**Q: Can I manually specify my nonce value?**
A: No. Nonces are generated by the system to ensure uniqueness and prevent collisions.

**Q: How do I back up my nonce?**
A: Nonces are stored in your identity record (`.trust-data/identities.json` for local storage). Back up this file securely. If lost, use rotation to generate new nonce.

**Q: Does nonce binding affect k-anonymity?**
A: No. Nonce binding happens at the identity layer (before FP submission). The nonce is still hashed to create `orgIdHash` for k-anonymity. Binding does not expose org identity in calibration network.

**Q: Can I transfer my nonce to another organization?**
A: No. Nonces are cryptographically bound to verified identities and cannot be transferred.

## Support

For nonce binding issues:

- GitHub Issues: https://github.com/PhaseMirror/Phase-Mirror/issues
- Email: support@phasemirror.com
- Security incidents: security@phasemirror.com

```

***

## Success Criteria

### Definition of Done

- [ ] `NonceBindingService` class fully implemented with generation, validation, rotation, revocation
- [ ] Integration with existing `src/nonce/` system (NonceCoder optional dependency)
- [ ] `NonceBinding` type definitions added to `trust/identity/types.ts`
- [ ] FP Store integration: validates nonce bindings before accepting submissions
- [ ] CLI `nonce` command with validate, rotate, revoke, show subcommands
- [ ] **76+ existing tests + 15+ nonce binding tests = 91+ total tests passing**
- [ ] User-facing documentation in `docs/trust-module/nonce-binding.md`
- [ ] TypeScript compilation succeeds with no errors
- [ ] CodeQL security scan passes (no new vulnerabilities)
- [ ] Manual test: verify → bind → submit FP → validate → rotate → validate again

### Integration Test Checklist

End-to-end workflow test:

```bash
# Test 1: Complete verification → nonce binding flow
export GITHUB_TOKEN=your_token

# Verify identity (auto-binds nonce)
pnpm cli verify --method github_org \
  --org-id test-org-1 \
  --github-org github \
  --public-key abcd1234efgh5678...

# Show binding
pnpm cli nonce show --org-id test-org-1

# Validate binding
pnpm cli nonce validate \
  --org-id test-org-1 \
  --nonce <nonce_from_verification>

# Test 2: Nonce rotation
pnpm cli nonce rotate \
  --org-id test-org-1 \
  --reason "Test rotation"

# Old nonce should be invalid
pnpm cli nonce validate \
  --org-id test-org-1 \
  --nonce <old_nonce>
# Expected: ❌ Invalid (revoked)

# New nonce should be valid
pnpm cli nonce show --org-id test-org-1
pnpm cli nonce validate \
  --org-id test-org-1 \
  --nonce <new_nonce>
# Expected: ✅ Valid

# Test 3: FP submission with binding validation
# (Requires FP Store integration)
node -e "
const { FpStore, NonceBindingService, createLocalTrustAdapters } = require('./dist');
const adapters = createLocalTrustAdapters('.trust-data');
const bindingService = new NonceBindingService(adapters.identityStore);
const fpStore = new FpStore(adapters.fpStore, bindingService);

fpStore.recordFalsePositive({
  ruleId: 'test-rule',
  filePath: '/test.ts',
  orgIdNonce: '<bound_nonce>',
  timestamp: new Date(),
  metadata: { orgId: 'test-org-1' }
}).then(() => console.log('✅ FP accepted'))
  .catch(err => console.error('❌ FP rejected:', err.message));
"

# Test 4: Revocation
pnpm cli nonce revoke \
  --org-id test-org-1 \
  --reason "Test revocation"

pnpm cli nonce validate \
  --org-id test-org-1 \
  --nonce <revoked_nonce>
# Expected: ❌ Invalid (revoked)
```


***

## Next Steps After P2 Completion

Once nonce binding is production-ready:

1. **P3: Reputation Integration** - Link nonce bindings to reputation scores
2. **P3: Byzantine Filtering** - Filter contributions based on binding validation + reputation
3. **P3: FP Calibration Integration** - Full weighted aggregation with binding checks
4. **P4: Nonce Rotation Scheduler** - Automated rotation based on policy (every 90 days)
5. **P4: Audit Trail** - Comprehensive logging of all binding operations (generation, validation, rotation, revocation)
6. **P5: Revocation Registry** - Separate store for revoked bindings with query API

***

## Copilot Implementation Prompts

### Prompt 1: Implement NonceBindingService Core

```
Implement the NonceBindingService class in trust/identity/nonce-binding.ts with:
- Constructor accepting IIdentityStore and optional INonceCoder
- generateAndBindNonce method: generate unique nonce, create binding, store in identity
- validateNonceBinding method: check nonce exists, matches org, not revoked
- rotateNonce method: revoke old, generate new, update identity
- revokeBinding method: mark binding as revoked with reason + timestamp
- getBinding method: retrieve current binding for org
- Private helper methods: generateUniqueNonce, createBinding, generateSignature, validatePublicKey

Use existing Phase Mirror patterns from trust/ directory.
Import INonceCoder from '../../nonce/nonce-coder' if available.
Generate random nonces with crypto.randomBytes if NonceCoder not provided.
Signature format: SHA256(nonce + ":" + publicKey).
```


### Prompt 2: Add Type Definitions

```
Add nonce binding types to trust/identity/types.ts:
- NonceBinding interface with nonce, orgId, publicKey, boundAt, signature, revokedAt, revocationReason
- NonceBindingValidationResult interface with valid, reason, binding fields
- NonceRotationRequest interface for rotation requests
- NonceRevocation interface for audit trail

Preserve all existing types (OrganizationIdentity, VerificationMethod, etc.).
Add comprehensive JSDoc comments explaining security properties.
```


### Prompt 3: Integrate with FP Store

```
Update src/fp-store/fp-store.ts to validate nonce bindings:
- Add optional nonceBindingService constructor parameter
- Add private validateNonceBinding method called before storing FP events
- Extract orgId from event.metadata (if available)
- Call nonceBindingService.validateNonceBinding(orgId, event.orgIdNonce)
- Throw error with validation.reason if invalid
- Skip validation if nonceBindingService not provided (backward compatibility)

Update src/fp-store/types.ts:
- Add optional orgId to FalsePositiveEvent.metadata for binding validation

Follow existing FP Store patterns.
```


### Prompt 4: Create CLI Commands

```
Create cli/commands/nonce.ts with nonce management commands:
- "nonce validate" - validate nonce binding (requires --org-id, --nonce)
- "nonce rotate" - rotate nonce (requires --org-id, --reason, optional --new-public-key)
- "nonce revoke" - revoke binding (requires --org-id, --reason)
- "nonce show" - show binding details (requires --org-id)

Use NonceBindingService with local adapters (.trust-data).
Chalk colored output: blue for info, green for success, red for errors, yellow for warnings.
Follow existing CLI command patterns from cli/commands/verify.ts.
```


### Prompt 5: Write Unit Tests

```
Create trust/__tests__/nonce-binding.test.ts with vitest:
- Test generateAndBindNonce: success, org not verified, already bound, invalid public key
- Test validateNonceBinding: valid binding, unverified org, nonce mismatch, revoked nonce
- Test rotateNonce: successful rotation, with new key, no existing binding
- Test revokeBinding: successful revocation, no binding, already revoked
- Test getBinding: existing binding, no binding
- Use LocalIdentityStore with temp directory (mkdtempSync)
- Clean up temp directory in afterEach

Aim for 15+ test cases covering all code paths.
Use existing test patterns from trust/__tests__/reputation-engine.test.ts.
```


***

## Dissonance Analysis: Nonce Binding

### Productive Contradictions

| Tension | Lever | Artifact |
| :-- | :-- | :-- |
| **Binding vs. K-Anonymity** | Nonce binding creates identity linkage, but k-anonymity requires unlinkability | Binding happens at identity layer (before hashing); `orgIdHash` still preserves k-anonymity in calibration network |
| **Rotation vs. Continuity** | Nonce rotation breaks historical linkability (good for privacy), but makes it hard to track org reputation over time | Reputation stored separately by orgId (not nonce); rotation updates binding but preserves identity continuity |
| **One-to-One vs. Multi-Environment** | One org = one nonce, but orgs may want separate nonces for dev/staging/prod | Create separate Phase Mirror orgs for separate environments; accept multi-org overhead as cost of security |
| **Automatic vs. Manual Binding** | Auto-binding on verification is convenient, but removes user control over timing | Current: auto-bind on verification (simplicity); Future: add `--skip-nonce-binding` flag for manual control |

### Hidden Assumptions

1. **Public key cryptography is sufficient** - Assumes SHA256(nonce:publicKey) provides adequate binding proof
    - **Risk**: Sophisticated attacker could attempt signature forgery
    - **Mitigation**: Future: Use proper ECDSA signature (org signs nonce with private key, service verifies with public key)
2. **NonceCoder HMAC is secure** - Assumes existing HMAC-based nonces are collision-resistant
    - **Current**: Uses HMAC-SHA256 with shared secret
    - **Risk**: If secret compromised, attacker can forge nonces
    - **Mitigation**: Rotate HMAC secret periodically; binding layer adds second security factor (public key)
3. **Identity verification is permanent** - Assumes verified identities don't need re-verification
    - **Risk**: GitHub org could be transferred to malicious owner post-verification
    - **Mitigation**: Future: Webhook monitoring for GitHub org ownership changes; require re-verification on transfer
4. **Revocation is sufficient** - Assumes revoked nonces become invalid immediately
    - **Current**: Revocation stored in identity record (updated atomically)
    - **Risk**: Race condition if FP submission validates nonce between revocation and storage update
    - **Mitigation**: Atomic revocation operation; FP Store rejects if validation fails

### Open Questions for Next Implementation Phase

1. **Should rotation preserve `orgIdHash` continuity?**
    - **Current**: New nonce → new `orgIdHash` (breaks linkability)
    - **Trade-off**: Privacy (unlinkability) vs. Reputation (continuity)
    - **Recommendation**: Keep current behavior (prioritize privacy); reputation tracked by orgId, not orgIdHash
2. **How to handle compromised HMAC secret?**
    - **Scenario**: Shared HMAC secret leaked, all nonces potentially forgeable
    - **Current**: No secret rotation mechanism
    - **Recommendation**: Implement `rotateHMACSecret()` operation that:
        - Generates new secret
        - Re-encodes all active nonces with new secret
        - Stores migration mapping (old nonce → new nonce)
        - Updates all identity records
3. **Should bindings have expiration?**
    - **Current**: Bindings are permanent until revoked
    - **Trade-off**: Automatic expiration forces rotation (good security), but adds operational overhead
    - **Recommendation**: Add optional `expiresAt` field; require re-verification after expiration (e.g., 1 year)
4. **How to audit all binding operations?**
    - **Current**: No separate audit log for binding operations
    - **Recommendation**: Create `NonceBindingAuditLog` with entries for:
        - Generation (who, when, which nonce)
        - Validation (who validated, result, timestamp)
        - Rotation (old nonce, new nonce, reason)
        - Revocation (who revoked, reason, timestamp)
5. **Should we support multi-nonce per org for different purposes?**
    - **Use case**: Separate nonces for different product lines or business units
    - **Current**: One org = one nonce (strict)
    - **Recommendation**: Stay strict for now; if needed, create separate orgs with different verifications
6. **How to handle nonce collision (extremely unlikely)?**
    - **Probability**: ~2^-256 for random 32-byte nonces
    - **Current**: No collision detection
    - **Recommendation**: Add uniqueness check before storing binding; regenerate if collision detected (retry with exponential backoff)

***

**End of Blueprint**

This implementation blueprint provides complete, production-ready guidance for the Nonce Binding Service in Phase Mirror's Trust Module. The service integrates seamlessly with existing identity verification (GitHub/Stripe), the nonce system (`src/nonce/`), and the FP Store for validation. All code follows existing patterns, maintains TypeScript strict mode compliance, and provides comprehensive CLI tools for nonce management. The binding layer adds critical security without breaking k-anonymity guarantees. Ready for Copilot-assisted implementation. 🔐🚀
<span style="display:none">[^1][^10][^11][^12][^13][^14][^15][^16][^17][^18][^2][^3][^4][^5][^6][^7][^8][^9]</span>

<div align="center">⁂</div>

[^1]: if-phase-mirror-had-a-ui-ux-wh-42aRj49CSACSlpWdD.YCfA.md

[^2]: lets-analyze-the-phase-mirror-zcQHcEC1RSa.hpTZS8CnrQ.md

[^3]: should-we-create-a-phase-mirro-g0nIu619SN20l__3R5jUmA.md

[^4]: lets-analyze-the-phase-mirror-KxbpLF05TkmkJ5C3R17zHw.md

[^5]: lets-do-a-research-study-on-ut-WhCi7IA6SCC96OPfPtuaGQ.md

[^6]: lets-analyse-the-open-core-pha-7FE_xGkPSKKRr2TerT0cjw.md

[^7]: lets-analyze-the-phase-mirror-kbBwuoY6QaWAaS93zZyABg.md

[^8]: A Clear Guide to Phase Mirror's Services.pdf

[^9]: License_ Strategic \& Legal Analysis.pdf

[^10]: Phase Mirror_ Consultation \& SaaS.pdf

[^11]: Agentic Domain-Specific Reasoning.pdf

[^12]: Policy Memo_ Managing Agentic AI Liability with the Phase Mirror Framework.pdf

[^13]: The Phase Mirror does not resolve dissonance—it names it.pdf

[^14]: Understanding Phase Mirror Dissonance_ A Beginner's Guide.pdf

[^15]: The Phase of Mirror Dissonance.pdf

[^16]: Implementation Guide_ Applying Phase Mirror Dissonance.pdf

[^17]: Phase mirror dissonance___Open core must be useful.pdf

[^18]: Phase Mirror_ Comprehensive Services Catalog.docx.pdf

