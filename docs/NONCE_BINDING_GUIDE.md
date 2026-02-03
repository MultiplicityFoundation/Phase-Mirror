# Nonce Binding User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Usage Phases](#usage-phases)
4. [CLI Commands](#cli-commands)
5. [Programmatic API](#programmatic-api)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

## Overview

The Nonce Binding system cryptographically binds unique nonces to verified organizational identities in Phase Mirror. This prevents Sybil attacks, ensures one-to-one mapping between verified identities and nonces, and maintains k-anonymity guarantees for false positive submissions.

### Why Nonce Binding?

**Without Nonce Binding:**
- ❌ Organizations could claim multiple nonces (Sybil attack)
- ❌ Nonces could be shared between organizations (collusion)
- ❌ No proof that nonce belongs to verified identity
- ❌ Nonce rotation breaks identity continuity

**With Nonce Binding:**
- ✅ One verified identity → exactly one nonce (1:1 binding)
- ✅ Cryptographic proof of nonce ownership (SHA256 signature)
- ✅ Nonce cannot be transferred to different organization
- ✅ Rotation preserves identity binding (revocation + new binding)

## Getting Started

### Prerequisites

1. **Verified Organization Identity**
   - Complete GitHub or Stripe verification
   - Have your organization's public key

2. **Phase Mirror CLI Installed**
   ```bash
   npm install -g @mirror-dissonance/cli
   ```

3. **Data Directory** (optional)
   ```bash
   export PHASE_MIRROR_DATA_DIR=~/.phase-mirror-data
   ```

### Initial Setup

After identity verification, a nonce is automatically bound to your organization. You can also manually generate one:

```bash
oracle nonce generate \
  --org-id your-org-123 \
  --public-key $(cat .keys/your-org.pub)
```

**Output:**
```
🔐 Generating and binding nonce...

✓ Nonce generated and bound successfully

Binding details:
  Organization ID: your-org-123
  Nonce: a7f3e2d1c9b8a7f6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3a2
  Public Key: abcd1234efgh5678...
  Signature: 3c4d5e6f7a8b9c0d...
  Issued: 2026-02-03T14:30:00.000Z
  Is New: Yes

💡 Save this nonce securely. You'll need it for FP submissions.
```

## Usage Phases

### Phase 1: Generation

Generate and bind a nonce after identity verification:

```bash
oracle nonce generate --org-id your-org --public-key your-pubkey
```

### Phase 2: Usage & Validation

Use your bound nonce for all FP submissions:

**Programmatic Usage:**
```typescript
import { FPStoreWithNonceValidation, createFPStoreWithNonceValidation } from '@mirror-dissonance/core';

// Create FP Store with nonce validation
const fpStore = createFPStore(config);
const fpStoreWithValidation = createFPStoreWithNonceValidation(
  fpStore,
  nonceBindingService
);

// Submit FP with nonce
await fpStoreWithValidation.recordFalsePositive({
  id: 'fp-1',
  ruleId: 'no-unused-vars',
  findingId: 'finding-123',
  timestamp: new Date().toISOString(),
  resolvedBy: 'user@example.com',
  context: {},
  orgIdNonce: 'nonce_abc123def456...', // Your bound nonce
  metadata: {
    orgId: 'your-org-123', // For binding validation
  },
});
```

**Validation Checks:**
- ✅ Nonce exists in identity store
- ✅ Nonce is bound to claimed org ID
- ✅ Binding has not been revoked
- ✅ Organization identity is verified

### Phase 3: Rotation

Rotate your nonce periodically or when compromised:

**Scheduled Rotation (keep same public key):**
```bash
oracle nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"
```

**Rotation with New Public Key:**
```bash
oracle nonce rotate \
  --org-id your-org-123 \
  --new-public-key $(cat .keys/your-org-v2.pub) \
  --reason "Key rotation after security audit"
```

**What Happens During Rotation:**
1. Old nonce binding is revoked (marked with timestamp + reason)
2. New nonce is generated
3. New binding created with new/existing public key
4. Identity record updated with new nonce
5. Old nonce immediately invalid for FP submissions

### Phase 4: Revocation

Revoke a nonce if compromised or organization leaves network:

```bash
oracle nonce revoke \
  --org-id compromised-org-456 \
  --reason "Nonce compromise detected via security audit"
```

**Revocation Effects:**
- ❌ Nonce immediately invalid for FP submissions
- ❌ FP Store rejects all submissions with revoked nonce
- ✅ Revocation reason stored in audit trail
- ✅ Can create new binding via rotation

## CLI Commands

### `oracle nonce validate`

Check if a nonce is properly bound and valid.

**Syntax:**
```bash
oracle nonce validate \
  --org-id <orgId> \
  --nonce <nonce> \
  [--verbose]
```

**Options:**
- `--org-id <orgId>` - Organization ID (required)
- `--nonce <nonce>` - Nonce to validate (required)
- `-v, --verbose` - Show detailed binding information (optional)

**Example:**
```bash
oracle nonce validate \
  --org-id your-org-123 \
  --nonce nonce_abc123def456... \
  --verbose
```

**Success Output:**
```
🔍 Validating nonce binding...

✓ Nonce is valid and properly bound

Binding details:
  Org ID: your-org-123
  Nonce: nonce_abc123def456...
  Public Key: abcd1234efgh5678...
  Issued: 2026-02-03T14:30:00.000Z
  Usage Count: 42
  Revoked: No
```

**Failure Output:**
```
🔍 Validating nonce binding...

✗ Nonce binding is invalid!

Reason: Nonce mismatch: provided nonce does not match bound nonce for your-org-123
```

### `oracle nonce show`

View current nonce binding for an organization.

**Syntax:**
```bash
oracle nonce show --org-id <orgId>
```

**Example:**
```bash
oracle nonce show --org-id your-org-123
```

**Output (Active Binding):**
```
📋 Nonce Binding Details

  Org ID: your-org-123
  Nonce: nonce_abc123def456...
  Public Key: abcd1234efgh5678...
  Bound At: 2026-02-03T14:30:00.000Z
  Signature: 5f8d3a2b...
  Usage Count: 42

✓ Active
```

**Output (Revoked Binding):**
```
📋 Nonce Binding Details

  Org ID: your-org-123
  Nonce: nonce_abc123def456...
  Public Key: abcd1234efgh5678...
  Bound At: 2026-02-03T14:30:00.000Z
  Signature: 5f8d3a2b...
  Usage Count: 89

⚠️  REVOKED
  Revoked At: 2026-02-10T09:15:00.000Z
  Reason: Nonce compromise detected
```

### `oracle nonce generate`

Generate and bind a new nonce for a verified organization.

**Syntax:**
```bash
oracle nonce generate \
  --org-id <orgId> \
  --public-key <key>
```

**Options:**
- `--org-id <orgId>` - Organization ID (required)
- `--public-key <key>` - Organization's public key (required)

### `oracle nonce rotate`

Rotate nonce for an organization (creates new nonce, revokes old one).

**Syntax:**
```bash
oracle nonce rotate \
  --org-id <orgId> \
  [--public-key <key>] \
  [--new-public-key <key>] \
  --reason <reason>
```

**Options:**
- `--org-id <orgId>` - Organization ID (required)
- `--public-key <key>` - Public key (uses existing if not provided) (optional)
- `--new-public-key <key>` - New public key for rotation (optional)
- `-r, --reason <reason>` - Reason for rotation (required)

**Examples:**
```bash
# Basic rotation (keeps existing public key)
oracle nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"

# Rotation with new public key
oracle nonce rotate \
  --org-id your-org-123 \
  --new-public-key def456ghi789... \
  --reason "Key rotation after security audit"
```

### `oracle nonce revoke`

Permanently revoke nonce binding.

**Syntax:**
```bash
oracle nonce revoke \
  --org-id <orgId> \
  --reason <reason>
```

**Options:**
- `--org-id <orgId>` - Organization ID (required)
- `-r, --reason <reason>` - Reason for revocation (required)

### `oracle nonce list`

List nonce bindings.

**Syntax:**
```bash
oracle nonce list \
  [--org-id <orgId>] \
  [--show-revoked]
```

**Options:**
- `--org-id <orgId>` - Filter by organization ID (optional)
- `--show-revoked` - Include revoked bindings (optional, default: false)

### `oracle nonce history`

Show rotation history for an organization.

**Syntax:**
```bash
oracle nonce history --org-id <orgId>
```

**Options:**
- `--org-id <orgId>` - Organization ID (required)

## Programmatic API

### Generate and Bind Nonce

```typescript
import { NonceBindingService } from '@mirror-dissonance/core/trust';
import { createLocalTrustAdapters } from '@mirror-dissonance/core/trust';

const adapters = createLocalTrustAdapters('.trust-data');
const service = new NonceBindingService(adapters.identityStore);

// After identity verification
const result = await service.generateAndBindNonce('org-123', publicKey);
console.log('Bound nonce:', result.binding.nonce);
```

### Validate Nonce Binding

```typescript
const validation = await service.verifyBinding(nonce, 'org-123');

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
const result = await service.rotateNonce(
  'org-123',
  newPublicKey, // Optional, uses existing if not provided
  'Scheduled rotation'
);

console.log('New nonce:', result.binding.nonce);
// Update FP submission configuration
```

### Revoke Binding

```typescript
await service.revokeBinding('org-123', 'Security incident');
console.log('Nonce revoked');
```

### FP Store Integration

```typescript
import {
  createFPStore,
  createFPStoreWithNonceValidation,
} from '@mirror-dissonance/core';

// Create base FP Store
const fpStore = createFPStore(config);

// Wrap with nonce validation
const fpStoreWithValidation = createFPStoreWithNonceValidation(
  fpStore,
  nonceBindingService
);

// Submit FP with nonce validation
try {
  await fpStoreWithValidation.recordFalsePositive({
    id: 'fp-1',
    ruleId: 'rule-1',
    findingId: 'finding-1',
    timestamp: new Date().toISOString(),
    resolvedBy: 'user@example.com',
    context: {},
    orgIdNonce: nonce,
    metadata: {
      orgId: 'org-123',
    },
  });
  console.log('FP recorded successfully');
} catch (error) {
  if (error.name === 'NonceValidationError') {
    console.error('Nonce validation failed:', error.message);
  }
}
```

## Best Practices

### Nonce Rotation Schedule

| Scenario | Rotation Frequency |
|----------|-------------------|
| Standard security | Every 90 days |
| High security | Every 30 days |
| Post-incident | Immediately |
| Key rotation | Immediately |
| Compliance requirement | Per policy (e.g., SOC 2) |

**Automated Rotation:**
```bash
# Cron job: Rotate nonce quarterly
0 0 1 */3 * oracle nonce rotate \
  --org-id your-org-123 \
  --reason "Scheduled quarterly rotation"
```

### Public Key Management

**Key Generation:**
```bash
# Generate ECDSA key pair
openssl ecparam -genkey -name secp256k1 -out private.pem
openssl ec -in private.pem -pubout -out public.pem

# Extract hex public key
openssl ec -in public.pem -pubin -text -noout | \
  grep -A 5 'pub:' | tail -n +2 | tr -d ' \n:'
```

**Key Storage:**
- ✅ Store private key in secure key management system (e.g., AWS KMS, HashiCorp Vault)
- ✅ Never commit private keys to git
- ✅ Use environment variables for production keys
- ❌ Don't share private keys between organizations
- ❌ Don't store private keys in plain text files

### Compromise Response

If nonce compromised:

1. **Immediate Revocation:**
   ```bash
   oracle nonce revoke \
     --org-id your-org-123 \
     --reason "Nonce compromise detected"
   ```

2. **Rotate with New Key:**
   ```bash
   oracle nonce rotate \
     --org-id your-org-123 \
     --new-public-key $(cat .keys/your-org-123-new.pub) \
     --reason "Post-incident key rotation"
   ```

3. **Audit FP Submissions:**
   ```bash
   # Check for suspicious FP submissions with old nonce
   oracle audit --org-id your-org-123 --since "2026-02-01"
   ```

4. Update all FP submission configurations with new nonce

## Troubleshooting

### "Organization not verified"

**Cause:** Attempting to bind nonce before completing identity verification.

**Solution:**
```bash
# Complete identity verification first
oracle verify --method github_org \
  --org-id your-org-123 \
  --github-org your-github-org \
  --public-key $(cat .keys/your-org-123.pub)

# Nonce is automatically bound after verification
```

### "Already has bound nonce"

**Cause:** Attempting to bind second nonce to org that already has one.

**Solution:** Use rotation instead:
```bash
oracle nonce rotate \
  --org-id your-org-123 \
  --reason "Creating new binding"
```

### "Nonce mismatch"

**Cause:** FP submission using nonce not bound to claimed org ID.

**Solutions:**

1. Check which nonce is bound:
   ```bash
   oracle nonce show --org-id your-org-123
   ```

2. Update FP submission configuration with correct nonce

3. If nonce lost, rotate to get new one:
   ```bash
   oracle nonce rotate --org-id your-org-123 --reason "Lost nonce"
   ```

### "Nonce revoked"

**Cause:** Attempting to use revoked nonce for FP submission.

**Solution:** Rotate to create new binding:
```bash
oracle nonce rotate \
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

### Q: Can I have multiple nonces for different environments?

**A:** No. One org = one nonce. For multiple environments (dev/staging/prod), create separate Phase Mirror organizations with separate verifications.

### Q: What happens to my FP data after nonce rotation?

**A:** Historical FP data remains associated with old orgIdHash. Future submissions use new orgIdHash derived from new nonce. This is by design to prevent linkability across rotations.

### Q: Can I manually specify my nonce value?

**A:** No. Nonces are generated by the system to ensure uniqueness and prevent collisions.

### Q: How do I back up my nonce?

**A:** Nonces are stored in your identity record (`.phase-mirror-data/identities.json` for local storage). Back up this file securely. If lost, use rotation to generate new nonce.

### Q: Does nonce binding affect k-anonymity?

**A:** No. Nonce binding happens at the identity layer (before FP submission). The nonce is still hashed to create orgIdHash for k-anonymity. Binding does not expose org identity in calibration network.

### Q: Can I transfer my nonce to another organization?

**A:** No. Nonces are cryptographically bound to verified identities and cannot be transferred.

## Support

For nonce binding issues:

- **GitHub Issues:** https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Email:** support@phasemirror.com
- **Security Incidents:** security@phasemirror.com

## See Also

- [Nonce Binding Service Documentation](../packages/mirror-dissonance/src/trust/identity/NONCE_BINDING.md)
- [CLI Commands Reference](../packages/cli/docs/NONCE_COMMANDS.md)
- [Trust Module Overview](../packages/mirror-dissonance/src/trust/README.md)
