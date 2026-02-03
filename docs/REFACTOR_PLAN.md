# AWS SDK Surgical Refactor Plan

## Summary

This document provides a **surgical refactor plan** to migrate Phase Mirror from direct AWS SDK usage to the new adapter pattern. The adapters have been implemented and tested. This plan identifies exactly which files need changes and provides minimal-change strategies.

## ✅ Completed

1. **Adapter Interfaces** - Defined in `packages/mirror-dissonance/src/adapters/types.ts`
2. **AWS Implementations** - Full DynamoDB, SSM, S3 implementations
3. **Local Implementations** - In-memory adapters for testing
4. **Infrastructure** - Terraform configuration with GSIs
5. **Tests** - 19 unit tests passing
6. **Documentation** - Complete migration guide

## 🎯 Files Requiring Changes

### Production Code (11 files)

| File | AWS Service | Changes Required | Priority |
|------|-------------|------------------|----------|
| `oracle.ts` | SSM | Add adapter factory initialization | **HIGH** |
| `fp-store/store.ts` | DynamoDB | Replace with adapter interface | HIGH |
| `fp-store/dynamodb-store.ts` | DynamoDB | Mark as deprecated, kept for compatibility | LOW |
| `consent-store/store.ts` | DynamoDB | Replace with adapter interface | MEDIUM |
| `consent-store/index.ts` | DynamoDB | Update factory to use adapters | MEDIUM |
| `block-counter/dynamodb.ts` | DynamoDB | Replace with adapter interface | MEDIUM |
| `block-counter/counter.ts` | DynamoDB | Update factory to use adapters | MEDIUM |
| `nonce/loader.ts` | SSM | Replace with adapter interface | MEDIUM |
| `nonce/multi-version-loader.ts` | SSM | Replace with adapter interface | MEDIUM |
| `redaction/redactor-v3.ts` | SSM | Update to use secret adapter | LOW |
| `anonymizer/index.ts` | SSM | Update to use secret adapter | LOW |
| `calibration-store/index.ts` | DynamoDB | Out of scope for now | N/A |

### Test Code (29 files)

All test files can continue using direct AWS SDK for integration tests. No changes required immediately.

## 📋 Detailed Surgical Changes

### 1. Oracle Initialization (HIGH PRIORITY)

**File:** `packages/mirror-dissonance/src/oracle.ts`

**Current Code (Lines 39-90):**
```typescript
export async function initializeOracle(config: OracleConfig): Promise<Oracle> {
  const components: OracleComponents = {};
  const region = config.region || 'us-east-1';

  // Load nonce first (required for redaction) if SSM parameter name provided
  if (config.nonceParameterName) {
    try {
      const clientConfig: SSMClientConfig = { region };
      if (config.endpoint) {
        clientConfig.endpoint = config.endpoint;
      }
      const ssmClient = new SSMClient(clientConfig);
      // ... direct SSM usage
    }
  }
  
  // Initialize FP store if table name provided
  if (config.fpTableName) {
    components.fpStore = new EnhancedDynamoDBFPStore({
      tableName: config.fpTableName,
      region,
    });
  }
  
  // ... more direct AWS SDK usage
}
```

**Minimal Change:**

Add adapter-based initialization as an **opt-in** feature:

```typescript
import { createAdapters, loadCloudConfig, CloudAdapters } from './adapters/index.js';

export interface OracleConfig {
  region?: string;
  endpoint?: string;
  nonceParameterName?: string;
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  
  // NEW: Opt-in to adapter pattern
  useAdapters?: boolean;
  cloudProvider?: 'aws' | 'local';
}

export async function initializeOracle(config: OracleConfig): Promise<Oracle> {
  // NEW: Use adapters if requested
  if (config.useAdapters) {
    return initializeOracleWithAdapters(config);
  }
  
  // OLD PATH: Unchanged existing code
  const components: OracleComponents = {};
  // ... existing code continues to work
}

// NEW FUNCTION: Adapter-based initialization
async function initializeOracleWithAdapters(config: OracleConfig): Promise<Oracle> {
  const cloudConfig = {
    provider: config.cloudProvider || 'aws',
    region: config.region || 'us-east-1',
    endpoint: config.endpoint,
    fpTableName: config.fpTableName,
    consentTableName: config.consentTableName,
    blockCounterTableName: config.blockCounterTableName,
    nonceParameterName: config.nonceParameterName,
  };
  
  const adapters = await createAdapters(cloudConfig);
  
  // Load nonce
  const nonceValue = await adapters.secretStore.getNonce('current');
  const redactor = nonceValue ? createRedactor(nonceValue) : undefined;
  
  return new Oracle({
    fpStore: adapters.fpStore,
    consentStore: adapters.consentStore,
    blockCounter: adapters.blockCounter,
    redactor,
  });
}
```

**Benefits:**
- ✅ Zero breaking changes - existing code works
- ✅ Opt-in migration - set `useAdapters: true` when ready
- ✅ Tests continue to work unchanged

### 2. FP Store (HIGH PRIORITY)

**File:** `packages/mirror-dissonance/src/fp-store/store.ts`

**Strategy:** Keep existing `DynamoDBFPStore` class, add adapter-based wrapper

**Minimal Change:**

```typescript
// Add at top
import { FPStoreAdapter } from '../adapters/types.js';

// Add new adapter-compatible wrapper
export class FPStoreAdapterWrapper implements IFPStore {
  constructor(private adapter: FPStoreAdapter) {}
  
  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    await this.adapter.record(event);
  }
  
  async isFalsePositive(findingId: string): Promise<boolean> {
    return this.adapter.isFalsePositive(findingId);
  }
  
  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    // Note: Requires orgId or repoId - throw helpful error
    throw new Error('Use adapter.query() directly with orgId or repoId');
  }
}

// Keep existing DynamoDBFPStore unchanged for compatibility
export class DynamoDBFPStore implements IFPStore {
  // ... existing code unchanged
}
```

### 3. Consent Store (MEDIUM PRIORITY)

**File:** `packages/mirror-dissonance/src/consent-store/index.ts`

**Strategy:** Add factory function that can return adapter-based implementation

```typescript
import { ConsentStoreAdapter } from '../adapters/types.js';

export function createConsentStore(
  config?: { tableName?: string; region?: string; adapter?: ConsentStoreAdapter }
): IConsentStore {
  // NEW: Use adapter if provided
  if (config?.adapter) {
    return new ConsentStoreAdapterWrapper(config.adapter);
  }
  
  // OLD: Use direct DynamoDB
  if (config?.tableName) {
    return new DynamoDBConsentStore(config);
  }
  
  return new NoOpConsentStore();
}

class ConsentStoreAdapterWrapper implements IConsentStore {
  constructor(private adapter: ConsentStoreAdapter) {}
  
  async hasConsent(/* ... */): Promise<boolean> {
    return this.adapter.hasConsent(/* ... */);
  }
  
  async recordConsent(/* ... */): Promise<void> {
    return this.adapter.recordConsent(/* ... */);
  }
}
```

### 4. Block Counter (MEDIUM PRIORITY)

**File:** `packages/mirror-dissonance/src/block-counter/counter.ts`

**Current:**
```typescript
export function createBlockCounter(
  tableName: string,
  region: string,
  endpoint?: string
): BlockCounter {
  return new DynamoDBBlockCounter(tableName, region, endpoint);
}
```

**Minimal Change:**
```typescript
import { BlockCounterAdapter } from '../adapters/types.js';

export function createBlockCounter(
  config: { 
    tableName?: string; 
    region?: string; 
    endpoint?: string;
    adapter?: BlockCounterAdapter; // NEW
  }
): BlockCounter {
  // NEW: Use adapter if provided
  if (config.adapter) {
    return config.adapter;
  }
  
  // OLD: Use direct DynamoDB
  return new DynamoDBBlockCounter(
    config.tableName!,
    config.region!,
    config.endpoint
  );
}
```

### 5. Nonce Loader (MEDIUM PRIORITY)

**File:** `packages/mirror-dissonance/src/nonce/loader.ts`

**Strategy:** Add adapter-based constructor

```typescript
import { SecretStoreAdapter } from '../adapters/types.js';

export class NonceLoader {
  private client?: SSMClient;
  private adapter?: SecretStoreAdapter;
  
  constructor(config: { region?: string; adapter?: SecretStoreAdapter }) {
    if (config.adapter) {
      this.adapter = config.adapter;
    } else {
      this.client = new SSMClient({ region: config.region || 'us-east-1' });
    }
  }
  
  async loadNonce(parameterName: string = 'guardian/redaction_nonce'): Promise<NonceConfig> {
    // NEW: Use adapter if available
    if (this.adapter) {
      const value = await this.adapter.getNonce('current');
      if (!value) {
        throw new Error(`Nonce not found: ${parameterName}`);
      }
      return {
        value,
        loadedAt: new Date().toISOString(),
        source: parameterName,
      };
    }
    
    // OLD: Use direct SSM
    const command = new GetParameterCommand({ /* ... */ });
    const response = await this.client!.send(command);
    // ... existing code
  }
}
```

## 🧪 Testing Strategy

### Phase 1: Unit Tests with Local Adapters

```typescript
// Example: Test FP tracking with local adapters
import { createLocalAdapters } from '@mirror-dissonance/core/adapters/local';

test('FP tracking with adapters', async () => {
  const adapters = createLocalAdapters();
  const oracle = await initializeOracleWithAdapters({
    useAdapters: true,
    cloudProvider: 'local',
  });
  
  // Test oracle functionality
});
```

### Phase 2: Integration Tests with AWS/LocalStack

```bash
# Use LocalStack for CI
export CLOUD_PROVIDER=aws
export AWS_ENDPOINT=http://localhost:4566
pnpm test:integration
```

### Phase 3: Staging Environment

```bash
# Real AWS staging
export CLOUD_PROVIDER=aws
export AWS_REGION=us-east-1
export USE_ADAPTERS=true
pnpm oracle:run
```

## 📊 Migration Metrics

### Code Impact

- **11 production files** need updates
- **~200 lines** of new code (mostly wrappers)
- **Zero breaking changes** - all opt-in
- **29 test files** unchanged (continue using direct SDK)

### Timeline Estimate

| Phase | Tasks | Effort | Risk |
|-------|-------|--------|------|
| 1. Oracle Init | Add adapter support to oracle.ts | 2 hours | LOW |
| 2. FP Store | Create adapter wrapper | 1 hour | LOW |
| 3. Consent Store | Create adapter wrapper | 1 hour | LOW |
| 4. Block Counter | Update factory | 30 min | LOW |
| 5. Nonce Loader | Add adapter constructor | 1 hour | LOW |
| 6. Testing | Full test suite | 2 hours | MEDIUM |
| 7. Documentation | Update README | 1 hour | LOW |
| **TOTAL** | | **8.5 hours** | **LOW** |

## ✅ Verification Checklist

After each change:

- [ ] Build succeeds: `pnpm run build`
- [ ] Unit tests pass: `pnpm test`
- [ ] Integration tests pass: `pnpm test:integration`
- [ ] Existing tests unchanged
- [ ] No breaking changes to public API
- [ ] Backward compatibility verified

## 🚀 Deployment Plan

### Step 1: Deploy Infrastructure
```bash
cd infra/aws
terraform apply -var="environment=staging"
```

### Step 2: Deploy Code with Feature Flag
```typescript
// In oracle initialization
const config = {
  useAdapters: process.env.USE_ADAPTERS === 'true',
  cloudProvider: process.env.CLOUD_PROVIDER || 'aws',
};
```

### Step 3: Gradual Rollout
1. Enable in CI/CD: `USE_ADAPTERS=true`
2. Enable in staging: 50% traffic
3. Monitor metrics (latency, errors)
4. Enable in production: 100% traffic
5. Remove old code after 2 weeks

## 📝 Next Actions

1. **Review this plan** with team
2. **Approve infrastructure changes** (Terraform)
3. **Start with Oracle init** (highest impact, lowest risk)
4. **Iterate module by module**
5. **Monitor each deployment**

## 🔗 References

- Adapter interfaces: `packages/mirror-dissonance/src/adapters/types.ts`
- AWS implementation: `packages/mirror-dissonance/src/adapters/aws/`
- Migration guide: `docs/MIGRATION.md`
- Infrastructure: `infra/aws/dynamodb.tf`
- Tests: `packages/mirror-dissonance/src/adapters/__tests__/`

---

**Status:** ✅ Ready for implementation  
**Risk Level:** 🟢 LOW (all changes are additive and opt-in)  
**Estimated Completion:** 1-2 sprints
