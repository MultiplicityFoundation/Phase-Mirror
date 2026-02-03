# AWS Adapter Migration Guide

## Overview

This guide helps you migrate from direct AWS SDK usage to the new adapter pattern in Phase Mirror. The adapter pattern provides:

- **Local testing** without cloud resources
- **Multi-cloud support** (future: GCP, Azure)
- **Easier testing** with mock implementations
- **Better separation of concerns**

## Migration Strategy

We recommend an **incremental migration** approach:

### Phase 1: Add Adapter Layer (No Behavior Change)

The old code continues to work. New features use adapters.

**Before:**
```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });
```

**After (co-existing):**
```typescript
// Old code still works
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
const dynamodb = new DynamoDBClient({ region: 'us-east-1' });

// New code uses adapters
import { createAdapters, loadCloudConfig } from '@mirror-dissonance/core/adapters';
const adapters = await createAdapters(loadCloudConfig());
```

### Phase 2: Migrate New Features

All new code uses adapters instead of direct AWS SDK calls.

**Example: New FP Tracking Feature**
```typescript
import { createAdapters } from '@mirror-dissonance/core/adapters';

const adapters = await createAdapters();

// Record false positive
const fpId = await adapters.fpStore.record({
  findingId: 'finding-123',
  ruleId: 'MD-001',
  resolvedBy: 'developer',
  orgIdHash: 'org-hash',
  consent: true,
  context: { repoId: 'repo-456' },
});

// Query by organization
const events = await adapters.fpStore.query({
  orgId: 'org-hash',
  startTime: new Date('2024-01-01'),
  limit: 50,
});
```

### Phase 3: Refactor Existing Code Module-by-Module

Convert existing services to use adapters:

1. **FP Tracking** (`fp-store/`)
2. **Consent Checking** (`consent-store/`)
3. **Circuit Breaker** (`block-counter/`)
4. **Drift Detection** (baseline storage)
5. **Redaction** (nonce loading)

### Phase 4: Remove Old AWS-Specific Code

Once all modules are migrated, delete direct AWS SDK usage.

## Configuration

### Environment Variables

The adapter factory reads configuration from environment:

```bash
# Provider (default: 'aws')
export CLOUD_PROVIDER=aws

# AWS Region (default: 'us-east-1')
export AWS_REGION=us-east-1

# Table names (optional, has defaults)
export FP_TABLE_NAME=phase-mirror-fp-events
export CONSENT_TABLE_NAME=phase-mirror-consents
export BLOCK_COUNTER_TABLE_NAME=phase-mirror-block-counter

# S3 buckets (optional, has defaults)
export BASELINE_BUCKET=phase-mirror-baselines
export REPORT_BUCKET=phase-mirror-reports

# SSM parameter names (optional, has defaults)
export NONCE_PARAMETER_NAME=/phase-mirror/redaction-nonce
export SALT_PARAMETER_PREFIX=/phase-mirror/salts/
```

### Local Testing

For local testing without AWS:

```bash
export CLOUD_PROVIDER=local
pnpm test
```

### LocalStack Testing

For AWS-compatible local testing:

```bash
# Start LocalStack
docker run -d -p 4566:4566 localstack/localstack

# Configure endpoints
export CLOUD_PROVIDER=aws
export AWS_ENDPOINT=http://localhost:4566
export DYNAMODB_ENDPOINT=http://localhost:4566
export S3_ENDPOINT=http://localhost:4566
export SSM_ENDPOINT=http://localhost:4566

pnpm test:integration
```

## Adapter Interfaces

### FPStoreAdapter

Manages false positive event tracking:

```typescript
interface FPStoreAdapter {
  // Record new FP event
  record(event: Omit<FalsePositiveEvent, 'id'> & { id?: string }): Promise<string>;
  
  // Mark finding as FP
  markAsFP(findingId: string, resolvedBy: string): Promise<void>;
  
  // Check if finding is FP
  isFalsePositive(findingId: string): Promise<boolean>;
  
  // Query FP events
  query(query: FPQuery): Promise<FalsePositiveEvent[]>;
}
```

**Query Requirements:**
- Must specify `orgId` or `repoId` (uses DynamoDB GSI)
- Scanning entire table not supported (expensive)

### SecretStoreAdapter

Manages secure secret storage (nonces, salts):

```typescript
interface SecretStoreAdapter {
  // Get redaction nonce (fail-closed)
  getNonce(version?: string): Promise<string | null>;
  
  // Get anonymization salt
  getSalt(orgId: string): Promise<string | null>;
  
  // Store secret
  putSecret(key: string, value: string, encrypted?: boolean): Promise<void>;
}
```

**Fail-Closed Pattern:** Returns `null` on error instead of throwing. Caller must handle.

### BlockCounterAdapter

Circuit breaker with atomic increment:

```typescript
interface BlockCounterAdapter {
  // Atomic increment with TTL
  increment(key: string, ttlSeconds: number): Promise<number>;
  
  // Get current count
  get(key: string): Promise<number>;
  
  // Reset (testing only)
  reset(key: string): Promise<void>;
}
```

### ObjectStoreAdapter

Baseline and report storage:

```typescript
interface ObjectStoreAdapter {
  // Store baseline (versioned)
  storeBaseline(
    repoId: string,
    baseline: Record<string, unknown>,
    metadata?: BaselineMetadata
  ): Promise<void>;
  
  // Get current baseline
  getBaseline(repoId: string): Promise<Record<string, unknown> | null>;
  
  // List versions
  listBaselineVersions(repoId: string, limit?: number): Promise<BaselineVersion[]>;
  
  // Store/get reports
  storeReport(repoId: string, runId: string, report: Record<string, unknown>): Promise<void>;
  getReport(repoId: string, runId: string): Promise<Record<string, unknown> | null>;
}
```

### ConsentStoreAdapter

Organization consent tracking:

```typescript
interface ConsentStoreAdapter {
  // Check consent
  hasConsent(orgId: string, repoId: string | null, feature: string): Promise<boolean>;
  
  // Record consent
  recordConsent(
    orgId: string,
    repoId: string | null,
    feature: string,
    granted: boolean
  ): Promise<void>;
}
```

## Infrastructure Setup

### DynamoDB Tables

Deploy with Terraform:

```bash
cd infra/aws
terraform init
terraform plan -var="environment=dev"
terraform apply -var="environment=dev"
```

**Required GSI Indexes:**

1. **FindingIndex** - Hash: `findingId`
2. **OrgIdCreatedAtIndex** - Hash: `orgId`, Range: `createdAt`
3. **RepoIdCreatedAtIndex** - Hash: `repoId`, Range: `createdAt`

### S3 Buckets

Versioning automatically enabled for baseline history.

### SSM Parameters

Store redaction nonces:

```bash
aws ssm put-parameter \
  --name /phase-mirror/redaction-nonce \
  --value "$(openssl rand -hex 32)" \
  --type SecureString
```

## Testing During Migration

### Unit Tests

Use local adapters:

```typescript
import { createLocalAdapters } from '@mirror-dissonance/core/adapters/local';

describe('FPTracker', () => {
  it('should track violations with consent', async () => {
    const adapters = createLocalAdapters();
    
    // Grant consent
    await adapters.consentStore.recordConsent('org-1', 'repo-1', 'fp_tracking', true);
    
    // Track FP
    const fpId = await adapters.fpStore.record({
      findingId: 'finding-1',
      ruleId: 'MD-001',
      resolvedBy: 'dev',
      orgIdHash: 'org-1',
      consent: true,
      context: { repoId: 'repo-1' },
    });
    
    expect(fpId).toBeDefined();
  });
});
```

### Integration Tests

Use AWS adapters with LocalStack or real AWS:

```typescript
import { createAdapters, loadCloudConfig } from '@mirror-dissonance/core/adapters';

describe('AWS Integration', () => {
  let adapters: CloudAdapters;

  beforeAll(async () => {
    adapters = await createAdapters(loadCloudConfig());
  });

  it('should query FP events by org', async () => {
    const events = await adapters.fpStore.query({
      orgId: 'test-org',
      startTime: new Date('2024-01-01'),
      limit: 10,
    });
    
    expect(Array.isArray(events)).toBe(true);
  });
});
```

## Service Class Example

**Before (Direct AWS SDK):**
```typescript
class FPTracker {
  private dynamodb: DynamoDBClient;
  
  constructor(region: string) {
    this.dynamodb = new DynamoDBClient({ region });
  }
  
  async track(violation: Violation) {
    await this.dynamodb.send(new PutItemCommand({ /* ... */ }));
  }
}
```

**After (Adapter Pattern):**
```typescript
class FPTracker {
  constructor(
    private fpStore: FPStoreAdapter,
    private consentStore: ConsentStoreAdapter,
  ) {}
  
  async track(violation: Violation) {
    // Check consent first
    if (!await this.consentStore.hasConsent(violation.orgId, violation.repoId, 'fp_tracking')) {
      return;
    }
    
    // Record event
    await this.fpStore.record(violation);
  }
}

// Initialize
const adapters = await createAdapters();
const tracker = new FPTracker(adapters.fpStore, adapters.consentStore);
```

## Known Limitations

### 1. Object Store `getReport(runId)` Missing `repoId`

**Problem:** S3 can't efficiently search by `runId` alone across all repos.

**Current Signature:**
```typescript
getReport(repoId: string, runId: string): Promise<Report | null>
```

**Workaround:** Always provide both `repoId` and `runId`.

**Future Enhancement:** Add DynamoDB index for report metadata.

### 2. Baseline Version `commitSha` is `'unknown'`

**Problem:** S3 metadata not fetched by default.

**Workaround:** Store commitSha separately or accept current limitation.

## Rollback Strategy

If issues arise during migration:

1. **Keep old code working** - Don't delete AWS SDK calls until fully migrated
2. **Feature flag** - Use environment variable to toggle adapter usage
3. **Module-by-module** - Only migrate one service at a time
4. **Comprehensive testing** - Test each migrated module thoroughly

## FAQ

**Q: Do I need to migrate everything at once?**  
A: No! The old code continues to work. Migrate incrementally.

**Q: Will this change behavior?**  
A: No. AWS adapters wrap existing AWS SDK calls with same behavior.

**Q: Can I test locally without AWS?**  
A: Yes! Use `CLOUD_PROVIDER=local` for in-memory adapters.

**Q: How do I mock adapters in tests?**  
A: Use local adapters or create mock implementations of interfaces.

**Q: What about performance?**  
A: Minimal overhead. Adapters are thin wrappers around AWS SDK.

## Support

For questions or issues:
1. Check adapter tests: `packages/mirror-dissonance/src/adapters/__tests__/`
2. Review interface documentation: `packages/mirror-dissonance/src/adapters/types.ts`
3. Open an issue on GitHub

## Next Steps

1. ✅ Deploy infrastructure: `terraform apply`
2. ✅ Test adapters: `pnpm test`
3. ✅ Migrate one service: Start with FP tracking
4. ✅ Deploy to staging
5. ✅ Monitor and verify
6. ✅ Proceed with next service
