# Test: Comprehensive Governance Check

**Goal**: Test multi-file analysis with contextual understanding.

---

## Test Description

@copilot Analyze these files for governance compliance:

- `packages/cli/src/index.ts`
- `packages/mirror-dissonance/src/oracle.ts`
- `.github/workflows/ci.yml`

**Context**: Planning to add new CLI command that interacts with DynamoDB FP store. Need to ensure:
1. No hardcoded credentials
2. Proper error handling
3. Workflow permissions are minimal
4. ADR-004 (FP anonymization) compliance

Use `analyze_dissonance` with context, then validate critical findings with `validate_l0_invariants`.

---

## Expected Tool Calls

### 1. analyze_dissonance (multi-file)
```json
{
  "files": [
    "packages/cli/src/index.ts",
    "packages/mirror-dissonance/src/oracle.ts",
    ".github/workflows/ci.yml"
  ],
  "repository": {
    "owner": "PhaseMirror",
    "name": "Phase-Mirror"
  },
  "mode": "issue",
  "context": "Planning to add new CLI command that interacts with DynamoDB FP store. Need to ensure: 1) No hardcoded credentials 2) Proper error handling 3) Workflow permissions are minimal 4) ADR-004 (FP anonymization) compliance"
}
```

### 2. validate_l0_invariants (if issues found)
```json
{
  "workflowFiles": [".github/workflows/ci.yml"]
}
```

---

## Success Criteria

- ✅ Copilot analyzes all 3 files
- ✅ Context is incorporated into analysis
- ✅ Findings reference ADR-004 if applicable
- ✅ Credentials check performed
- ✅ Error handling patterns validated
- ✅ Workflow permissions validated
- ✅ Copilot synthesizes findings across multiple files
- ✅ Prioritizes findings by severity

---

## Expected Behavior

**Copilot should:**
1. Acknowledge the context about DynamoDB FP store interaction
2. Check for hardcoded AWS credentials or access keys
3. Verify error handling in CLI and oracle code
4. Validate workflow has minimal permissions
5. Reference ADR-004 for FP anonymization requirements
6. Provide actionable recommendations

**Tool Response:**
- `filesAnalyzed: 3`
- Findings grouped by file
- ADR references if applicable
- Summary with decision (pass/warn/block)

---

## How to Create This Issue

```bash
gh issue create \
  --title "Test: Comprehensive Governance Check" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-3-multi-file-context.md \
  --label "copilot-test,mcp-integration,comprehensive" \
  --assignee "@copilot"
```
