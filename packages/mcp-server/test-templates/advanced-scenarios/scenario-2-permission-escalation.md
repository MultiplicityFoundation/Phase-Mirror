# Test: Detect GitHub Actions Permission Escalation

**Goal**: Verify that Phase Mirror MCP tools can detect excessive GitHub Actions permissions.

---

## Test Description

@copilot Please analyze `.github/workflows/deploy-production.yml` and check:

1. Are permissions following least privilege principle?
2. Do any jobs have `write-all` or excessive permissions?
3. Validate with L0-002 invariant check

If violations found, suggest specific permission scopes needed.

---

## Expected Tool Calls

### 1. analyze_dissonance
```json
{
  "files": [".github/workflows/deploy-production.yml"],
  "repository": {
    "owner": "PhaseMirror",
    "name": "Phase-Mirror"
  },
  "mode": "issue",
  "context": "Checking for permission escalation in production deployment workflow"
}
```

### 2. validate_l0_invariants
```json
{
  "workflowFiles": [".github/workflows/deploy-production.yml"]
}
```

---

## Success Criteria

- ✅ Copilot identifies workflows with excessive permissions
- ✅ L0-002 validation flags permission violations
- ✅ Copilot suggests specific permission scopes (e.g., `contents: read`, `deployments: write`)
- ✅ Recommendations follow principle of least privilege
- ✅ Response time < 5 seconds

---

## Expected Findings

**If workflow has excessive permissions:**
- Findings should include severity level (High/Critical)
- Specific jobs with permission issues identified
- Recommended permission scopes provided
- L0-002 check should fail

**If workflow follows best practices:**
- L0-002 check should pass
- Copilot confirms compliance
- No remediation needed

---

## How to Create This Issue

```bash
gh issue create \
  --title "Test: Detect GitHub Actions Permission Escalation" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-2-permission-escalation.md \
  --label "copilot-test,mcp-integration,security" \
  --assignee "@copilot"
```
