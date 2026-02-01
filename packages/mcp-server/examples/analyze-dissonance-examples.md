# analyze_dissonance Tool - Usage Examples

## Example 1: Basic Analysis Before Implementing Feature

**Scenario**: Developer working on authentication feature wants to check governance compliance before coding.

**Copilot Command**: "Check if implementing JWT authentication violates any governance rules"

**Tool Call**:
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      "src/auth/jwt.ts",
      "src/middleware/authentication.ts",
      ".github/workflows/deploy.yml"
    ],
    "repository": {
      "owner": "acme-corp",
      "name": "api-gateway"
    },
    "mode": "issue",
    "context": "Implement JWT authentication with RS256 signing algorithm"
  }
}
```

**Response Interpretation**:
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "totalFindings": 2,
      "decision": "warn"
    },
    "findings": [
      {
        "ruleId": "MD-003",
        "severity": "medium",
        "title": "Hardcoded secret detected",
        "evidence": [{
          "path": "src/auth/jwt.ts",
          "line": 15,
          "snippet": "const SECRET = 'hardcoded-value';"
        }]
      }
    ],
    "adrReferences": {
      "ADR-004": "Secret Management with HashiCorp Vault"
    },
    "recommendations": [
      "Review ADR-004 for secret management constraints",
      "Use environment variables or vault for JWT secrets"
    ]
  }
}
```

**Copilot Action**: Reviews ADR-004, suggests using environment variable for JWT secret.

---

## Example 2: PR Validation

**Scenario**: Copilot agent assigned to PR, needs to validate changes meet governance.

**Tool Call**:
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      ".github/workflows/new-deploy.yml"
    ],
    "repository": {
      "owner": "acme-corp",
      "name": "api-gateway",
      "branch": "feature/cd-pipeline"
    },
    "mode": "pull_request",
    "commitSha": "abc123def456...",
    "context": "Add continuous deployment pipeline with AWS CodeDeploy"
  }
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "totalFindings": 1,
      "decision": "block"
    },
    "findings": [
      {
        "ruleId": "MD-001",
        "severity": "critical",
        "title": "Excessive GitHub Actions permissions",
        "evidence": [{
          "path": ".github/workflows/new-deploy.yml",
          "line": 8,
          "snippet": "permissions: write-all"
        }],
        "remediation": "Use principle of least privilege. Grant only: id-token: write, contents: read"
      }
    ],
    "adrReferences": {
      "ADR-001": "GitHub Actions OIDC Authentication",
      "ADR-003": "Principle of Least Privilege"
    },
    "recommendations": [
      "Address 1 critical finding immediately before proceeding",
      "Review ADR-001, ADR-003 for architectural constraints"
    ]
  }
}
```

**Copilot Action**: Fixes permissions, updates PR, requests re-review.

---

## Example 3: Checking False Positive Patterns (Enterprise)

**Scenario**: Enterprise customer wants to see if similar issues were marked as false positives before.

**Tool Call**:
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": ["infra/terraform/main.tf"],
    "repository": {
      "owner": "enterprise-corp",
      "name": "cloud-infrastructure"
    },
    "mode": "issue",
    "includeADRs": true,
    "includeFPPatterns": true
  }
}
```

**Response (with consent)**:
```json
{
  "success": true,
  "analysis": {
    "findings": [
      {
        "ruleId": "MD-005",
        "severity": "high",
        "title": "Terraform state not encrypted"
      }
    ],
    "fpPatterns": {
      "MD-005": {
        "count": 3,
        "observedFPR": 0.6,
        "recentExamples": [
          {
            "outcome": "warn",
            "reviewedBy": "security-team",
            "ticket": "SEC-4521"
          },
          {
            "outcome": "block",
            "reviewedBy": "platform-team",
            "ticket": "PLAT-892"
          }
        ]
      }
    },
    "recommendations": [
      "MD-005 has 60% false positive rate. Review similar cases before blocking."
    ]
  }
}
```

**Copilot Action**: Notes high FP rate, suggests reviewing past tickets, proceeds cautiously.

---

## Example 4: Drift Detection

**Scenario**: Scheduled job checks for drift from established baseline.

**Tool Call**:
```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      ".github/workflows/ci.yml",
      "package.json",
      "tsconfig.json"
    ],
    "repository": {
      "owner": "acme-corp",
      "name": "api-gateway"
    },
    "mode": "drift",
    "context": "Weekly drift detection from production baseline"
  }
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "totalFindings": 0,
      "decision": "pass"
    },
    "recommendations": [
      "No governance violations detected. No drift from baseline."
    ]
  }
}
```

---

## Example 5: Degraded Mode Handling

**Scenario**: Circuit breaker triggered due to high block rate.

**Tool Call**: (Same as Example 1)

**Response**:
```json
{
  "success": true,
  "analysis": {
    "summary": {
      "totalFindings": 1,
      "decision": "warn",
      "degradedMode": true
    },
    "degradedModeDetails": {
      "reason": "circuit_breaker_triggered",
      "timestamp": "2026-02-01T12:34:56Z",
      "details": "11 blocks in current hour (threshold: 10)"
    },
    "recommendations": [
      "Oracle in degraded mode (circuit_breaker_triggered). Some checks bypassed.",
      "Circuit breaker active. Review recent false positives and consider rule tuning."
    ]
  }
}
```

**Copilot Action**: Proceeds with caution, logs degraded mode incident.

---

## Tips for Using analyze_dissonance

### Best Practices

1. **Run Early**: Check governance rules before starting implementation
2. **Provide Context**: Include issue description or PR context for better analysis
3. **Review ADRs**: Always review referenced ADRs for architectural guidance
4. **Handle Degraded Mode**: Be aware when circuit breaker is active
5. **Enterprise Features**: Use FP patterns (with consent) to understand historical trends

### Common Use Cases

- **Pre-implementation Check**: Run in `issue` mode before coding
- **PR Review Automation**: Run in `pull_request` mode during code review
- **Merge Queue Validation**: Run in `merge_group` mode before merging
- **Compliance Monitoring**: Run in `drift` mode periodically to detect violations

### Error Handling

If the tool returns an error, check:
- File paths are relative to repository root
- Repository owner/name are correct
- Required fields (files, repository) are provided
- Network connectivity for AWS resources (if configured)
