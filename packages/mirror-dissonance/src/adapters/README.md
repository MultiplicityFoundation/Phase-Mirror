# Cloud Provider Adapters - Phase 1 Complete

Phase Mirror now supports multiple cloud providers through a unified adapter interface. **Phase 1** consolidates all AWS SDK usage behind testable interfaces and enables zero-credential local development.

## Phase 1 Improvements

The adapter layer has been enhanced to address critical production safety issues:

1. **Fail-Closed Validation**: AWS adapter now throws descriptive errors when required configuration is missing, preventing silent fallback to NoOp stores.
2. **Consolidated AWS SDK Usage**: All `DynamoDBClient`, `SSMClient`, and `S3Client` instantiation is now in `adapters/aws/` only.
3. **Oracle Integration**: New `initializeOracleWithAdapters()` function uses the adapter factory instead of direct SDK calls.
4. **Blueprint Compliance**: Implements the complete Day 5 + Day 6 adapter specification.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Core Phase Mirror Logic                    │
│         (Oracle, Rules, L0 Invariants, Policy)              │
└────────────────────┬────────────────────────────────────────┘
                     │ depends on interfaces only
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    Adapter Interfaces                        │
│  IFPStoreAdapter │ IConsentStoreAdapter │ IBlockCounter...  │
└────────────────────┬────────────────────────────────────────┘
                     │ dynamic import at runtime
           ┌─────────┴─────────┬──────────┐
           ▼                   ▼          ▼
    ┌──────────┐         ┌─────────┐  ┌────────┐
    │   AWS    │         │   GCP   │  │ Local  │
    │ Adapter  │         │ Adapter │  │ Adapter│
    └──────────┘         └─────────┘  └────────┘
         │                    │             │
         ▼                    ▼             ▼
    DynamoDB              Firestore    JSON Files
    SSM                   Secret Mgr   
    S3                    GCS          
```

## Key Design Principles

### 1. **Interface-First**
Core logic depends only on `types.ts` interfaces. AWS/GCP SDKs are never imported directly into core modules.

### 2. **Dynamic Imports**
`factory.ts` uses `await import()` to load adapters at runtime. Unused provider SDKs don't bloat the bundle.

### 3. **Fail-Closed Secrets**
`getNonce()` returns `null` on error. Callers must handle missing secrets gracefully (matches existing Phase Mirror behavior).

### 4. **Atomic Counters**
Block counter uses transactions (Firestore) or atomic operations (DynamoDB) for race-safe circuit breaker.

### 5. **Hourly Window Keys**
Block counter uses `orgId:YYYY-MM-DD-HH` keys for automatic TTL-like expiration.

## Supported Providers

| Provider | Status | Use Case |
|----------|--------|----------|
| **AWS** | ✅ Production | Existing deployments |
| **GCP** | ✅ Production | New deployments |
| **Local** | ✅ Testing | CI, development, contributor onboarding |

## Quick Start

### Environment Variables

Set `CLOUD_PROVIDER` to choose your provider:

```bash
# AWS (default for production)
export CLOUD_PROVIDER=aws
export CLOUD_REGION=us-east-1

# GCP
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=my-project
export GCP_REGION=us-central1

# Local (for testing/development)
export CLOUD_PROVIDER=local
export LOCAL_DATA_DIR=.test-data
```

### From Code

```typescript
import { createAdapters } from '@mirror-dissonance/core/adapters/factory.js';
import { loadCloudConfig } from '@mirror-dissonance/core/adapters/config.js';

// Load config from environment
const config = loadCloudConfig();

// Create adapters (dynamic import based on provider)
const adapters = await createAdapters(config);

// Use adapters (same API regardless of provider)
await adapters.fpStore.recordEvent(event);
await adapters.consentStore.grantConsent('org-123', 'fp_patterns', 'admin');
const count = await adapters.blockCounter.increment('rule-456', 3600);
const nonce = await adapters.secretStore.getNonce('/param/name');
await adapters.baselineStore.putBaseline('baseline-v1.json', content);
```

## Phase 1: Oracle Integration (Recommended)

The recommended way to initialize the Oracle is now with the adapter layer:

```typescript
import { initializeOracleWithAdapters, loadCloudConfig } from '@mirror-dissonance/core';

// Load configuration from environment variables
const config = loadCloudConfig();

// Create Oracle with adapters (fail-closed - throws if config invalid)
const oracle = await initializeOracleWithAdapters(config);

// Use the Oracle as normal
const result = await oracle.analyze(input);
```

### Environment Variables for Oracle

**AWS Production** (requires all or none):
```bash
CLOUD_PROVIDER=aws
AWS_REGION=us-east-1
FP_TABLE_NAME=phase-mirror-fp-events
CONSENT_TABLE_NAME=phase-mirror-consent
BLOCK_COUNTER_TABLE_NAME=phase-mirror-block-counter
NONCE_PARAMETER_NAME=/phase-mirror/nonce
BASELINE_BUCKET=phase-mirror-baselines
```

**Local Development** (zero credentials needed):
```bash
CLOUD_PROVIDER=local
LOCAL_DATA_DIR=./.mirror-data
```

**LocalStack Testing** (AWS-compatible local):
```bash
CLOUD_PROVIDER=aws
CLOUD_ENDPOINT=http://localhost:4566
# ... (table names as above)
```

### Fail-Closed Validation

The AWS adapter validates all required configuration on startup and throws descriptive errors instead of silently falling back to NoOp stores:

```typescript
// ❌ Missing config throws immediately
await createAWSAdapters({ provider: 'aws', region: 'us-east-1' });
// Error: AWS adapter requires FP_TABLE_NAME. Set CLOUD_PROVIDER=local for development without AWS.

// ✅ Complete config succeeds
await createAWSAdapters({
  provider: 'aws',
  region: 'us-east-1',
  fpTableName: 'fp-events',
  consentTableName: 'consent',
  blockCounterTableName: 'counter',
  nonceParameterName: '/nonce',
});
```

## Adapter Interfaces

### `IFPStoreAdapter` - False Positive Events

```typescript
interface IFPStoreAdapter {
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;
  isFalsePositive(findingId: string): Promise<boolean>;
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}
```

**AWS**: DynamoDB table with `findingId` and `ruleId` indexes  
**GCP**: Firestore collection `fp_events`  
**Local**: JSON file `fp-events.json`

### `IConsentStoreAdapter` - Organization Consent

```typescript
interface IConsentStoreAdapter {
  checkResourceConsent(orgId: string, resource: ConsentResource): Promise<ConsentCheckResult>;
  checkMultipleResources(orgId: string, resources: ConsentResource[]): Promise<MultiResourceConsentResult>;
  getConsentSummary(orgId: string): Promise<OrganizationConsent | null>;
  grantConsent(orgId: string, resource: ConsentResource, grantedBy: string, expiresAt?: Date): Promise<void>;
  revokeConsent(orgId: string, resource: ConsentResource, revokedBy: string): Promise<void>;
  
  // Legacy compatibility
  checkConsent(orgId: string): Promise<'explicit' | 'implicit' | 'none'>;
  hasValidConsent(orgId: string): Promise<boolean>;
}
```

**AWS**: DynamoDB table with consent records  
**GCP**: Firestore collection `consent` with transactions  
**Local**: JSON file `consent.json`

### `IBlockCounterAdapter` - Circuit Breaker

```typescript
interface IBlockCounterAdapter {
  increment(ruleId: string): Promise<number>;
  getCount(ruleId: string): Promise<number>;
}
```

**AWS**: DynamoDB with atomic increments  
**GCP**: Firestore with transactions  
**Local**: JSON file with hourly cleanup

### `ISecretStoreAdapter` - Nonce Storage

```typescript
interface ISecretStoreAdapter {
  getNonce(): Promise<NonceConfig | null>;  // Fail-closed
  rotateNonce(newValue: string): Promise<void>;
}
```

**AWS**: SSM Parameter Store (rotation via Terraform/Console)  
**GCP**: Secret Manager with versioning  
**Local**: JSON file with version tracking

### `IBaselineStorageAdapter` - Drift Baselines

```typescript
interface IBaselineStorageAdapter {
  storeBaseline(key: string, content: string | Buffer, contentType?: string): Promise<void>;
  getBaseline(key: string): Promise<string | null>;
  listBaselines(): Promise<BaselineVersion[]>;
  deleteBaseline(key: string): Promise<void>;
}
```

**AWS**: S3 bucket with versioning  
**GCP**: Cloud Storage bucket  
**Local**: JSON file with embedded content

### `ICalibrationStoreAdapter` - K-Anonymity FP Rates

```typescript
interface ICalibrationStoreAdapter {
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError>;
  getRuleFPRate(ruleId: string, startDate?: string, endDate?: string): Promise<CalibrationResult | KAnonymityError>;
  getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError>;
}
```

**AWS**: DynamoDB scan with k-anonymity threshold  
**GCP**: Firestore query with k-anonymity threshold  
**Local**: In-memory aggregation from FP events

## Provider-Specific Details

### AWS Configuration

```bash
# Environment variables
export CLOUD_PROVIDER=aws
export AWS_REGION=us-east-1

# Resource names (or use defaults)
export FP_STORE_TABLE=phase-mirror-fp-events
export CONSENT_STORE_TABLE=phase-mirror-consent
export BLOCK_COUNTER_TABLE=phase-mirror-block-counter
export BASELINE_BUCKET=phase-mirror-baselines
export NONCE_PARAMETER=guardian/redaction_nonce
```

**Credentials**: AWS OIDC (GitHub Actions) or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`

### GCP Configuration

```bash
# Environment variables
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=my-project
export GCP_REGION=us-central1

# Resource names (or use defaults)
export GCP_BASELINE_BUCKET=my-project-phase-mirror-baselines-staging
export GCP_SECRET_NAME=phase-mirror-hmac-nonce-staging
```

**Credentials**: Workload Identity Federation (GitHub Actions) or `GOOGLE_APPLICATION_CREDENTIALS`

### Local Configuration

```bash
# Environment variables
export CLOUD_PROVIDER=local
export LOCAL_DATA_DIR=.test-data  # Optional, defaults to .test-data
```

**No credentials needed** - perfect for CI, development, and contributor onboarding.

## Testing Strategy

### Tier 1: Fast Feedback (Every PR)

Uses **local adapter** for zero-cost, zero-setup testing:

```bash
export CLOUD_PROVIDER=local
npm test
```

- ✅ **No cloud credentials needed**
- ✅ **Fast** (~1 minute)
- ✅ **Free** ($0 cost)
- ✅ **Works on contributor forks**

See `.github/workflows/test.yml` for the full workflow.

### Tier 2: Adapter Parity Tests

Interface conformance tests ensure all providers implement the same semantics:

```bash
# Run parity tests (local adapter only, no credentials required)
npm test packages/mirror-dissonance/src/adapters/__tests__/adapter-parity.test.ts

# With AWS credentials
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
npm test adapter-parity

# With GCP credentials
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/creds.json
export GCP_PROJECT_ID=my-project
npm test adapter-parity
```

The parity tests verify:
- ✅ **Interface conformance** - All adapters implement the same interfaces
- ✅ **Semantic equivalence** - Operations produce equivalent results
- ✅ **Contract compliance** - Adapters respect error handling and edge cases
- ✅ **No drift** - Multi-cloud abstraction stays consistent

See [`__tests__/README.md`](./__tests__/README.md) for detailed documentation.

### Tier 3: Cloud Integration (Nightly)

Tests **real AWS/GCP** adapters nightly:

```bash
# AWS
export CLOUD_PROVIDER=aws
npm test src/adapters/aws

# GCP
export CLOUD_PROVIDER=gcp
export GCP_PROJECT_ID=phase-mirror-staging
npm test src/adapters/gcp
```

- ✅ **Validates cloud SDK integration**
- ✅ **Catches provider-specific bugs**
- ✅ **Minimal cost** (~$0.10/day)

See `.github/workflows/cloud-integration.yml` for the full workflow.

### Tier 4: LocalStack (Optional)

Tests **AWS adapter** against LocalStack (AWS emulator):

```bash
docker run -d -p 4566:4566 localstack/localstack
export CLOUD_PROVIDER=aws
export AWS_ENDPOINT_URL=http://localhost:4566
npm test src/adapters/aws
```

- ✅ **No AWS credentials needed**
- ✅ **Catches DynamoDB-specific behavior**
- ✅ **Free**

## Migration Path

### 1. **Create Adapters** (✅ Done)
- `types.ts` - Interface definitions
- `factory.ts` - Dynamic adapter creation
- `config.ts` - Configuration loader
- `aws/index.ts` - AWS implementations
- `gcp/index.ts` - GCP implementations
- `local/index.ts` - Local implementations

### 2. **Update Core Logic** (Next Step)
Replace direct AWS SDK usage with adapter calls:

```typescript
// Before
import { DynamoDBFPStore } from './fp-store/store.js';
const fpStore = new DynamoDBFPStore({ tableName, region });

// After
import { createAdapters } from './adapters/factory.js';
import { loadCloudConfig } from './adapters/config.js';
const adapters = await createAdapters(loadCloudConfig());
const fpStore = adapters.fpStore;
```

### 3. **Update Entry Points**
- CLI: Call `createAdapters()` once at startup, pass to services
- MCP Server: Call `createAdapters()` once at startup, pass to handlers

### 4. **Deploy**
- **Staging**: Test with `CLOUD_PROVIDER=local` first
- **Production**: Deploy with `CLOUD_PROVIDER=aws` (existing) or `CLOUD_PROVIDER=gcp` (new)

## Infrastructure Deployment

### GCP Terraform

```bash
cd infra/gcp
terraform init -backend-config="bucket=phase-mirror-tfstate"
terraform apply -var="project_id=my-project"
```

See `infra/gcp/main.tf` for the complete configuration.

### GCP Bootstrap (One-Time)

```bash
# 1. Set project
export PROJECT_ID="my-project"
gcloud config set project $PROJECT_ID

# 2. Enable APIs
gcloud services enable firestore.googleapis.com secretmanager.googleapis.com \
  cloudkms.googleapis.com iam.googleapis.com cloudresourcemanager.googleapis.com \
  iamcredentials.googleapis.com

# 3. Create Terraform state bucket
gsutil mb -l us-central1 gs://phase-mirror-tfstate
gsutil versioning set on gs://phase-mirror-tfstate

# 4. Apply Terraform
cd infra/gcp
terraform init -backend-config="bucket=phase-mirror-tfstate"
terraform apply -var="project_id=$PROJECT_ID"
```

After the first apply, subsequent deployments can use GitHub Actions (`.github/workflows/deploy-gcp.yml`).

## Benefits of This Architecture

### For Contributors
✅ **No cloud setup required** - Clone, `npm install`, `npm test` just works  
✅ **Fast feedback** - Local adapter tests run in seconds  
✅ **Easy debugging** - JSON files are human-readable  

### For Maintainers
✅ **Multi-cloud flexibility** - Switch providers without code changes  
✅ **Cost optimization** - Use local adapter for CI (save $$$)  
✅ **Gradual migration** - Refactor incrementally, test continuously  

### For Security
✅ **No long-lived keys** - OIDC for AWS and GCP  
✅ **Fail-closed secrets** - Missing nonce returns `null`, never throws  
✅ **K-anonymity enforced** - Calibration store validates privacy thresholds  

## Next Steps

1. **Update core logic** to use `createAdapters()` instead of direct AWS SDK calls
2. **Update CLI** to call `createAdapters()` at startup
3. **Update MCP server** to call `createAdapters()` at startup
4. **Deploy to staging** with `CLOUD_PROVIDER=local` for validation
5. **Deploy to production** with `CLOUD_PROVIDER=aws` or `CLOUD_PROVIDER=gcp`

## Documentation Links

- [Local Adapter README](./local/README.md) - Detailed local adapter documentation
- [Adapter Types](./types.ts) - Interface definitions with JSDoc
- [Config Loader](./config.ts) - Environment variable mapping
- [Factory](./factory.ts) - Dynamic adapter creation logic

## Support

For questions or issues:
- **GitHub Issues**: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Discussions**: https://github.com/MultiplicityFoundation/Phase-Mirror/discussions
