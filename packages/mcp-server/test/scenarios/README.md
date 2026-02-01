# Test Scenarios for analyze_dissonance

## Scenario 1: GitHub Actions Permission Escalation

**Input**:
```yaml
# .github/workflows/deploy.yml
name: Deploy
on: push
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions: write-all  # VIOLATION: Excessive permissions
```

**Expected Findings**:
- Rule: MD-001 (GitHub Actions permission escalation)
- Severity: high
- Evidence: `permissions: write-all` on line X
- ADR Reference: ADR-003 (Principle of least privilege)

## Scenario 2: Unpinned Dependency

**Input**:
```text
# .github/workflows/ci.yml
steps:
  - uses: actions/checkout@v4  # OK: Pinned major version
  - uses: some/action@main     # VIOLATION: Unpinned branch
```

**Expected Findings**:
- Rule: MD-002 (Unpinned dependency)
- Severity: medium
- Evidence: `@main` reference
- Remediation: Pin to specific SHA or tag

## Scenario 3: Clean Analysis

**Input**:
```text
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
- No findings
- Decision: pass
- Recommendations: "Proceed with implementation"
