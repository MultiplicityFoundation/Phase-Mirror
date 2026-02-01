# Test Scenarios for analyze_dissonance

This document describes real-world test scenarios for the `analyze_dissonance` MCP tool.

## Scenario 1: GitHub Actions Permission Escalation

**Description**: Detect excessive permissions in GitHub Actions workflows

**Input**:
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: write-all  # VIOLATION: Excessive permissions
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy
```

**Expected Findings**:
- **Rule**: Permission escalation or excessive permissions
- **Severity**: high or critical
- **Evidence**: `permissions: write-all` detected in workflow
- **ADR Reference**: ADR-003 (Principle of least privilege)

**Recommendation**: Use minimal permissions like `contents: read` and `id-token: write`

---

## Scenario 2: Unpinned Dependency

**Description**: Detect unpinned actions that use branch references

**Input**:
```yaml
# .github/workflows/ci.yml
name: CI
on: pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4  # OK: Pinned major version
      - uses: some/action@main     # VIOLATION: Unpinned branch
      - run: npm test
```

**Expected Findings**:
- **Rule**: Unpinned dependency
- **Severity**: medium
- **Evidence**: `@main` branch reference
- **Remediation**: Pin to specific SHA or tag (e.g., `@v1.2.3` or `@abc123...`)

---

## Scenario 3: Clean Analysis (No Violations)

**Description**: Properly configured workflow with no governance violations

**Input**:
```yaml
# .github/workflows/test.yml
name: Test
on: pull_request
jobs:
  test:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - run: npm test
```

**Expected Result**:
- **Findings**: 0 violations
- **Decision**: allow or pass
- **Recommendations**: "Proceed with implementation"

---

## Scenario 4: Multiple File Types

**Description**: Analyze a mix of workflow, config, and source files

**Input Files**:
1. `.github/workflows/ci.yml` - GitHub Actions workflow
2. `package.json` - Configuration file
3. `src/index.ts` - Source code file

**Expected Behavior**:
- All 3 files processed
- Files categorized correctly (workflow/config/source)
- SHA-256 hash generated for each file
- Analysis runs against all files

---

## Scenario 5: Degraded Mode (Circuit Breaker)

**Description**: System enters degraded mode when too many blocks occur

**Setup**: 
- Trigger multiple block decisions in quick succession
- Circuit breaker threshold typically 10-100 blocks per hour

**Expected Result**:
- **Decision**: warn (downgraded from block)
- **Degraded Mode**: true
- **Reason**: `circuit_breaker_triggered`
- **Recommendation**: "Review recent false positives and consider rule tuning"

---

## Scenario 6: Missing Files Handling

**Description**: Graceful handling of non-existent files

**Input**:
```json
{
  "files": ["/nonexistent/file.ts", "/another/missing.js"],
  "repository": { "owner": "test", "name": "repo" },
  "mode": "issue"
}
```

**Expected Behavior**:
- Files that don't exist are skipped with warning
- Analysis continues with available files
- `filesAnalyzed` count reflects only successfully read files
- No error thrown (graceful degradation)

---

## Scenario 7: Different Analysis Modes

**Description**: Tool behavior varies by mode

### Issue Mode
- **Use Case**: Planning phase, developer assigned to issue
- **Behavior**: Comprehensive analysis, all rules enabled
- **Output**: Detailed findings with recommendations

### Pull Request Mode
- **Use Case**: PR validation before merge
- **Behavior**: Strict mode, focuses on changes
- **Output**: Block/warn/allow decision

### Merge Group Mode
- **Use Case**: Final check in merge queue
- **Behavior**: Ultra-strict, no degraded mode
- **Output**: Binary block/allow

### Drift Mode
- **Use Case**: Baseline comparison
- **Behavior**: Compares against known good state
- **Output**: Drift magnitude and violations

---

## Scenario 8: Repository Path Formats

**Description**: Handle various repository path formats

**Valid Inputs**:
- `"owner/repo"` - Standard format
- `"org/team/repo"` - Nested organization path
- `"test-repo"` - Just repo name (uses "unknown" as owner)

**Expected Behavior**:
- All formats parsed correctly
- Nested paths handled (takes first part as owner, rest as repo name)
- Analysis succeeds regardless of format

---

## Scenario 9: File Type Detection

**Description**: Correctly categorize different file types

| File Path | Expected Type |
|-----------|---------------|
| `.github/workflows/ci.yml` | `workflow` |
| `package.json` | `config` |
| `tsconfig.json` | `config` |
| `Dockerfile` | `config` |
| `src/index.ts` | `source` |
| `lib/utils.js` | `source` |
| `README.md` | `source` |

---

## Scenario 10: Hash Consistency

**Description**: SHA-256 hashes are consistent and deterministic

**Test**:
1. Analyze the same file twice
2. Compare generated hashes

**Expected**:
- Hashes are identical between runs
- Different files produce different hashes
- Hash format: 64 hexadecimal characters

---

## Running Test Scenarios

### Unit Tests
```bash
cd packages/mcp-server
pnpm test
```

### Integration Tests
```bash
pnpm test analyze-dissonance.integration.test.ts
```

### Manual Testing with MCP Inspector
```bash
pnpm build
npx @modelcontextprotocol/inspector node dist/src/index.js
```

Then use the web UI to send tool requests with the scenarios above.

---

## Expected Performance

- **Latency**: < 2s for typical analysis (5-10 files)
- **Timeout**: 30s maximum for integration tests
- **Memory**: < 100MB for normal workloads
- **Throughput**: No inherent rate limits (local execution)

---

## Error Codes Reference

| Code | Scenario | Description |
|------|----------|-------------|
| `INVALID_INPUT` | Schema validation fails | Check input parameters against schema |
| `EXECUTION_FAILED` | Analysis throws error | Check logs, verify files exist and are readable |
| `CONSENT_REQUIRED` | FP patterns without consent | Organization consent needed (enterprise feature) |

---

## Future Test Scenarios

As Phase Mirror evolves, additional scenarios to consider:

1. **ADR Extraction**: Test with actual ADR files in repository
2. **False Positive Patterns**: Test with FP store integration (requires DynamoDB)
3. **Consent Management**: Test consent checking for enterprise features
4. **Baseline Drift**: Test drift detection with actual baseline files
5. **Multi-Repository**: Test cross-repository analysis
