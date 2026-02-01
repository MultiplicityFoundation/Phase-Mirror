# Day 8-10 Tools - Usage Examples

## `check_adr_compliance` Tool

### Example 1: Check Workflow Permissions

**Scenario**: Validate PR that adds new deployment workflow

**Copilot Prompt**: "@copilot check if `.github/workflows/deploy-prod.yml` complies with ADR-001"

**Tool Call**:
```json
{
  "name": "check_adr_compliance",
  "arguments": {
    "files": [".github/workflows/deploy-prod.yml"],
    "adrs": ["ADR-001"]
  }
}
```

**Response**:
```json
{
  "success": true,
  "compliance": {
    "compliant": false,
    "violations": [
      {
        "adrId": "ADR-001",
        "ruleId": "ADR-001-R2",
        "file": ".github/workflows/deploy-prod.yml",
        "line": 23,
        "message": "Violates ADR-001: MUST NOT use permissions: write-all",
        "severity": "high",
        "remediation": "Replace with specific scopes: contents: read, id-token: write"
      }
    ],
    "suggestions": [
      "Found 1 ADR violation(s). Review and fix before proceeding.",
      "ADR-001: 1 violation(s). See docs/adr/ADR-001-github-actions-least-privilege.md"
    ]
  }
}
```

**Copilot Action**: Suggests fix with specific permission scopes

---

### Example 2: Auto-Match ADRs

**Scenario**: Check multiple files, let tool match relevant ADRs

**Tool Call**:
```json
{
  "name": "check_adr_compliance",
  "arguments": {
    "files": [
      ".github/workflows/ci.yml",
      "src/fp-store/query.ts",
      "packages/cli/src/index.ts"
    ],
    "context": "PR adds FP store querying capability"
  }
}
```

**Response**: Tool automatically matches:
- `.github/workflows/ci.yml` → ADR-001, ADR-002 (workflows)
- `src/fp-store/query.ts` → ADR-004 (FP anonymization)
- `packages/cli/src/index.ts` → (no specific ADRs)

---

## `query_fp_store` Tool

### Example 1: Check Rule FP Rate

**Scenario**: Developer suspects MD-002 is noisy

**Copilot Prompt**: "@copilot what's the false positive rate for MD-002?"

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "fp_rate",
    "ruleId": "MD-002",
    "orgId": "PhaseMirror"
  }
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "queryType": "fp_rate",
    "ruleId": "MD-002",
    "totalEvents": 234,
    "falsePositives": 21,
    "fpr": 0.0897,
    "confidence": "high",
    "recommendation": "Good FPR (5-10%). Within acceptable range."
  }
}
```

**Copilot Interpretation**: "MD-002 has an FP rate of 8.97%, which is within the acceptable range (<10%). The rule appears well-calibrated based on 234 events."

---

### Example 2: Analyze FP Trend

**Scenario**: Understand if rule improvement efforts are working

**Copilot Prompt**: "@copilot show me the FP trend for MD-001 over the last 90 days"

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "trend_analysis",
    "ruleId": "MD-001",
    "orgId": "PhaseMirror",
    "daysBack": 90
  }
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "queryType": "trend_analysis",
    "ruleId": "MD-001",
    "timeRange": {
      "start": "2025-11-01",
      "end": "2026-02-01"
    },
    "dataPoints": [
      { "date": "2025-11-01", "fpr": 0.08, "events": 42 },
      { "date": "2025-11-08", "fpr": 0.07, "events": 51 },
      { "date": "2025-11-15", "fpr": 0.06, "events": 63 },
      { "date": "2025-11-22", "fpr": 0.05, "events": 58 },
      { "date": "2025-11-29", "fpr": 0.045, "events": 61 },
      { "date": "2025-12-06", "fpr": 0.04, "events": 65 },
      { "date": "2025-12-13", "fpr": 0.038, "events": 72 },
      { "date": "2025-12-20", "fpr": 0.035, "events": 69 },
      { "date": "2025-12-27", "fpr": 0.033, "events": 64 },
      { "date": "2026-01-03", "fpr": 0.032, "events": 70 },
      { "date": "2026-01-10", "fpr": 0.031, "events": 68 },
      { "date": "2026-01-17", "fpr": 0.030, "events": 71 },
      { "date": "2026-01-24", "fpr": 0.030, "events": 66 },
      { "date": "2026-01-31", "fpr": 0.030, "events": 67 }
    ],
    "trend": "decreasing",
    "percentChange": -62.5,
    "interpretation": "FPR decreasing by 62.5%. Rule improving over time. ✅"
  }
}
```

**Copilot Interpretation**: "Great news! MD-001's false positive rate has decreased by 62.5% over the last 90 days (from 8% to 3%). The rule refinements are working effectively."

---

### Example 3: Identify Rules Needing Calibration

**Scenario**: Quarterly rule health check

**Copilot Prompt**: "@copilot which rules have the highest false positive rates?"

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "cross_rule_comparison",
    "ruleIds": ["MD-001", "MD-002", "MD-003", "MD-004", "MD-005", "MD-006", "MD-007"],
    "orgId": "PhaseMirror",
    "threshold": 0.1
  }
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "queryType": "cross_rule_comparison",
    "rulesAnalyzed": 7,
    "rules": [
      { 
        "ruleId": "MD-007", 
        "fpr": 0.145, 
        "totalEvents": 89, 
        "falsePositives": 13,
        "confidence": "medium",
        "needsCalibration": true 
      },
      { 
        "ruleId": "MD-003", 
        "fpr": 0.118, 
        "totalEvents": 234, 
        "falsePositives": 28,
        "confidence": "high",
        "needsCalibration": true 
      },
      { 
        "ruleId": "MD-005", 
        "fpr": 0.092, 
        "totalEvents": 156, 
        "falsePositives": 14,
        "confidence": "high",
        "needsCalibration": false 
      },
      { 
        "ruleId": "MD-002", 
        "fpr": 0.089, 
        "totalEvents": 301, 
        "falsePositives": 27,
        "confidence": "high",
        "needsCalibration": false 
      },
      { 
        "ruleId": "MD-001", 
        "fpr": 0.031, 
        "totalEvents": 1250, 
        "falsePositives": 39,
        "confidence": "high",
        "needsCalibration": false 
      },
      { 
        "ruleId": "MD-004", 
        "fpr": 0.028, 
        "totalEvents": 445, 
        "falsePositives": 12,
        "confidence": "high",
        "needsCalibration": false 
      },
      { 
        "ruleId": "MD-006", 
        "fpr": 0.015, 
        "totalEvents": 678, 
        "falsePositives": 10,
        "confidence": "high",
        "needsCalibration": false 
      }
    ],
    "summary": {
      "needingCalibration": 2,
      "averageFPR": 0.074,
      "highestFPR": {
        "ruleId": "MD-007",
        "fpr": 0.145,
        "totalEvents": 89,
        "falsePositives": 13,
        "confidence": "medium",
        "needsCalibration": true
      },
      "lowestFPR": {
        "ruleId": "MD-006",
        "fpr": 0.015,
        "totalEvents": 678,
        "falsePositives": 10,
        "confidence": "high",
        "needsCalibration": false
      }
    },
    "recommendations": [
      "MD-007: FPR 14.5% exceeds threshold. Review rule logic.",
      "MD-003: FPR 11.8% exceeds threshold. Review rule logic."
    ]
  }
}
```

**Copilot Interpretation**: "Two rules need attention: MD-007 (14.5% FPR) and MD-003 (11.8% FPR) both exceed the 10% threshold. The other 5 rules are well-calibrated. I recommend prioritizing MD-007 for refinement."

---

### Example 4: Recent Patterns Analysis

**Scenario**: Investigating recurring false positives

**Copilot Prompt**: "@copilot show me recent false positive patterns for MD-003"

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "recent_patterns",
    "ruleId": "MD-003",
    "orgId": "PhaseMirror",
    "daysBack": 30,
    "limit": 10
  }
}
```

**Response**:
```json
{
  "success": true,
  "result": {
    "queryType": "recent_patterns",
    "ruleId": "MD-003",
    "patternsFound": 3,
    "patterns": [
      {
        "contextHash": "a1b2c3d4e5f6...",
        "frequency": 8,
        "lastSeen": "2026-01-30T14:22:00Z",
        "firstSeen": "2026-01-15T09:14:00Z",
        "durationDays": 15
      },
      {
        "contextHash": "7g8h9i0j1k2l...",
        "frequency": 5,
        "lastSeen": "2026-01-28T11:45:00Z",
        "firstSeen": "2026-01-20T16:30:00Z",
        "durationDays": 8
      },
      {
        "contextHash": "m3n4o5p6q7r8...",
        "frequency": 3,
        "lastSeen": "2026-01-25T08:12:00Z",
        "firstSeen": "2026-01-22T13:55:00Z",
        "durationDays": 3
      }
    ],
    "suggestions": [
      "Found 3 recurring FP pattern(s). Consider rule refinement to reduce noise."
    ]
  }
}
```

**Copilot Interpretation**: "MD-003 has 3 recurring false positive patterns. The most frequent pattern has appeared 8 times over 15 days, indicating a systematic issue. Consider refining the rule to exclude these legitimate patterns."

---

## Tool Integration Examples

### Complete Workflow: From ADR Check to FP Analysis

**Step 1**: Check ADR compliance for new workflow
```json
{
  "name": "check_adr_compliance",
  "arguments": {
    "files": [".github/workflows/new-feature.yml"],
    "adrs": ["ADR-001", "ADR-002"]
  }
}
```

**Step 2**: If violations found, understand rule performance
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "fp_rate",
    "ruleId": "MD-001",
    "orgId": "PhaseMirror"
  }
}
```

**Step 3**: Check if similar patterns were previously marked as FP
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "recent_patterns",
    "ruleId": "MD-001",
    "orgId": "PhaseMirror",
    "daysBack": 90
  }
}
```

---

## Error Handling Examples

### Consent Required Error

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "fp_rate",
    "ruleId": "MD-001",
    "orgId": "UnauthorizedOrg"
  }
}
```

**Response**:
```json
{
  "success": false,
  "error": "Consent required",
  "code": "CONSENT_REQUIRED",
  "message": "Organization 'UnauthorizedOrg' has not granted consent for FP store access. Contact your Phase Mirror administrator to request access.",
  "learnMore": "https://phasemirror.com/docs/fp-store-consent",
  "timestamp": "2026-02-01T10:30:00Z"
}
```

---

### Invalid Parameters Error

**Tool Call**:
```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "fp_rate",
    "orgId": "PhaseMirror"
    // Missing required ruleId
  }
}
```

**Response**:
```json
{
  "success": false,
  "error": "FP store query failed",
  "code": "EXECUTION_FAILED",
  "message": "ruleId is required for fp_rate query",
  "timestamp": "2026-02-01T10:30:00Z"
}
```

---

## Best Practices

### When to Use check_adr_compliance

1. **Pre-implementation** - Before starting work on a feature
2. **During development** - After making significant changes
3. **PR validation** - Before submitting pull request
4. **Refactoring** - When restructuring code

### When to Use query_fp_store

1. **Rule calibration** - Quarterly reviews of rule performance
2. **Investigating noise** - When a rule seems too noisy
3. **Trend analysis** - After making rule improvements
4. **Comparative analysis** - When prioritizing rule improvements

### Performance Tips

- Use `limit` parameter to control result size
- Use `daysBack` for focused time windows
- Cache frequently accessed data
- Use `cross_rule_comparison` for bulk analysis

---

## Advanced Usage

### Custom Threshold for Calibration

```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "cross_rule_comparison",
    "ruleIds": ["MD-001", "MD-002", "MD-003"],
    "orgId": "PhaseMirror",
    "threshold": 0.05  // Stricter than default 0.1
  }
}
```

### Long-term Trend Analysis

```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "trend_analysis",
    "ruleId": "MD-001",
    "orgId": "PhaseMirror",
    "daysBack": 365  // Full year
  }
}
```

### Focused Pattern Search

```json
{
  "name": "query_fp_store",
  "arguments": {
    "queryType": "recent_patterns",
    "ruleId": "MD-002",
    "orgId": "PhaseMirror",
    "daysBack": 7,  // Last week only
    "limit": 5      // Top 5 patterns
  }
}
```

---

## Compliance & Privacy

All FP store queries:
- ✅ Require organization consent (ADR-004)
- ✅ Anonymize all data (no PII)
- ✅ Hash context for privacy
- ✅ Log access for audit trail
- ✅ Respect data retention policies

---

## See Also

- [ADR-001: GitHub Actions Least Privilege](../../docs/adr/ADR-001-github-actions-least-privilege.md)
- [ADR-004: FP Anonymization](../../docs/adr/ADR-004-fp-anonymization.md)
- [MCP Server README](../README.md)
- [Test Cases](../test-cases/day8-10-test-cases.json)
