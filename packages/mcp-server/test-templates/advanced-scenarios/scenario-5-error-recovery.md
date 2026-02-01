# Test: Handle Invalid Tool Input

**Goal**: Verify graceful error handling when tool encounters errors.

---

## Test Description

@copilot Try to analyze a nonexistent file: `/this/does/not/exist.ts`

**Expected behavior:**
1. Tool returns `EXECUTION_FAILED` error
2. You gracefully handle the error
3. You suggest checking the file path

**Do not retry infinitely. Acknowledge the error and move on.**

---

## Expected Tool Call

### analyze_dissonance (with invalid file)
```json
{
  "files": ["/this/does/not/exist.ts"],
  "repository": {
    "owner": "PhaseMirror",
    "name": "Phase-Mirror"
  },
  "mode": "issue"
}
```

---

## Expected Tool Response (Error)

```json
{
  "success": false,
  "error": {
    "code": "EXECUTION_FAILED",
    "message": "Failed to analyze files",
    "details": "File not found: /this/does/not/exist.ts"
  }
}
```

---

## Success Criteria

- ✅ Tool returns error (not crash)
- ✅ Error code is `EXECUTION_FAILED`
- ✅ Copilot acknowledges the error
- ✅ Copilot does NOT retry indefinitely
- ✅ Copilot suggests checking file path
- ✅ Copilot provides helpful guidance
- ✅ Session does not hang or timeout

---

## Expected Copilot Behavior

**Good Response:**
> I attempted to analyze `/this/does/not/exist.ts` but the file was not found. 
> 
> Error: `EXECUTION_FAILED - File not found: /this/does/not/exist.ts`
> 
> Please verify:
> 1. The file path is correct
> 2. The file exists in the repository
> 3. The path is relative to the repository root
> 
> Would you like me to analyze a different file?

**Bad Response:**
- Retrying multiple times without learning
- Crashing or hanging
- Not explaining the error
- Suggesting unrelated fixes

---

## Test Variations

### Variation 1: Empty files array
```json
{
  "files": [],
  "repository": {
    "owner": "PhaseMirror",
    "name": "Phase-Mirror"
  },
  "mode": "issue"
}
```

**Expected:** `INVALID_INPUT` error

### Variation 2: Invalid mode
```json
{
  "files": ["README.md"],
  "repository": {
    "owner": "PhaseMirror",
    "name": "Phase-Mirror"
  },
  "mode": "invalid_mode"
}
```

**Expected:** Schema validation error

---

## How to Create This Issue

```bash
gh issue create \
  --title "Test: Handle Invalid Tool Input" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-5-error-recovery.md \
  --label "copilot-test,mcp-integration,error-handling" \
  --assignee "@copilot"
```
