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
- Unique nonce generated (cryptographically random or HMAC-signed)
- Binding created with signature: `SHA256(nonce:publicKey)`
- Binding stored in identity record
- Nonce returned for FP submission configuration

### Phase 2: Usage & Validation

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
- Old nonce binding is revoked (marked with timestamp + reason)
- New nonce is generated
- New binding created with new/existing public key
- Identity record updated with new nonce
- Old nonce immediately invalid for FP submissions

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

## Security Best Practices

### 1. Regular Rotation
- Rotate nonces quarterly or after security audits
- Use rotation instead of revocation when possible (maintains continuity)

### 2. Key Management
- Keep public keys in secure storage
- Rotate public keys along with nonces during security audits
- Never share private keys

### 3. Revocation
- Revoke immediately upon compromise detection
- Document clear revocation reasons for audit trail
- Monitor for revoked nonce usage attempts

### 4. Validation
- Always validate nonces before FP submission
- Handle validation errors gracefully
- Log validation failures for security monitoring

## Integration Guide

### Setting Up Nonce Binding

```typescript
import { NonceBindingService } from '@mirror-dissonance/core';
import { createLocalTrustAdapters } from '@mirror-dissonance/core';

// Initialize trust adapters
const adapters = createLocalTrustAdapters('./data');
const nonceBindingService = new NonceBindingService(adapters.identityStore);

// Generate and bind nonce after verification
const result = await nonceBindingService.generateAndBindNonce(
  'your-org-123',
  'abcdef0123456789...'  // Your public key
);

console.log(`Nonce bound: ${result.binding.nonce}`);
```

### Validating Nonce Binding

```typescript
// Verify nonce before FP submission
const verification = await nonceBindingService.verifyBinding(
  nonce,
  orgId
);

if (!verification.valid) {
  throw new Error(`Nonce validation failed: ${verification.reason}`);
}

// Proceed with FP submission
await fpStore.recordFalsePositive(event);
```

### Handling Rotation

```typescript
// Rotate nonce
const rotationResult = await nonceBindingService.rotateNonce(
  'your-org-123',
  'newPublicKey1234567890...',  // Optional new key
  'Scheduled quarterly rotation'
);

console.log(`Old nonce: ${rotationResult.previousBinding?.nonce}`);
console.log(`New nonce: ${rotationResult.binding.nonce}`);

// Update application configuration
updateConfig({ nonce: rotationResult.binding.nonce });
```

## Troubleshooting

### "Organization not found or not verified"

**Cause:** Organization hasn't completed identity verification

**Solution:**
```bash
# Complete identity verification first
pnpm cli verify --method github_org \
  --org-id your-org-123 \
  --github-org your-github-org \
  --public-key $(cat .keys/your-org-123.pub)
```

### "Organization already has an active nonce binding"

**Cause:** Attempting to generate a second nonce

**Solution:**
- Use `nonce rotate` instead to replace existing binding
- Or revoke existing binding first, then generate new one

### "Nonce mismatch"

**Cause:** Submitted nonce doesn't match bound nonce

**Solution:**
```bash
# Check current binding
pnpm cli nonce show --org-id your-org-123

# Update your application configuration with correct nonce
```

### "Nonce binding has been revoked"

**Cause:** Nonce was revoked due to security or organizational changes

**Solution:**
```bash
# Rotate to create new binding
pnpm cli nonce rotate \
  --org-id your-org-123 \
  --reason "Recovery from revocation"
```

### "Public key must be hexadecimal"

**Cause:** Public key contains invalid characters

**Solution:**
- Ensure public key is hex-encoded (0-9, a-f, A-F)
- Minimum length: 32 characters
- Typical length: 64 characters

## API Reference

### NonceBindingService

#### Methods

**`generateAndBindNonce(orgId: string, publicKey: string): Promise<NonceBindingResult>`**
- Generates and binds a unique nonce to a verified organization
- Throws if org not verified or already has active binding
- Returns binding details with nonce

**`verifyBinding(nonce: string, orgId: string): Promise<NonceVerificationResult>`**
- Validates nonce binding for an organization
- Checks nonce match, revocation status, and signature integrity
- Returns validation result with reason if invalid

**`revokeBinding(orgId: string, reason: string): Promise<void>`**
- Revokes nonce binding for an organization
- Marks binding as revoked with timestamp and reason
- Throws if no binding exists or already revoked

**`rotateNonce(orgId: string, newPublicKey: string, reason: string): Promise<NonceBindingResult>`**
- Rotates nonce for an organization (revokes old, creates new)
- Optionally updates public key
- Maintains identity continuity via rotation chain
- Returns new binding details

**`getRotationHistory(orgId: string): Promise<NonceBinding[]>`**
- Gets chronological history of nonce rotations
- Returns array of bindings (oldest to newest)
- Follows previousNonce chain backward

### Types

```typescript
interface NonceBinding {
  nonce: string;
  orgId: string;
  publicKey: string;
  signature: string;
  issuedAt: Date;
  expiresAt: Date | null;
  usageCount: number;
  revoked: boolean;
  revocationReason?: string;
  revokedAt?: Date;
  previousNonce?: string;
}

interface NonceVerificationResult {
  valid: boolean;
  reason?: string;
  binding?: NonceBinding;
}

interface NonceBindingResult {
  binding: NonceBinding;
  isNew: boolean;
  previousBinding?: NonceBinding;
}
```

## FAQ

### Q: How often should I rotate nonces?

**A:** Recommended rotation schedule:
- **Quarterly**: For normal operations
- **Immediately**: Upon security audit findings
- **Immediately**: Upon suspected compromise
- **Annually**: For key rotation

### Q: What happens to FP data after nonce rotation?

**A:** Historical FP data remains associated with your organization through the rotation chain. The `previousNonce` field links old and new nonces, preserving identity continuity.

### Q: Can I have multiple active nonces?

**A:** No. This is a core security feature. One verified identity maps to exactly one active nonce to prevent Sybil attacks. Use rotation to replace an existing nonce.

### Q: What if I lose my public key?

**A:** You'll need to:
1. Complete identity verification again with a new public key
2. Contact support if the old binding needs to be revoked
3. Generate a new nonce binding with the new key

### Q: How is the nonce signature generated?

**A:** Signature is `SHA256(nonce:orgId:publicKey)`. This cryptographic binding proves:
- Nonce belongs to specific organization
- Public key is associated with the nonce
- Binding cannot be tampered with

### Q: Can nonces expire?

**A:** By default, nonces don't expire (`expiresAt: null`). However, the system supports optional expiration for future use cases. Revocation is the primary mechanism for invalidating nonces.

## Related Documentation

- [NONCE_BINDING_GUIDE.md](../NONCE_BINDING_GUIDE.md) - General nonce binding guide
- [Trust Module Architecture](../architecture.md#trust-module) - Overall trust module design
- [False Positive Calibration](../Phase%202_%20FP%20Calibration%20Service%20(Days%208-21).md) - FP system integration
- [Security Best Practices](../SECURITY.md) - General security guidelines
