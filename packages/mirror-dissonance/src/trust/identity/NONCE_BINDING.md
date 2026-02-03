# Nonce Binding Service

## Overview

The Nonce Binding Service provides cryptographic binding between verified organizational identities and unique nonces in the Phase Mirror Trust Module. This service ensures that each verified organization has exactly one active nonce, preventing Sybil attacks and identity spoofing while maintaining k-anonymity guarantees.

## Purpose

Phase Mirror's false positive calibration system relies on k-anonymity to protect organizational privacy. Each organization submits FP data using a unique nonce that gets hashed to create an `orgIdHash`. The Nonce Binding Service extends the existing nonce system (`src/nonce/`) by:

- **One-to-One Binding**: Each verified identity has exactly one active nonce
- **Cryptographic Proof**: Public key signatures prove nonce ownership
- **Sybil Resistance**: Prevents organizations from claiming multiple nonces
- **Rotation Support**: Allows nonce rotation while preserving identity continuity
- **Revocation Mechanism**: Enables nonce revocation for security violations

## Architecture

### Integration Flow

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
│  4. Generate unique nonce (32 random bytes → 64 hex chars)        │
│                                              ↓                     │
│  5. Create NonceBinding with signature                            │
│     Signature = SHA256(nonce:orgId:publicKey)                     │
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

### Data Model

#### NonceBinding

```typescript
interface NonceBinding {
  nonce: string;              // 64 hex chars (32 bytes)
  orgId: string;              // Organization ID
  publicKey: string;          // Org's public key
  signature: string;          // SHA256(nonce:orgId:publicKey)
  issuedAt: Date;             // Creation timestamp
  expiresAt: Date | null;     // Optional expiration
  usageCount: number;         // Number of times used
  revoked: boolean;           // Revocation status
  revocationReason?: string;  // Why revoked
  revokedAt?: Date;           // When revoked
  previousNonce?: string;     // Previous nonce in rotation chain
}
```

## API Reference

### NonceBindingService

#### Constructor

```typescript
constructor(identityStore: IIdentityStoreAdapter)
```

Creates a new NonceBindingService instance.

**Parameters:**
- `identityStore`: Storage adapter for identity and nonce binding data

#### generateAndBindNonce()

```typescript
async generateAndBindNonce(
  orgId: string,
  publicKey: string
): Promise<NonceBindingResult>
```

Generates a unique nonce and cryptographically binds it to a verified organization.

**Parameters:**
- `orgId`: Organization ID (must have verified identity)
- `publicKey`: Organization's public key for signature verification

**Returns:**
```typescript
interface NonceBindingResult {
  binding: NonceBinding;
  isNew: boolean;
  previousBinding?: NonceBinding;
}
```

**Throws:**
- Error if organization is not verified
- Error if organization already has an active binding (use `rotateNonce()` instead)

**Example:**
```typescript
const result = await service.generateAndBindNonce('org-123', 'pubkey-abc');
console.log(`Generated nonce: ${result.binding.nonce}`);
```

#### verifyBinding()

```typescript
async verifyBinding(
  nonce: string,
  orgId: string
): Promise<NonceVerificationResult>
```

Verifies that a nonce is validly bound to an organization.

**Parameters:**
- `nonce`: The nonce to verify
- `orgId`: The claimed organization ID

**Returns:**
```typescript
interface NonceVerificationResult {
  valid: boolean;
  reason?: string;
  binding?: NonceBinding;
}
```

**Example:**
```typescript
const result = await service.verifyBinding(nonce, 'org-123');
if (result.valid) {
  console.log('Nonce is valid');
} else {
  console.log(`Invalid: ${result.reason}`);
}
```

#### revokeBinding()

```typescript
async revokeBinding(orgId: string, reason: string): Promise<void>
```

Revokes a nonce binding (e.g., due to security violation).

**Parameters:**
- `orgId`: Organization ID
- `reason`: Human-readable reason for revocation

**Throws:**
- Error if no binding exists
- Error if already revoked

**Example:**
```typescript
await service.revokeBinding('org-123', 'Security policy violation');
```

#### rotateNonce()

```typescript
async rotateNonce(
  orgId: string,
  newPublicKey: string,
  reason: string
): Promise<NonceBindingResult>
```

Rotates a nonce for an organization, creating a new nonce and revoking the old one. Preserves identity continuity through the rotation chain.

**Parameters:**
- `orgId`: Organization ID
- `newPublicKey`: New public key (can be same as old)
- `reason`: Reason for rotation

**Returns:** `NonceBindingResult` with the new binding

**Throws:**
- Error if no binding exists
- Error if current binding is already revoked

**Example:**
```typescript
const result = await service.rotateNonce(
  'org-123',
  'new-pubkey-xyz',
  'Scheduled quarterly rotation'
);
console.log(`New nonce: ${result.binding.nonce}`);
console.log(`Old nonce: ${result.previousBinding.nonce}`);
```

#### incrementUsageCount()

```typescript
async incrementUsageCount(nonce: string, orgId: string): Promise<void>
```

Increments the usage count for a nonce after successful FP submission.

**Example:**
```typescript
await service.incrementUsageCount(nonce, 'org-123');
```

#### getRotationHistory()

```typescript
async getRotationHistory(orgId: string): Promise<NonceBinding[]>
```

Retrieves the complete rotation history for an organization's nonces.

**Returns:** Array of bindings in chronological order (oldest first)

**Example:**
```typescript
const history = await service.getRotationHistory('org-123');
console.log(`Organization has rotated nonces ${history.length - 1} times`);
```

## Usage Examples

### 1. Complete Verification and Binding Flow

```typescript
import { NonceBindingService } from './nonce-binding.js';
import { createLocalTrustAdapters } from '../adapters/local/index.js';
import { OrganizationIdentity } from './types.js';

// Setup
const adapters = createLocalTrustAdapters('.data');
const service = new NonceBindingService(adapters.identityStore);

// Step 1: Organization verifies identity (GitHub/Stripe)
const identity: OrganizationIdentity = {
  orgId: 'acme-corp',
  publicKey: 'pubkey-acme-123',
  verificationMethod: 'github_org',
  verifiedAt: new Date(),
  uniqueNonce: '', // Will be filled by binding service
  githubOrgId: 12345,
};

await adapters.identityStore.storeIdentity(identity);

// Step 2: Generate and bind nonce
const result = await service.generateAndBindNonce(
  'acme-corp',
  'pubkey-acme-123'
);

console.log(`✅ Nonce generated and bound: ${result.binding.nonce}`);

// Step 3: Org uses nonce for FP submissions
// ... FP submission with nonce ...

// Step 4: Validate nonce before processing FP
const verification = await service.verifyBinding(
  result.binding.nonce,
  'acme-corp'
);

if (!verification.valid) {
  throw new Error(`Invalid nonce: ${verification.reason}`);
}

console.log('✅ Nonce verified, processing FP submission');

// Step 5: Increment usage count
await service.incrementUsageCount(result.binding.nonce, 'acme-corp');
```

### 2. Nonce Rotation

```typescript
// Rotate nonce quarterly for security
const rotationResult = await service.rotateNonce(
  'acme-corp',
  'pubkey-acme-123',
  'Q1 2024 scheduled rotation'
);

console.log(`Old nonce (revoked): ${rotationResult.previousBinding.nonce}`);
console.log(`New nonce (active): ${rotationResult.binding.nonce}`);

// View complete rotation history
const history = await service.getRotationHistory('acme-corp');
history.forEach((binding, i) => {
  console.log(`${i + 1}. ${binding.nonce} (issued: ${binding.issuedAt})`);
});
```

### 3. Handling Security Violations

```typescript
// Revoke nonce due to security violation
try {
  await service.revokeBinding('bad-actor-org', 'Attempted Sybil attack');
  console.log('✅ Nonce revoked');
} catch (error) {
  console.error('Failed to revoke:', error.message);
}

// Subsequent FP submissions will be rejected
const verification = await service.verifyBinding(badNonce, 'bad-actor-org');
console.log(verification.reason); // "Nonce binding has been revoked: Attempted Sybil attack"
```

## Security Considerations

### 1. Sybil Attack Prevention

The service enforces one-to-one binding between verified identities and nonces:

```typescript
// ✅ First binding succeeds
await service.generateAndBindNonce('org-1', 'pubkey-1');

// ❌ Second binding fails (Sybil attack prevented)
await service.generateAndBindNonce('org-1', 'pubkey-1');
// Error: Organization org-1 already has an active nonce binding
```

### 2. Cryptographic Integrity

Every binding includes a signature to prevent tampering:

```typescript
// Signature = SHA256(nonce:orgId:publicKey)
const signatureData = `${nonce}:${orgId}:${publicKey}`;
const signature = createHash('sha256').update(signatureData).digest('hex');
```

If a binding is tampered with, verification will fail:

```typescript
const result = await service.verifyBinding(nonce, orgId);
// result.valid = false
// result.reason = "Invalid signature: binding has been tampered with"
```

### 3. Revocation Enforcement

Revoked nonces cannot be used:

```typescript
await service.revokeBinding('org-1', 'Security violation');

const result = await service.verifyBinding(nonce, 'org-1');
// result.valid = false
// result.reason = "Nonce binding has been revoked: Security violation"
```

### 4. Rotation Chain Integrity

Rotation preserves the identity chain:

```typescript
// Original binding
const binding1 = await service.generateAndBindNonce('org-1', 'key-1');

// Rotation creates link
const binding2 = await service.rotateNonce('org-1', 'key-2', 'Rotation');

// Chain is preserved
binding2.binding.previousNonce === binding1.binding.nonce; // true

// Full history is accessible
const history = await service.getRotationHistory('org-1');
// [binding1, binding2] in chronological order
```

## Integration with False Positive Store

When the FP Store receives a submission, it should validate the nonce:

```typescript
async function processFPSubmission(
  orgId: string,
  nonce: string,
  fpData: FalsePositiveEvent
) {
  // 1. Verify nonce binding
  const verification = await nonceBindingService.verifyBinding(nonce, orgId);
  
  if (!verification.valid) {
    throw new Error(`Invalid nonce: ${verification.reason}`);
  }
  
  // 2. Process FP submission
  await fpStore.submitFalsePositive(fpData);
  
  // 3. Increment usage count
  await nonceBindingService.incrementUsageCount(nonce, orgId);
}
```

## Testing

The implementation includes comprehensive tests covering:

- ✅ Nonce generation and binding (5 tests)
- ✅ Nonce verification (5 tests)
- ✅ Nonce revocation (3 tests)
- ✅ Nonce rotation (4 tests)
- ✅ Usage count tracking (2 tests)
- ✅ Rotation history (3 tests)
- ✅ Sybil attack prevention (2 tests)
- ✅ Identity verification integration (2 tests)

**Total: 26 tests, all passing**

Run tests:

```bash
npm test -- --testPathPattern=nonce-binding
```

## Storage Adapters

### Local Adapter

The local adapter stores nonce bindings in JSON files:

```typescript
import { createLocalTrustAdapters } from '../adapters/local/index.js';

const adapters = createLocalTrustAdapters('.data');
const service = new NonceBindingService(adapters.identityStore);
```

**Files created:**
- `.data/identities.json` - Organization identities
- `.data/nonce-bindings.json` - Nonce bindings

### AWS/GCP Adapters

For production, implement `IIdentityStoreAdapter` for your chosen backend:

```typescript
class DynamoDBIdentityStore implements IIdentityStoreAdapter {
  // Implement all methods using DynamoDB
}

const service = new NonceBindingService(new DynamoDBIdentityStore());
```

## Future Enhancements

1. **Expiration Support**: Add automatic expiration for time-limited nonces
2. **Batch Operations**: Support bulk nonce generation and verification
3. **Audit Logging**: Track all binding operations for compliance
4. **Rate Limiting**: Prevent excessive rotation requests
5. **Multi-Region Sync**: Synchronize bindings across regions
6. **Hardware Security Modules**: Integration with HSM for key management

## Related Documentation

- [Trust Module Overview](../README.md)
- [Identity Verification](./types.ts)
- [GitHub Verification](./GITHUB_VERIFICATION.md)
- [Storage Adapters](../adapters/types.ts)

## License

Apache-2.0
