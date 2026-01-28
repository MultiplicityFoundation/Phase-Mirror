# Phase 2: FP Calibration Service - Implementation Summary

**Branch:** `copilot/introduce-phase-2-calibration-service`  
**Status:** ✅ Complete  
**Date:** January 28, 2026

---

## Overview

Phase 2 introduces a privacy-respecting False Positive (FP) Calibration Service that enables aggregate data collection while protecting individual organization privacy through HMAC anonymization and k-anonymity enforcement.

---

## Implemented Components

### 1. Type System Extensions (`schemas/types.ts`)

Added comprehensive type definitions for Phase 2:

- **ConsentType**: `'explicit' | 'implicit' | 'none'`
- **ConsentRecord**: Organization consent tracking
- **IngestEvent**: Raw FP data before anonymization
- **AnonymizedIngestEvent**: Post-anonymization FP data
- **CalibrationResult**: k-anonymity safe query results
- **KAnonymityError**: Privacy threshold violation errors
- **Updated FalsePositiveEvent**: Added `orgIdHash` and `consent` fields

### 2. Consent Store (`src/consent-store/index.ts`)

Manages organization consent for data collection:

- **DynamoDBConsentStore**: Production implementation with DynamoDB backend
- **NoOpConsentStore**: Development/testing implementation
- **Key Methods**:
  - `checkConsent(orgId)`: Returns consent type for organization
  - `recordConsent(record)`: Stores consent record
  - `hasValidConsent(orgId)`: Boolean check for explicit/implicit consent

### 3. Anonymizer Service (`src/anonymizer/index.ts`)

HMAC-SHA256 based organization ID anonymization:

- **Anonymizer**: Production class with AWS Secrets Manager integration
- **NoOpAnonymizer**: Development/testing class with hardcoded salt
- **Key Features**:
  - Loads rotating salt from AWS Secrets Manager
  - Input validation (non-empty, max 255 chars)
  - Monthly salt rotation tracking
  - Deterministic HMAC-SHA256 hashing
- **Key Methods**:
  - `loadSalt()`: Loads salt from AWS Secrets Manager
  - `anonymizeOrgId(orgId)`: Returns hashed organization ID
  - `getSaltRotationMonth()`: Returns current rotation month
  - `isSaltLoaded()`: Checks if salt is loaded

### 4. Calibration Store (`src/calibration-store/index.ts`)

k-Anonymity enforced queries (k=10):

- **DynamoDBCalibrationStore**: Production implementation
- **NoOpCalibrationStore**: Development/testing implementation
- **Key Methods**:
  - `aggregateFPsByRule(ruleId)`: Aggregate FPs for a specific rule
  - `getRuleFPRate(ruleId, startDate?, endDate?)`: FP rate with date filtering
  - `getAllRuleFPRates()`: All rules with sufficient data
- **Privacy Guarantees**:
  - All queries require ≥10 organizations
  - Returns `KAnonymityError` when privacy threshold not met
  - Prevents individual organization identification

**DynamoDB Schema Requirements:**
- Primary Key: `id` (String)
- Attributes: `orgIdHash`, `ruleId`, `timestamp`, `context`, `isFalsePositive`
- Global Secondary Index: `rule-index` (partition key: `ruleId`)

### 5. Ingest Handler (`src/ingest-handler/index.ts`)

Orchestrates the FP ingestion pipeline:

- **Pipeline**: Consent Check → Anonymization → Timestamp Randomization → Storage
- **Key Methods**:
  - `ingest(event)`: Process single FP event
  - `ingestBatch(events)`: Process multiple events
- **Features**:
  - Rejects ingestion when consent is 'none'
  - Randomizes timestamps within batch window (default 1 hour)
  - Prevents timing-based de-anonymization attacks
  - Comprehensive error handling

### 6. FP Store Updates (`src/fp-store/store.ts`)

Extended to support Phase 2 anonymization:

- Added `orgIdHash` storage (hashed organization ID)
- Added `consent` field to track consent type
- Ensures raw organization IDs never stored
- Maintains backward compatibility

---

## Privacy & Security Features

### HMAC Anonymization

- Organization IDs hashed with secret salt before storage
- Salt stored in AWS Secrets Manager (encrypted at rest)
- Monthly salt rotation for forward secrecy
- Even database administrators cannot reverse hashes

### k-Anonymity Enforcement

- All queries require ≥10 organizations
- Prevents statistical inference attacks
- Returns error when privacy threshold not met
- Protects individual organization identification

### Timestamp Randomization

- Prevents timing-based correlation attacks
- Default batch window: 1 hour
- Random delay within [timestamp, timestamp + window]

### Consent Management

- Organizations can opt out completely
- Consent can expire or be revoked
- No data collected without consent
- Fail-closed on consent store failures

---

## Documentation Updates

### README.md

- Added Phase 2 status indicator
- Updated repository layout with new modules
- Listed Phase 2 in documentation section

### docs/architecture.md

- Added comprehensive Phase 2 section
- Documented all components and interfaces
- Included data flow diagrams
- Provided integration examples
- Referenced ADR-004 and ADR-005

---

## Code Quality

### Testing & Validation

- ✅ TypeScript compilation passes
- ✅ All types properly exported
- ✅ No security vulnerabilities (CodeQL scan)
- ✅ Code review feedback addressed

### Improvements Made

1. **Input Validation**: Added validation for orgId (non-empty, max length)
2. **Timestamp Validation**: Added NaN check in timestamp randomization
3. **Deprecated Method**: Replaced `substr()` with `substring()`
4. **Type Safety**: Improved expression attribute value types
5. **Documentation**: Added DynamoDB schema requirements
6. **Security**: Enhanced NoOpAnonymizer with warnings and better test salt

---

## ADR Compliance

### ADR-004: FP Anonymization with HMAC + k-Anonymity

✅ **Fully Implemented**

- HMAC-SHA256 anonymization with rotating salts
- k-Anonymity enforcement (k=10) on all queries
- Salt loading from AWS Secrets Manager
- Consent management system
- Timestamp randomization (anti-timing attacks)

### ADR-005: Nonce Rotation & Fail-Closed Availability

✅ **Extended**

- Applied nonce rotation principles to salt management
- Fail-closed behavior on consent store failures
- Monthly rotation tracking

---

## Integration Example

```typescript
// Initialize services
const consentStore = createConsentStore({ tableName: 'consent-store' });
const anonymizer = createAnonymizer({ saltParameterName: '/fp-calibration/salt' });
const fpStore = createFPStore({ tableName: 'fp-events' });

const ingestHandler = createIngestHandler({
  consentStore,
  anonymizer,
  fpStore,
  batchDelayMs: 3600000 // 1 hour
});

// Ingest FP data
const result = await ingestHandler.ingest({
  orgId: 'org-abc123',
  ruleId: 'MD-003',
  isFalsePositive: true,
  timestamp: new Date().toISOString()
});

// Query calibration data (k-anonymity enforced)
const calibrationStore = createCalibrationStore({ tableName: 'calibration-store' });
const fpRate = await calibrationStore.getRuleFPRate('MD-003');

if ('error' in fpRate) {
  console.log('Privacy threshold not met:', fpRate.message);
} else {
  console.log(`Rule MD-003: ${fpRate.totalFPs} FPs from ${fpRate.orgCount} orgs`);
}
```

---

## Files Changed

### New Files (7)

1. `packages/mirror-dissonance/src/consent-store/index.ts`
2. `packages/mirror-dissonance/src/anonymizer/index.ts`
3. `packages/mirror-dissonance/src/calibration-store/index.ts`
4. `packages/mirror-dissonance/src/ingest-handler/index.ts`
5. `PHASE_2_SUMMARY.md` (this file)

### Modified Files (4)

6. `packages/mirror-dissonance/schemas/types.ts`
7. `packages/mirror-dissonance/src/fp-store/store.ts`
8. `README.md`
9. `docs/architecture.md`

### Build Artifacts

10. `pnpm-lock.yaml` (updated)

**Total:** 9 substantive files created/modified

---

## Next Steps (Infrastructure)

While Phase 2 code is complete, the following infrastructure steps are needed for production deployment:

1. **DynamoDB Tables**: Create consent-store, calibration-store tables with proper indexes
2. **AWS Secrets Manager**: Store HMAC salt parameter
3. **IAM Policies**: Grant appropriate permissions
4. **Salt Rotation**: Set up monthly rotation automation
5. **Monitoring**: Add CloudWatch alarms for consent failures
6. **Documentation**: Deployment runbooks for operations team

---

## Conclusion

Phase 2 is **code-complete** and ready for infrastructure deployment. The implementation:

- ✅ Follows ADR-004 and ADR-005 specifications
- ✅ Uses idiomatic TypeScript with explicit result types
- ✅ Maintains repository structure and patterns
- ✅ Includes comprehensive documentation
- ✅ Passes all builds and security scans
- ✅ Addresses code review feedback

The FP Calibration Service provides enterprise-grade privacy protection while enabling valuable aggregate false positive analysis.

---

**Implementation Team:** Copilot SWE Agent  
**Review Status:** Self-reviewed, CodeQL scanned  
**Build Status:** ✅ Passing  
**Security Status:** ✅ No vulnerabilities
