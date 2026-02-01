# ConsentStore Implementation Guide

## Overview

The `ConsentStore` class provides a production-ready, DynamoDB-backed implementation of granular consent management with caching, audit trails, and privacy features.

## Features

### Core Capabilities
- **DynamoDB Storage**: Persistent storage of consent records
- **In-Memory Caching**: 5-minute TTL cache (configurable) for performance
- **Resource-Level Consent**: Track consent for 6 granular resources
- **Audit Trail**: Complete history of consent changes
- **Privacy-First**: Automatic hashing of organization and admin IDs
- **Expiration Handling**: Automatic detection of expired consent
- **Version Tracking**: Detect policy version mismatches

### Supported Resources
1. `fp_patterns` - False positive patterns (Medium risk)
2. `fp_metrics` - FP rate metrics (Low risk)
3. `cross_org_benchmarks` - Cross-org benchmarking (High risk)
4. `rule_calibration` - Rule tuning data (Medium risk)
5. `audit_logs` - Governance audit logs (High risk)
6. `drift_baselines` - Historical baselines (Low risk)

## Installation

```typescript
import { ConsentStore } from '@mirror-dissonance/core/consent-store';

const store = new ConsentStore({
  tableName: 'consent-records',
  region: 'us-east-1',
  cacheTTLSeconds: 300, // Optional, defaults to 300 (5 minutes)
});
```

## API Reference

### Get Consent Summary

Retrieve the complete consent profile for an organization.

```typescript
const summary = await store.getConsentSummary('org-123');

if (summary) {
  console.log('Organization:', summary.orgName);
  console.log('Consent version:', summary.consentVersion);
  console.log('Resources:', summary.resources);
  console.log('Audit trail:', summary.history);
}
```

**Returns:** `OrganizationConsent | null`

**Features:**
- Caches results for 5 minutes
- Returns null if no consent record exists
- Includes full resource status and audit history

---

### Check Single Resource

Check consent for a specific resource.

```typescript
const result = await store.checkResourceConsent('org-123', 'fp_patterns');

if (result.granted) {
  console.log('Consent granted!');
  console.log('Granted at:', result.grantedAt);
  console.log('Version:', result.version);
} else {
  console.log('Consent not granted');
  console.log('State:', result.state);
  console.log('Reason:', result.reason);
}
```

**Returns:** `ConsentCheckResult`

**Checks:**
- Resource exists in consent record
- Consent is not expired
- Policy version matches
- Consent state is "granted"

---

### Check Multiple Resources

Batch check consent for multiple resources.

```typescript
const result = await store.checkMultipleResources('org-123', [
  'fp_patterns',
  'fp_metrics',
  'cross_org_benchmarks',
]);

if (result.allGranted) {
  console.log('All resources have consent!');
} else {
  console.log('Missing consent for:', result.missingConsent);
  
  // Check individual results
  for (const [resource, status] of Object.entries(result.results)) {
    console.log(`${resource}: ${status.granted ? '✅' : '❌'}`);
  }
}
```

**Returns:** `MultiResourceConsentResult`

**Features:**
- Single request for multiple resources
- Returns status for each resource
- Lists resources missing consent

---

### Grant Consent

Grant consent for a resource.

```typescript
// Grant consent without expiration
await store.grantConsent('org-123', 'fp_patterns', 'admin-user-id');

// Grant consent with expiration
const expiresAt = new Date('2025-12-31');
await store.grantConsent('org-123', 'fp_metrics', 'admin-user-id', expiresAt);
```

**Parameters:**
- `orgId` - Organization identifier
- `resource` - Resource to grant consent for
- `grantedBy` - Admin user ID (will be hashed)
- `expiresAt` - Optional expiration date

**Effects:**
- Creates new consent record if none exists
- Updates existing resource consent
- Adds event to audit trail
- Invalidates cache
- Saves to DynamoDB

---

### Revoke Consent

Revoke consent for a resource.

```typescript
await store.revokeConsent('org-123', 'fp_patterns', 'admin-user-id');
```

**Parameters:**
- `orgId` - Organization identifier
- `resource` - Resource to revoke consent for
- `revokedBy` - Admin user ID (will be hashed)

**Effects:**
- Updates resource state to "revoked"
- Sets revoked timestamp
- Adds event to audit trail
- Invalidates cache
- Saves to DynamoDB

**Throws:** Error if no consent record exists

---

### Legacy Methods

For backward compatibility with the old consent store:

```typescript
// Check if any resource has consent
const consentType = await store.checkConsent('org-123');
// Returns: 'explicit' | 'implicit' | 'none'

// Check if organization has valid consent
const hasConsent = await store.hasValidConsent('org-123');
// Returns: boolean

// Record consent (deprecated - use grantConsent instead)
await store.recordConsent(record);
```

---

### Cache Management

```typescript
// Clear all cached entries
store.clearCache();

// Get cache statistics
const stats = store.getCacheStats();
console.log('Cache size:', stats.size);
```

## Data Model

### OrganizationConsent

```typescript
interface OrganizationConsent {
  orgId: string;                    // Hashed organization ID
  orgName?: string;                 // Display name (optional)
  resources: Record<ConsentResource, ResourceConsentStatus>;
  grantedBy: string;                // Hashed admin ID
  consentVersion: string;           // Policy version (e.g., "1.2")
  history: ConsentEvent[];          // Audit trail
  createdAt: Date;
  updatedAt: Date;
}
```

### ResourceConsentStatus

```typescript
interface ResourceConsentStatus {
  resource: ConsentResource;
  state: ConsentState;              // granted, expired, revoked, pending, not_requested
  grantedAt?: Date;
  expiresAt?: Date;
  revokedAt?: Date;
  version?: string;
}
```

### ConsentEvent

```typescript
interface ConsentEvent {
  eventId: string;                  // UUID
  eventType: 'granted' | 'revoked' | 'expired' | 'renewed' | 'version_update';
  resource: ConsentResource;
  timestamp: Date;
  actor: string;                    // Hashed admin ID
  previousState?: ConsentState;
  newState: ConsentState;
  metadata?: Record<string, unknown>;
}
```

## DynamoDB Schema

### Table Structure

```
Primary Key: orgId (hashed)

Attributes:
- orgId: String (PK)
- orgName: String (optional)
- resources: Map
- grantedBy: String
- consentVersion: String
- history: List
- createdAt: String (ISO 8601)
- updatedAt: String (ISO 8601)
```

### Example Item

```json
{
  "orgId": "abc123...",
  "orgName": "Acme Corporation",
  "resources": {
    "fp_patterns": {
      "resource": "fp_patterns",
      "state": "granted",
      "grantedAt": "2024-01-01T00:00:00Z",
      "version": "1.2"
    },
    "fp_metrics": {
      "resource": "fp_metrics",
      "state": "granted",
      "grantedAt": "2024-01-01T00:00:00Z",
      "version": "1.2"
    }
  },
  "grantedBy": "def456...",
  "consentVersion": "1.2",
  "history": [
    {
      "eventId": "uuid-123",
      "eventType": "granted",
      "resource": "fp_patterns",
      "timestamp": "2024-01-01T00:00:00Z",
      "actor": "def456...",
      "newState": "granted"
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

## Performance

### Cache Behavior
- **Cold cache**: ~50-100ms (DynamoDB read)
- **Warm cache**: <5ms (memory read)
- **TTL**: 5 minutes (configurable)
- **Invalidation**: Automatic on updates

### Optimization Tips
1. Use `checkMultipleResources` for batch checks
2. Leverage caching for read-heavy workloads
3. Configure shorter TTL for frequently updated orgs
4. Clear cache manually when needed

## Privacy & Security

### Hashing
- Organization IDs hashed with SHA-256
- Admin IDs hashed with SHA-256
- Hashes prevent plaintext exposure

### Audit Trail
- Every consent change logged
- Includes actor, timestamp, and state transition
- Immutable history (append-only)

### GDPR Compliance
- Right to withdraw (revokeConsent)
- Audit trail for demonstrable consent
- Expiration dates for time-limited consent
- Version tracking for re-consent

## Error Handling

```typescript
try {
  await store.grantConsent('org-123', 'fp_patterns', 'admin');
} catch (error) {
  if (error.message.includes('DynamoDB')) {
    console.error('Storage error:', error);
    // Handle DynamoDB errors
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Common Errors
- `DynamoDB error` - Connection or access issues
- `No consent record found` - Attempting to revoke non-existent consent
- `client not initialized` - Store not properly configured

## Testing

The ConsentStore includes comprehensive unit tests:

```bash
npm test -- store.test.ts
```

**Test Coverage:**
- Get/check operations
- Grant/revoke operations
- Cache behavior
- Error handling
- Expiration detection
- Version mismatch detection
- Audit trail
- Privacy hashing

## Migration from Legacy Store

```typescript
// Old: DynamoDBConsentStore
const oldStore = new DynamoDBConsentStore({
  tableName: 'consent',
  region: 'us-east-1',
});

// New: ConsentStore
const newStore = new ConsentStore({
  tableName: 'consent-v2',
  region: 'us-east-1',
  cacheTTLSeconds: 300,
});

// Legacy methods still work
await newStore.checkConsent('org-123');
await newStore.hasValidConsent('org-123');

// But use new methods for better control
await newStore.checkResourceConsent('org-123', 'fp_patterns');
await newStore.grantConsent('org-123', 'fp_patterns', 'admin');
```

## Best Practices

1. **Always check consent before sensitive operations**
   ```typescript
   const check = await store.checkResourceConsent(orgId, 'fp_patterns');
   if (!check.granted) {
     throw new Error('Consent required');
   }
   ```

2. **Use batch checking for multiple resources**
   ```typescript
   const result = await store.checkMultipleResources(orgId, [
     'fp_patterns',
     'fp_metrics',
   ]);
   ```

3. **Set expiration dates for time-limited consent**
   ```typescript
   const oneYearFromNow = new Date();
   oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
   await store.grantConsent(orgId, resource, admin, oneYearFromNow);
   ```

4. **Monitor audit trail for compliance**
   ```typescript
   const summary = await store.getConsentSummary(orgId);
   console.log('Consent history:', summary.history);
   ```

5. **Clear cache when deploying policy updates**
   ```typescript
   store.clearCache(); // Force re-fetch with new policy
   ```

## See Also

- [Consent Requirements Design](../../../mcp-server/docs/consent-requirements-design.md)
- [check_consent_requirements Tool](../../../mcp-server/docs/check-consent-requirements-usage.md)
- [ADR-004: FP Anonymization & Consent](../../docs/adr/)
