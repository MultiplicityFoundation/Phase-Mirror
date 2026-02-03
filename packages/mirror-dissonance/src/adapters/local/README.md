# Local Adapter

Zero-cloud testing adapter for Phase Mirror. Uses JSON file storage for all persistence.

## Purpose

The local adapter lets you:

✅ **Test Phase Mirror without AWS/GCP credentials**  
✅ **Validate adapter interface contracts**  
✅ **Run CI without cloud costs**  
✅ **Onboard contributors instantly** (no cloud setup)

## Architecture

### JsonFileStore<T> Utility

All collections share atomic write logic:

```typescript
class JsonFileStore<T> {
  async read(): Promise<T[]>
  async write(data: T[]): Promise<void>  // Atomic (temp file + rename)
  async readOne(predicate): Promise<T | null>
  async writeOne(item: T, idGetter): Promise<void>
}
```

**Atomic writes:** Uses temp file + POSIX `rename()` for atomic writes (no partial reads).

### File Layout

```
.test-data/
├── fp-events.json          # False positive events
├── consent.json            # Org consent records
├── block-counter.json      # Circuit breaker counters
├── nonce.json             # HMAC nonce versions
├── baselines.json         # Drift baseline files
```

**All files are JSON arrays** - easy to inspect, edit, and debug.

## Usage

### Environment Variables

```bash
export CLOUD_PROVIDER=local
export LOCAL_DATA_DIR=.test-data  # Optional, defaults to .test-data
```

### From Code

```typescript
import { createAdapters } from '../adapters/factory.js';
import { loadCloudConfig } from '../adapters/config.js';

const config = loadCloudConfig();
const adapters = await createAdapters(config);

// Use adapters
await adapters.fpStore.recordFalsePositive(event);
const consents = await adapters.consentStore.getConsentSummary('org-123');
```

### From Tests

```typescript
import { createLocalAdapters } from './local/index.js';

const adapters = createLocalAdapters({ 
  provider: 'local', 
  localDataDir: '/tmp/test-data' 
});

// Adapters work identically to AWS/GCP
await adapters.secretStore.rotateNonce('new-nonce-value');
```

## Key Design Decisions

| Pattern | Why |
|---------|-----|
| **JsonFileStore<T> utility** | DRY: all collections share atomic write logic |
| **Temp file + rename** | POSIX atomic write guarantee (no partial reads) |
| **Millisecond timestamps** | JSON doesn't serialize `Date` objects; store as ISO strings |
| **UUID primary keys** | Matches DynamoDB/Firestore auto-generated IDs |
| **Hourly window keys** | Circuit breaker keys like `2026-02-02T23:00:00.000Z` expire naturally |

## What It Validates

✅ **Interfaces are correct** - All 6 adapter contracts have the right method signatures  
✅ **FP tracking flow works** - Record event → mark as FP → calculate FPR  
✅ **Consent model works** - Org-level consent, repo-level consent, expiration, revocation  
✅ **Circuit breaker works** - Increment counter → check threshold → trip logic  
✅ **Secret rotation works** - Store nonce → retrieve → rotate  
✅ **Baseline versioning works** - Store baseline → list versions → retrieve current

## What It Doesn't Validate

❌ Cloud SDK integration (no AWS/GCP clients)  
❌ Production race conditions (single-process only)  
❌ Firestore transaction semantics  
❌ DynamoDB conditional writes  
❌ S3/GCS object versioning behavior

Those require the AWS adapter refactor + integration tests against localstack or real cloud.

## Limitations

### Single-Process Only

The local adapter is **not thread-safe** or **multi-process safe**. If two Node.js processes write to the same file simultaneously, you may lose data.

**Solution:** Use separate `LOCAL_DATA_DIR` for each test run, or use cloud adapters for production.

### No Transaction Guarantees

Block counter increments are atomic **per-file**, but not **per-operation** across multiple files.

**Example:** If you increment counters for two rules, and the second write fails, the first write persists.

**Solution:** For production transactional guarantees, use AWS DynamoDB or GCP Firestore.

### No TTL-Based Expiration

Block counter entries expire via **cleanup-on-access** (not background job).

**Impact:** If a rule is never accessed again, its counter entries persist forever.

**Solution:** Call `cleanExpired()` periodically, or use cloud adapters with TTL.

## Testing

Run the test suite:

```bash
npm test src/adapters/local
```

Tests validate:
- FP event recording and retrieval
- Consent granting and revocation
- Block counter increments and expiration
- Secret rotation
- Baseline versioning

## Migration Path

1. **Add local adapter** (this file)
2. **Validate interfaces** (run tests)
3. **Refactor AWS adapter** to match interfaces
4. **Add GCP adapter** using same interfaces
5. **Update core logic** to use `createAdapters()` instead of direct AWS SDK calls

The local adapter is your **interface validation tool** and **contributor onboarding path**.
