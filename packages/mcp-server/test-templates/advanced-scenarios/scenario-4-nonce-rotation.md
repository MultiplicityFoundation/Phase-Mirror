# Test: Validate Nonce Rotation

**Goal**: Verify that L0-004 (Nonce Freshness) validation works correctly.

---

## Test Description

@copilot We rotated the production nonce 30 minutes ago. Please validate:

1. New nonce freshness (use `validate_l0_invariants` with `nonceValidation`)
   - Nonce: `prod-nonce-v3-20260201`
   - Timestamp: `2026-02-01T06:00:00Z`
   - Max age: 3600 seconds

2. Confirm nonce is fresh and within policy limits

**Expected result**: L0-004 passes

---

## Expected Tool Call

### validate_l0_invariants
```json
{
  "nonceValidation": {
    "nonce": "prod-nonce-v3-20260201",
    "timestamp": "2026-02-01T06:00:00Z",
    "maxAgeSeconds": 3600
  }
}
```

---

## Success Criteria

- ✅ Copilot calls `validate_l0_invariants` with correct parameters
- ✅ L0-004 validation executes successfully
- ✅ Result shows nonce is fresh (age < 3600 seconds)
- ✅ Copilot confirms nonce passes freshness check
- ✅ Response time < 0.5 seconds

---

## Expected Results

**If nonce is fresh (timestamp within last hour):**
```json
{
  "success": true,
  "validation": {
    "allPassed": true,
    "results": [
      {
        "invariantId": "L0-004",
        "passed": true,
        "message": "Nonce fresh",
        "evidence": {
          "age": 1800,
          "maxAge": 3600
        }
      }
    ]
  }
}
```

**Copilot should confirm:**
- Nonce is fresh
- Age is within acceptable range
- L0-004 invariant passed
- No action required

---

## Test Variation: Expired Nonce

To test failure case, use an old timestamp:

```json
{
  "nonceValidation": {
    "nonce": "old-nonce-v2",
    "timestamp": "2026-01-31T00:00:00Z",
    "maxAgeSeconds": 3600
  }
}
```

**Expected:**
- L0-004 should fail
- Copilot should report nonce is expired
- Remediation: rotate nonce

---

## How to Create This Issue

```bash
gh issue create \
  --title "Test: Validate Nonce Rotation" \
  --body-file packages/mcp-server/test-templates/advanced-scenarios/scenario-4-nonce-rotation.md \
  --label "copilot-test,mcp-integration,l0-invariants" \
  --assignee "@copilot"
```
