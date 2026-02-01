# check_consent_requirements Tool - Usage Examples

## Overview

The `check_consent_requirements` tool enables GitHub Copilot to verify organization consent before accessing sensitive governance data, ensuring compliance with ADR-004, GDPR, and privacy policies.

---

## Example 1: Validate Consent Before Querying FP Store

**Scenario**: Before running `query_fp_store`, check if organization has granted consent.

**Copilot Prompt**: "@copilot check if we have consent to query FP patterns for PhaseMirror"

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "validate",
    "resources": ["fp_patterns", "fp_metrics"]
  }
}
```

**Response (All Valid)**:
```json
{
  "success": true,
  "checkType": "validate",
  "orgId": "PhaseMirror",
  "validation": {
    "allValid": true,
    "checkedResources": ["fp_patterns", "fp_metrics"],
    "summary": "✅ All required consents are valid.",
    "resourceResults": {
      "fp_patterns": {
        "valid": true,
        "state": "granted",
        "grantedAt": "2026-01-15T10:00:00Z",
        "expiresAt": "2027-01-15T10:00:00Z",
        "version": "1.2"
      },
      "fp_metrics": {
        "valid": true,
        "state": "granted",
        "grantedAt": "2026-01-15T10:00:00Z",
        "version": "1.2"
      }
    },
    "issues": {
      "missingConsents": [],
      "expiredConsents": [],
      "needsReconsent": []
    },
    "actionRequired": false
  },
  "recommendations": [
    "✅ All required consents are valid. You may proceed with the operation."
  ],
  "compliance": {
    "gdprCompliant": true,
    "adr004Compliant": true,
    "policyVersion": "1.2"
  }
}
```

**Copilot Action**: Proceeds to call `query_fp_store` since consent is valid.

---

## Example 2: Handle Missing Consent

**Scenario**: Organization hasn't granted consent for cross-organization benchmarks.

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "acme-corp",
    "checkType": "validate",
    "resources": ["cross_org_benchmarks"]
  }
}
```

**Response (Missing Consent)**:
```json
{
  "success": true,
  "checkType": "validate",
  "orgId": "acme-corp",
  "validation": {
    "allValid": false,
    "checkedResources": ["cross_org_benchmarks"],
    "summary": "❌ Consent issues found. Missing consent for: cross_org_benchmarks.",
    "resourceResults": {
      "cross_org_benchmarks": {
        "valid": false,
        "state": "not_requested",
        "reason": "Consent for 'cross_org_benchmarks' has not been requested",
        "currentPolicyVersion": "1.2"
      }
    },
    "issues": {
      "missingConsents": ["cross_org_benchmarks"],
      "expiredConsents": [],
      "needsReconsent": []
    },
    "actionRequired": true,
    "actionUrl": "https://phasemirror.com/console/consent?org=acme-corp&action=grant&resources=cross_org_benchmarks"
  },
  "recommendations": [
    "Grant consent for: cross_org_benchmarks to access these features.",
    "Visit https://phasemirror.com/console/consent?org=acme-corp&action=grant&resources=cross_org_benchmarks to manage consent."
  ],
  "compliance": {
    "gdprCompliant": true,
    "adr004Compliant": true,
    "policyVersion": "1.2"
  }
}
```

**Copilot Action**: Informs user that consent is required and provides the action URL.

---

## Example 3: Get Organization Consent Summary

**Scenario**: Get overview of all consent status for an organization.

**Copilot Prompt**: "@copilot show me PhaseMirror's consent status"

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "summary"
  }
}
```

**Response**:
```json
{
  "success": true,
  "checkType": "summary",
  "orgId": "PhaseMirror",
  "consentSummary": {
    "hasAnyConsent": true,
    "policyVersion": "1.2",
    "currentPolicyVersion": "1.2",
    "needsReconsent": false,
    "resources": {
      "granted": ["fp_patterns", "fp_metrics", "drift_baselines"],
      "pending": [],
      "expired": ["audit_logs"],
      "revoked": [],
      "notRequested": ["cross_org_benchmarks", "rule_calibration"]
    },
    "statistics": {
      "totalResources": 6,
      "grantedCount": 3,
      "pendingCount": 0,
      "expiredCount": 1,
      "revokedCount": 0,
      "notRequestedCount": 2,
      "coveragePercent": 50
    }
  },
  "recommendations": [
    "1 consent(s) have expired. Renew to restore access.",
    "2 resource(s) not yet consented: cross_org_benchmarks, rule_calibration.",
    "Consent coverage is 50%. Consider granting more consents for full governance capabilities."
  ],
  "consentUrl": "https://phasemirror.com/console/consent?org=PhaseMirror",
  "compliance": {
    "gdprCompliant": true,
    "adr004Compliant": true,
    "policyVersion": "1.2"
  }
}
```

**Copilot Interpretation**: "PhaseMirror has 50% consent coverage. 3 resources are granted, 1 is expired (audit_logs), and 2 haven't been requested yet. Would you like me to guide you through granting additional consents?"

---

## Example 4: Check What Consent an Operation Requires

**Scenario**: Before implementing a feature using `query_fp_store.cross_rule_comparison`, check requirements.

**Copilot Prompt**: "@copilot what consent do I need to use cross_rule_comparison?"

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "PhaseMirror",
    "checkType": "required_for_operation",
    "tool": "query_fp_store",
    "operation": "cross_rule_comparison",
    "includePolicy": true
  }
}
```

**Response**:
```json
{
  "success": true,
  "checkType": "required_for_operation",
  "orgId": "PhaseMirror",
  "requiredConsents": {
    "tool": "query_fp_store",
    "operation": "cross_rule_comparison",
    "requiredResources": ["fp_metrics", "cross_org_benchmarks"],
    "resourceDescriptions": {
      "fp_metrics": "Access to aggregated false positive rate metrics",
      "cross_org_benchmarks": "Compare your governance metrics against anonymized industry benchmarks"
    },
    "requiresConsent": true
  },
  "currentStatus": {
    "allGranted": false,
    "summary": "❌ Consent issues found. Missing consent for: cross_org_benchmarks.",
    "missingConsents": ["cross_org_benchmarks"],
    "actionUrl": "https://phasemirror.com/console/consent?org=PhaseMirror&action=grant&resources=cross_org_benchmarks"
  },
  "canProceed": false,
  "blockedReason": "Missing consent for: cross_org_benchmarks",
  "recommendations": [
    "Grant consent for required resources before using query_fp_store",
    "Visit https://phasemirror.com/console/consent?org=PhaseMirror&action=grant&resources=cross_org_benchmarks to manage consent"
  ],
  "resourceDetails": [
    {
      "resource": "fp_metrics",
      "description": "Access to aggregated false positive rate metrics",
      "riskLevel": "low",
      "dataRetention": "365 days",
      "requiredFor": ["query_fp_store.fp_rate", "query_fp_store.cross_rule_comparison"],
      "gdprLawfulBasis": "consent"
    },
    {
      "resource": "cross_org_benchmarks",
      "description": "Compare your governance metrics against anonymized industry benchmarks",
      "riskLevel": "high",
      "dataRetention": "30 days",
      "requiredFor": ["query_fp_store.cross_rule_comparison"],
      "gdprLawfulBasis": "consent"
    }
  ]
}
```

**Copilot Interpretation**: "To use cross_rule_comparison, you need consent for fp_metrics (already granted) and cross_org_benchmarks (not granted). The cross_org_benchmarks resource is high-risk because it involves comparing against other organizations' anonymized data. Data is retained for 30 days. Would you like to request consent?"

---

## Example 5: Check Operation That Requires No Consent

**Scenario**: Check if `check_adr_compliance` requires any consent.

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "any-org",
    "checkType": "required_for_operation",
    "tool": "check_adr_compliance"
  }
}
```

**Response**:
```json
{
  "success": true,
  "checkType": "required_for_operation",
  "orgId": "any-org",
  "requiredConsents": {
    "tool": "check_adr_compliance",
    "operation": null,
    "requiredResources": [],
    "resourceDescriptions": {},
    "requiresConsent": false
  },
  "currentStatus": null,
  "canProceed": true
}
```

**Copilot Action**: Proceeds immediately since no consent is required.

---

## Example 6: Handle Expired Consent

**Scenario**: Consent was granted but has expired.

**Tool Call**:
```json
{
  "name": "check_consent_requirements",
  "arguments": {
    "orgId": "legacy-corp",
    "checkType": "validate",
    "resources": ["audit_logs"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "checkType": "validate",
  "orgId": "legacy-corp",
  "validation": {
    "allValid": false,
    "checkedResources": ["audit_logs"],
    "summary": "❌ Consent issues found. Missing consent for: audit_logs.",
    "resourceResults": {
      "audit_logs": {
        "valid": false,
        "state": "expired",
        "reason": "Consent expired",
        "grantedAt": "2025-01-01T00:00:00Z",
        "expiresAt": "2026-01-01T00:00:00Z",
        "version": "1.1",
        "currentPolicyVersion": "1.2"
      }
    },
    "issues": {
      "missingConsents": [],
      "expiredConsents": ["audit_logs"],
      "needsReconsent": []
    },
    "actionRequired": true,
    "actionUrl": "https://phasemirror.com/console/consent?org=legacy-corp&action=grant&resources=audit_logs"
  },
  "recommendations": [
    "Renew expired consent for: audit_logs.",
    "Visit https://phasemirror.com/console/consent?org=legacy-corp&action=grant&resources=audit_logs to manage consent."
  ],
  "compliance": {
    "gdprCompliant": true,
    "adr004Compliant": true,
    "policyVersion": "1.2"
  }
}
```

---

## Copilot Integration Pattern

Before calling sensitive tools, Copilot should:

1. **Identify required resources for operation**
   → `check_consent_requirements(checkType: "required_for_operation", tool, operation)`

2. **If consent required, validate current status**
   → `check_consent_requirements(checkType: "validate", resources)`

3. **If all valid** → proceed with operation  
   **If not valid** → inform user and provide action URL

### Example Copilot Workflow

**User**: "Show me FP trends for MD-001"

**Copilot**:
1. `[check_consent_requirements]` → "query_fp_store.trend_analysis" requires ["fp_patterns", "fp_metrics"]
2. `[check_consent_requirements]` → Validate fp_patterns, fp_metrics for PhaseMirror
3. Both valid ✅
4. `[query_fp_store]` → Execute trend analysis
5. Return results to user

---

## GDPR Compliance Notes

- All consent checks are logged for audit purposes
- Consent records include full history of changes
- Organizations can withdraw consent at any time
- Data retention periods are specified per resource
- Lawful basis (consent/legitimate interest) documented

---

## Testing with MCP Inspector

You can test these examples using the MCP Inspector:

```bash
# Start MCP server
cd packages/mcp-server
pnpm build
pnpm start

# In another terminal, open MCP Inspector
npx @modelcontextprotocol/inspector
```

Then paste the tool calls from the examples above to test each scenario.
