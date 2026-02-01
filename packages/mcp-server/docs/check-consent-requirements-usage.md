# check_consent_requirements Tool - Usage Examples

This document provides practical examples of using the `check_consent_requirements` MCP tool.

## Overview

The `check_consent_requirements` tool verifies organization consent status before accessing sensitive governance data. It supports 4 operations:

1. **check_single_resource** - Check consent for one resource
2. **check_multiple_resources** - Check multiple resources at once
3. **get_consent_summary** - Get full consent profile for an organization
4. **get_required_consent** - Map tool operations to required resources

## Operation 1: Check Single Resource

Verify consent for a specific resource like `fp_patterns`:

```json
{
  "orgId": "acme-corp",
  "operation": "check_single_resource",
  "resource": "fp_patterns"
}
```

**Response (Consent Granted):**
```json
{
  "success": true,
  "code": "CONSENT_GRANTED",
  "granted": true,
  "state": "granted",
  "resource": "fp_patterns",
  "grantedAt": "2026-01-15T10:30:00.000Z",
  "version": "1.2"
}
```

**Response (Consent Required):**
```json
{
  "success": false,
  "code": "CONSENT_REQUIRED",
  "granted": false,
  "state": "not_requested",
  "resource": "fp_patterns",
  "consentUrl": "https://phasemirror.com/console/consent",
  "learnMore": "https://phasemirror.com/docs/consent"
}
```

## Operation 2: Check Multiple Resources

Check consent for multiple resources at once:

```json
{
  "orgId": "acme-corp",
  "operation": "check_multiple_resources",
  "resources": ["fp_patterns", "fp_metrics", "cross_org_benchmarks"]
}
```

**Response:**
```json
{
  "success": true,
  "code": "CONSENT_GRANTED",
  "allGranted": true,
  "results": {
    "fp_patterns": {
      "granted": true,
      "state": "granted",
      "resource": "fp_patterns",
      "grantedAt": "2026-01-15T10:30:00.000Z",
      "version": "1.2"
    },
    "fp_metrics": {
      "granted": true,
      "state": "granted",
      "resource": "fp_metrics",
      "grantedAt": "2026-01-15T10:30:00.000Z",
      "version": "1.2"
    },
    "cross_org_benchmarks": {
      "granted": true,
      "state": "granted",
      "resource": "cross_org_benchmarks",
      "grantedAt": "2026-01-15T10:30:00.000Z",
      "version": "1.2"
    }
  },
  "missingConsent": []
}
```

## Operation 3: Get Consent Summary

Get the full consent profile for an organization:

```json
{
  "orgId": "acme-corp",
  "operation": "get_consent_summary"
}
```

**Response:**
```json
{
  "success": true,
  "code": "CONSENT_FOUND",
  "summary": {
    "orgId": "acme-corp",
    "orgName": "Acme Corporation",
    "resources": {
      "fp_patterns": {
        "resource": "fp_patterns",
        "state": "granted",
        "grantedAt": "2026-01-15T10:30:00.000Z",
        "version": "1.2"
      },
      "fp_metrics": {
        "resource": "fp_metrics",
        "state": "granted",
        "grantedAt": "2026-01-15T10:30:00.000Z",
        "version": "1.2"
      },
      "cross_org_benchmarks": {
        "resource": "cross_org_benchmarks",
        "state": "not_requested"
      },
      "rule_calibration": {
        "resource": "rule_calibration",
        "state": "granted",
        "grantedAt": "2026-01-15T10:30:00.000Z",
        "version": "1.2"
      },
      "audit_logs": {
        "resource": "audit_logs",
        "state": "not_requested"
      },
      "drift_baselines": {
        "resource": "drift_baselines",
        "state": "granted",
        "grantedAt": "2026-01-15T10:30:00.000Z",
        "version": "1.2"
      }
    },
    "grantedBy": "admin-user-hash",
    "consentVersion": "1.2",
    "history": [],
    "createdAt": "2026-01-15T10:30:00.000Z",
    "updatedAt": "2026-01-15T10:30:00.000Z"
  },
  "policyVersion": "1.2"
}
```

## Operation 4: Get Required Consent for Tool Operation

Determine which resources are required for a specific tool operation:

```json
{
  "orgId": "acme-corp",
  "operation": "get_required_consent",
  "tool": "query_fp_store",
  "toolOperation": "cross_rule_comparison"
}
```

**Response:**
```json
{
  "success": true,
  "code": "REQUIREMENTS_FOUND",
  "tool": "query_fp_store",
  "operation": "cross_rule_comparison",
  "requiredResources": ["fp_patterns", "cross_org_benchmarks"],
  "policyVersion": "1.2"
}
```

## Consent Resources

Phase Mirror defines 6 granular consent resources:

| Resource | Description | Risk Level | Typical Use |
|----------|-------------|------------|-------------|
| `fp_patterns` | Access to false positive patterns | Medium | Pattern analysis |
| `fp_metrics` | Access to FP rate metrics | Low | Metrics & trends |
| `cross_org_benchmarks` | Compare against anonymized org data | High | Benchmarking |
| `rule_calibration` | Access to rule tuning recommendations | Medium | Calibration |
| `audit_logs` | Access to governance audit logs | High | Auditing |
| `drift_baselines` | Access to historical drift baselines | Low | Drift analysis |

## Tool-to-Resource Mapping

Different tool operations require different consent resources:

### query_fp_store
- `fp_rate` → requires `fp_metrics`
- `recent_patterns` → requires `fp_patterns`
- `trend_analysis` → requires `fp_metrics`
- `cross_rule_comparison` → requires `fp_patterns`, `cross_org_benchmarks`

### check_adr_compliance
- `audit` → requires `audit_logs`

### analyze_dissonance
- `baseline` → requires `drift_baselines`

## Integration Flow

Before calling sensitive tools, check consent:

```javascript
// Step 1: Check what resources are needed
const requirements = await checkConsentRequirements({
  orgId: "acme-corp",
  operation: "get_required_consent",
  tool: "query_fp_store",
  toolOperation: "cross_rule_comparison"
});

// Step 2: Verify consent for those resources
const consentCheck = await checkConsentRequirements({
  orgId: "acme-corp",
  operation: "check_multiple_resources",
  resources: requirements.requiredResources
});

// Step 3: Proceed if consent granted
if (consentCheck.allGranted) {
  // Safe to call query_fp_store with cross_rule_comparison
  const fpResult = await queryFPStore({
    orgId: "acme-corp",
    queryType: "cross_rule_comparison",
    ruleIds: ["rule-001", "rule-002"]
  });
} else {
  // Handle missing consent
  console.error("Missing consent for:", consentCheck.missingConsent);
  console.log("Request consent at:", consentCheck.consentUrl);
}
```

## Error Scenarios

### Validation Error - Missing Required Parameter

```json
{
  "orgId": "acme-corp",
  "operation": "check_single_resource"
  // Missing "resource" parameter
}
```

**Response:**
```json
{
  "success": false,
  "code": "VALIDATION_ERROR",
  "message": "resource parameter is required for check_single_resource operation"
}
```

### Invalid Resource

```json
{
  "orgId": "acme-corp",
  "operation": "check_single_resource",
  "resource": "invalid_resource"
}
```

**Response:**
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Invalid input parameters",
  "details": [...]
}
```

## Compliance & Security

This tool ensures:

- ✅ **GDPR Article 7** compliance - Documented, demonstrable consent
- ✅ **EU AI Act** compliance - Transparent data access controls
- ✅ **ADR-004** compliance - FP anonymization with consent
- ✅ **Granular control** - Resource-level consent management
- ✅ **Audit trail** - All consent checks logged
- ✅ **Right to withdraw** - Immediate consent revocation support

## Performance

- Single resource check: <50ms (typical: 15ms)
- Multiple resources check: <100ms (typical: 35ms)
- Get consent summary: <150ms (typical: 60ms)
- Cache hit: <5ms (typical: 2ms)

## See Also

- [Consent Requirements Design](./consent-requirements-design.md)
- [ADR-004: FP Anonymization & Consent](../../docs/adr/)
- [MCP Server Documentation](../README.md)
