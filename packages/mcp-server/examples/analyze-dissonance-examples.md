# analyze_dissonance Tool - Usage Examples

This document provides real-world usage examples for the `analyze_dissonance` MCP tool.

## Table of Contents

1. [Example 1: Basic Analysis Before Implementing Feature](#example-1-basic-analysis-before-implementing-feature)
2. [Example 2: PR Validation](#example-2-pr-validation)
3. [Example 3: Multiple File Analysis](#example-3-multiple-file-analysis)
4. [Example 4: Drift Detection](#example-4-drift-detection)
5. [Example 5: Error Handling](#example-5-error-handling)

---

## Example 1: Basic Analysis Before Implementing Feature

**Scenario**: Developer working on authentication feature wants to check governance compliance before coding.

**Copilot Prompt**: "Check if implementing JWT authentication violates any governance rules"

### Tool Call

```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      "src/auth/jwt.ts",
      "src/middleware/authentication.ts",
      ".github/workflows/deploy.yml"
    ],
    "context": "acme-corp/api-gateway",
    "mode": "issue"
  }
}
```

### Sample Response

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-abc-123",
  "analysis": {
    "mode": "issue",
    "filesAnalyzed": 3,
    "files": [
      {
        "path": "src/auth/jwt.ts",
        "type": "source",
        "hash": "a3f8b9..."
      },
      {
        "path": "src/middleware/authentication.ts",
        "type": "source",
        "hash": "d7e2c1..."
      },
      {
        "path": ".github/workflows/deploy.yml",
        "type": "workflow",
        "hash": "f4b8d3..."
      }
    ],
    "findings": [
      {
        "ruleId": "MD-003",
        "severity": "medium",
        "message": "Hardcoded secret detected in source code",
        "context": {
          "file": "src/auth/jwt.ts",
          "line": 15,
          "snippet": "const SECRET = 'hardcoded-value';"
        }
      }
    ],
    "summary": "Analysis complete. Found 1 medium-severity issue.",
    "decision": {
      "outcome": "warn",
      "reasons": ["Hardcoded secret should be externalized"],
      "metadata": {
        "timestamp": "2026-02-01T08:00:00.000Z",
        "mode": "pull_request",
        "rulesEvaluated": ["MD-001", "MD-002", "MD-003"]
      }
    },
    "report": {
      "rulesChecked": 15,
      "violationsFound": 1,
      "criticalIssues": 0
    },
    "degradedMode": false,
    "adrReferences": ["ADR-004"]
  }
}
```

### Copilot Action

Reviews findings and suggests:
- Use environment variables for JWT secrets
- Reference ADR-004 for secret management constraints
- Update code before implementation

---

## Example 2: PR Validation

**Scenario**: Copilot agent assigned to PR, needs to validate changes meet governance.

**Copilot Prompt**: "Validate PR changes for governance compliance"

### Tool Call

```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      ".github/workflows/new-deploy.yml"
    ],
    "context": "acme-corp/api-gateway",
    "mode": "pull_request"
  }
}
```

### Sample Response (Block Decision)

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-def-456",
  "analysis": {
    "mode": "pull_request",
    "filesAnalyzed": 1,
    "files": [
      {
        "path": ".github/workflows/new-deploy.yml",
        "type": "workflow",
        "hash": "b8c9f2..."
      }
    ],
    "findings": [
      {
        "ruleId": "MD-001",
        "severity": "critical",
        "message": "Excessive GitHub Actions permissions detected",
        "context": {
          "file": ".github/workflows/new-deploy.yml",
          "line": 8,
          "snippet": "permissions: write-all"
        }
      }
    ],
    "summary": "Analysis complete. Found 1 critical issue.",
    "decision": {
      "outcome": "block",
      "reasons": [
        "Critical: Excessive permissions violate principle of least privilege"
      ],
      "metadata": {
        "timestamp": "2026-02-01T08:00:00.000Z",
        "mode": "pull_request",
        "rulesEvaluated": ["MD-001", "MD-002", "MD-003"]
      }
    },
    "report": {
      "rulesChecked": 15,
      "violationsFound": 1,
      "criticalIssues": 1
    },
    "degradedMode": false,
    "adrReferences": ["ADR-001", "ADR-003"]
  }
}
```

### Copilot Action

1. Identifies critical issue
2. Reviews ADR-001 and ADR-003
3. Fixes permissions to minimal required:
   ```yaml
   permissions:
     id-token: write
     contents: read
   ```
4. Requests re-review

---

## Example 3: Multiple File Analysis

**Scenario**: Analyze a comprehensive set of files for a new feature

**Copilot Prompt**: "Analyze all infrastructure changes for governance compliance"

### Tool Call

```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      ".github/workflows/ci.yml",
      ".github/workflows/deploy.yml",
      "infra/terraform/main.tf",
      "infra/terraform/variables.tf",
      "package.json",
      "tsconfig.json"
    ],
    "context": "enterprise-corp/platform",
    "mode": "pull_request"
  }
}
```

### Sample Response

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-ghi-789",
  "analysis": {
    "mode": "pull_request",
    "filesAnalyzed": 6,
    "files": [
      {
        "path": ".github/workflows/ci.yml",
        "type": "workflow",
        "hash": "a1b2c3..."
      },
      {
        "path": ".github/workflows/deploy.yml",
        "type": "workflow",
        "hash": "d4e5f6..."
      },
      {
        "path": "infra/terraform/main.tf",
        "type": "source",
        "hash": "g7h8i9..."
      },
      {
        "path": "infra/terraform/variables.tf",
        "type": "source",
        "hash": "j0k1l2..."
      },
      {
        "path": "package.json",
        "type": "config",
        "hash": "m3n4o5..."
      },
      {
        "path": "tsconfig.json",
        "type": "config",
        "hash": "p6q7r8..."
      }
    ],
    "findings": [],
    "summary": "Analysis complete. No violations found.",
    "decision": {
      "outcome": "allow",
      "reasons": ["All governance checks passed"],
      "metadata": {
        "timestamp": "2026-02-01T08:00:00.000Z",
        "mode": "pull_request",
        "rulesEvaluated": ["MD-001", "MD-002", "MD-003", "MD-004", "MD-005"]
      }
    },
    "report": {
      "rulesChecked": 15,
      "violationsFound": 0,
      "criticalIssues": 0
    },
    "degradedMode": false,
    "adrReferences": []
  }
}
```

---

## Example 4: Drift Detection

**Scenario**: Scheduled job checks for drift from established baseline

**Copilot Prompt**: "Check for configuration drift from approved baseline"

### Tool Call

```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      ".github/workflows/ci.yml",
      "package.json",
      "tsconfig.json"
    ],
    "context": "acme-corp/api-gateway",
    "mode": "drift"
  }
}
```

### Sample Response

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-jkl-012",
  "analysis": {
    "mode": "drift",
    "filesAnalyzed": 3,
    "files": [
      {
        "path": ".github/workflows/ci.yml",
        "type": "workflow",
        "hash": "a1b2c3..."
      },
      {
        "path": "package.json",
        "type": "config",
        "hash": "d4e5f6..."
      },
      {
        "path": "tsconfig.json",
        "type": "config",
        "hash": "g7h8i9..."
      }
    ],
    "findings": [],
    "summary": "Analysis complete. No drift detected.",
    "decision": {
      "outcome": "allow",
      "reasons": ["Configuration matches approved baseline"],
      "metadata": {
        "timestamp": "2026-02-01T08:00:00.000Z",
        "mode": "drift",
        "rulesEvaluated": ["MD-001", "MD-002"]
      }
    },
    "report": {
      "rulesChecked": 15,
      "violationsFound": 0,
      "criticalIssues": 0
    },
    "degradedMode": false,
    "adrReferences": []
  }
}
```

---

## Example 5: Error Handling

**Scenario**: Handling missing or inaccessible files

### Tool Call

```json
{
  "name": "analyze_dissonance",
  "arguments": {
    "files": [
      "/nonexistent/file.ts",
      "src/valid-file.ts"
    ],
    "context": "test-org/test-repo",
    "mode": "issue"
  }
}
```

### Sample Response

```json
{
  "success": true,
  "timestamp": "2026-02-01T08:00:00.000Z",
  "requestId": "req-mno-345",
  "analysis": {
    "mode": "issue",
    "filesAnalyzed": 1,
    "files": [
      {
        "path": "src/valid-file.ts",
        "type": "source",
        "hash": "a1b2c3..."
      }
    ],
    "findings": [],
    "summary": "Analysis complete. 1 file skipped (not found).",
    "decision": {
      "outcome": "allow",
      "reasons": ["Analysis successful on available files"],
      "metadata": {
        "timestamp": "2026-02-01T08:00:00.000Z",
        "mode": "pull_request",
        "rulesEvaluated": ["MD-001"]
      }
    },
    "report": {
      "rulesChecked": 15,
      "violationsFound": 0,
      "criticalIssues": 0
    },
    "degradedMode": false,
    "adrReferences": []
  }
}
```

**Note**: Missing files are logged with a warning but don't cause the analysis to fail. The tool gracefully continues with available files.

---

## Integration with GitHub Copilot

### Configuration

Add to your repository settings → Copilot → MCP Configuration:

```json
{
  "mcpServers": {
    "phase-mirror": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@phase-mirror/mcp-server"],
      "env": {
        "AWS_REGION": "COPILOT_MCP_AWS_REGION"
      }
    }
  }
}
```

### Usage in Issues

1. Create an issue describing the feature to implement
2. Assign to @copilot
3. Add instructions: "Before implementing, check governance compliance using analyze_dissonance"
4. Copilot will automatically call the tool and adapt its code generation

### Usage in Pull Requests

1. Create a PR with code changes
2. Copilot can automatically validate changes
3. Results appear in PR comments with suggestions

---

## Best Practices

### When to Use Each Mode

| Mode | Use Case | Recommended For |
|------|----------|-----------------|
| `issue` | Planning/design phase | Initial governance checks before coding |
| `pull_request` | Code review | Validating actual code changes |
| `merge_group` | Final validation | Last check before merge to main |
| `drift` | Monitoring | Scheduled checks for unauthorized changes |

### File Selection Tips

1. **Be Specific**: Include only relevant files for faster analysis
2. **Include Context**: Add related config files for comprehensive checks
3. **Workflows First**: Always include GitHub Actions workflows for permission checks
4. **Infrastructure Files**: Include Terraform, Kubernetes manifests for IaC governance

### Performance Optimization

- Limit to 5-10 files per analysis for best performance
- For large repositories, run multiple targeted analyses
- Use `issue` mode for exploration, `pull_request` for validation

---

## Troubleshooting

### Tool Not Available

**Issue**: Copilot reports tool not found

**Solution**: 
- Verify MCP server is configured in repository settings
- Check that `@phase-mirror/mcp-server` is published and accessible
- Review environment variable configuration

### Slow Response

**Issue**: Analysis takes longer than expected

**Solution**:
- Reduce number of files in analysis
- Check network connectivity (if using remote stores)
- Review system resources

### Unexpected Results

**Issue**: Findings don't match expectations

**Solution**:
- Review the specific rule IDs returned
- Check ADR references for governance context
- Verify file paths are correct and files exist

---

## Additional Resources

- [Tool Documentation](../README.md)
- [Test Scenarios](../test/scenarios/README.md)
- [CLI Analysis Flow](../docs/cli-analysis-flow.md)
- [L0 Invariants Reference](../docs/l0-invariants-reference.md)

---

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/PhaseMirror/Phase-Mirror/issues
- Documentation: https://github.com/PhaseMirror/Phase-Mirror/tree/main/docs
