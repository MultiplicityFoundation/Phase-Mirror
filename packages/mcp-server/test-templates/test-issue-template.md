# Test Issue: Phase Mirror MCP Integration

**Goal**: Validate that GitHub Copilot coding agent can use Phase Mirror MCP tools.

## Test Scenario 1: Analyze Dissonance

**Task**: Check if `.github/workflows/deploy-staging.yml` violates any governance rules.

**Expected Copilot Behavior**:
1. Reads issue assignment
2. Calls `analyze_dissonance` tool with:
   - files: [".github/workflows/deploy-staging.yml"]
   - repository: { owner: "PhaseMirror", name: "Phase-Mirror" }
   - mode: "issue"
3. Reviews findings
4. Comments with analysis summary
5. Suggests fixes if violations found

**Success Criteria**:
- Copilot calls MCP tool (visible in logs)
- Tool returns results without errors
- Copilot incorporates findings into response

---

## Test Scenario 2: Validate L0 Invariants

**Task**: Validate that proposed workflow changes pass L0 permission checks.

**Expected Copilot Behavior**:
1. Calls `validate_l0_invariants` tool with:
   - workflowFiles: [".github/workflows/deploy-staging.yml"]
2. Reviews L0-002 (permission bits) result
3. Reports pass/fail status
4. Provides remediation if failed

**Success Criteria**:
- L0 checks execute successfully
- Copilot correctly interprets pass/fail
- Recommendations align with Phase Mirror governance

---

## Instructions for @copilot

When assigned this issue:

1. Use the `analyze_dissonance` tool to check `.github/workflows/deploy-staging.yml` for governance violations
2. Use the `validate_l0_invariants` tool to check L0 permission requirements
3. Summarize findings in a comment
4. If violations found, suggest specific fixes
5. Reference relevant ADRs if mentioned in tool responses

## Labels
- `copilot-test`
- `mcp-integration`

---

## How to Create This Issue

```bash
# Using GitHub CLI
gh issue create \
  --title "Test: Phase Mirror MCP Integration" \
  --body-file packages/mcp-server/test-templates/test-issue-template.md \
  --label "copilot-test,mcp-integration" \
  --assignee "@copilot"

# Or use the GitHub web interface:
# 1. Go to Issues → New Issue
# 2. Copy this template as the body
# 3. Add labels: copilot-test, mcp-integration
# 4. Assign to @copilot
```
