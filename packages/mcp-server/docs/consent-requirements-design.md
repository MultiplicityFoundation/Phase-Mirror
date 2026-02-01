# Consent Requirements Design

## Overview

The `check_consent_requirements` tool verifies organization consent status for governance data access, ensuring compliance with ADR-004, GDPR, and the EU AI Act.

---

## Consent Model

### Organization Consent Record

```typescript
interface OrganizationConsent {
  /** Unique organization identifier (hashed) */
  orgId: string;
  
  /** Organization display name (for UI only) */
  orgName?: string;
  
  /** Resources the organization has consented to */
  grantedResources: ConsentResource[];
  
  /** Timestamp when consent was granted */
  consentedAt: Date;
  
  /** Timestamp when consent expires (if applicable) */
  expiresAt?: Date;
  
  /** Who granted consent (hashed admin ID) */
  grantedBy: string;
  
  /** Consent version (for re-consent on policy changes) */
  consentVersion: string;
  
  /** Audit trail of consent changes */
  history: ConsentEvent[];
}
```

### Consent Resources

Phase Mirror defines granular consent resources:

| Resource | Description | Risk Level | ADR Reference |
|----------|-------------|------------|---------------|
| fp_patterns | Access to false positive patterns | Medium | ADR-004 |
| fp_metrics | Access to FP rate metrics | Low | ADR-004 |
| cross_org_benchmarks | Compare against anonymized org data | High | ADR-004 |
| rule_calibration | Access to rule tuning recommendations | Medium | ADR-004 |
| audit_logs | Access to governance audit logs | High | ADR-003 |
| drift_baselines | Access to historical drift baselines | Low | ADR-003 |

### Consent States

```typescript
type ConsentState = 
  | "granted"       // Active consent
  | "expired"       // Consent past expiration date
  | "revoked"       // Consent explicitly withdrawn
  | "pending"       // Consent requested but not yet granted
  | "not_requested" // No consent record exists
```

## Consent Verification Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Tool Request                          │
│  (query_fp_store, check_adr_compliance, etc.)           │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│          check_consent_requirements                      │
│  1. Identify required resources for operation           │
│  2. Query ConsentStore for organization                 │
│  3. Verify consent state for each resource              │
│  4. Check consent version matches current policy        │
│  5. Validate consent not expired                        │
└───────────────────────┬─────────────────────────────────┘
                        │
            ┌───────────┴───────────┐
            │                       │
            ▼                       ▼
    ┌───────────────┐       ┌───────────────┐
    │ Consent Valid │       │ Consent Invalid│
    │               │       │               │
    │ → Proceed     │       │ → Block       │
    │ → Log access  │       │ → Return error│
    │               │       │ → Guide user  │
    └───────────────┘       └───────────────┘
```

## Consent Operations

### Operation 1: Check Single Resource

**Input:** Organization ID, Resource name  
**Output:** Consent status for that resource

```typescript
checkConsent(orgId: "acme-corp", resource: "fp_patterns")
// Returns: { granted: true, expiresAt: "2026-06-01", version: "1.2" }
```

### Operation 2: Check Multiple Resources

**Input:** Organization ID, Array of resources  
**Output:** Consent status for each resource

```typescript
checkConsent(orgId: "acme-corp", resources: ["fp_patterns", "cross_org_benchmarks"])
// Returns: { 
//   fp_patterns: { granted: true },
//   cross_org_benchmarks: { granted: false, reason: "not_requested" }
// }
```

### Operation 3: Get Consent Summary

**Input:** Organization ID  
**Output:** Full consent profile for organization

```typescript
getConsentSummary(orgId: "acme-corp")
// Returns full OrganizationConsent record
```

### Operation 4: Get Required Consent for Operation

**Input:** Tool name, Operation parameters  
**Output:** List of resources that require consent

```typescript
getRequiredConsent(tool: "query_fp_store", params: { queryType: "cross_rule_comparison" })
// Returns: ["fp_patterns", "fp_metrics"]
```

## Consent Policy Management

### Current Policy Version

Policy versions track consent requirements over time:

```typescript
const CURRENT_CONSENT_POLICY = {
  version: "1.2",
  effectiveDate: "2026-01-01",
  resources: {
    fp_patterns: {
      description: "Access to false positive patterns from your organization",
      riskLevel: "medium",
      dataRetention: "90 days",
      requiredFor: ["query_fp_store.recent_patterns"],
    },
    fp_metrics: {
      description: "Access to aggregated FP rate metrics",
      riskLevel: "low",
      dataRetention: "365 days",
      requiredFor: ["query_fp_store.fp_rate", "query_fp_store.trend_analysis"],
    },
    cross_org_benchmarks: {
      description: "Compare your governance metrics against anonymized industry benchmarks",
      riskLevel: "high",
      dataRetention: "30 days",
      requiredFor: ["query_fp_store.cross_rule_comparison"],
    },
    // ...
  },
};
```

### Re-Consent Triggers

Organizations must re-consent when:

1. **Policy version changes:** New resources or terms added
2. **Consent expires:** Annual renewal required
3. **Significant processing changes:** Major feature additions
4. **Regulatory requirements:** New compliance obligations

## GDPR Compliance

### Documented Consent (Article 7)

Per GDPR requirements:

- **Freely given:** No service degradation for refusal
- **Specific:** Granular resource-level consent
- **Informed:** Clear description of data usage
- **Unambiguous:** Explicit affirmative action required

### Demonstrable Consent

ConsentStore maintains audit trail:

```typescript
interface ConsentEvent {
  eventId: string;
  eventType: "granted" | "revoked" | "expired" | "renewed";
  resource: string;
  timestamp: Date;
  actor: string; // Hashed admin ID
  ipAddress?: string; // Hashed for privacy
  userAgent?: string;
}
```

### Right to Withdraw

Organizations can revoke consent at any time:

- Immediate effect across all systems
- No data retained after revocation grace period
- Clear revocation UI provided

## Error Responses

### Consent Required

```json
{
  "success": false,
  "code": "CONSENT_REQUIRED",
  "message": "Organization 'acme-corp' has not granted consent for 'fp_patterns'",
  "consentUrl": "https://phasemirror.com/console/consent",
  "requiredResources": ["fp_patterns"],
  "learnMore": "https://phasemirror.com/docs/consent"
}
```

### Consent Expired

```json
{
  "success": false,
  "code": "CONSENT_EXPIRED",
  "message": "Consent for 'fp_metrics' expired on 2026-01-15",
  "expiresAt": "2026-01-15T00:00:00Z",
  "renewUrl": "https://phasemirror.com/console/consent/renew"
}
```

### Policy Version Mismatch

```json
{
  "success": false,
  "code": "CONSENT_VERSION_MISMATCH",
  "message": "Consent was granted under policy v1.1, current policy is v1.2",
  "grantedVersion": "1.1",
  "currentVersion": "1.2",
  "reconsentUrl": "https://phasemirror.com/console/consent/update"
}
```

## Performance Targets

| Operation | Target Latency | Typical |
|-----------|----------------|---------|
| Check single resource | <50ms | 15ms |
| Check multiple resources | <100ms | 35ms |
| Get consent summary | <150ms | 60ms |
| Cache hit | <5ms | 2ms |

### Caching Strategy

Consent status cached locally with short TTL:

- **Cache TTL:** 5 minutes
- **Invalidation:** On consent change webhook
- **Fallback:** Always query on cache miss

## Security Considerations

- **Organization ID hashing:** Never store plaintext org identifiers
- **Admin ID hashing:** Consent granters anonymized
- **Audit log encryption:** Consent events encrypted at rest
- **Access logging:** All consent checks logged for audit
- **Rate limiting:** Prevent consent status enumeration
