# Mirror Dissonance Protocol - Examples

This document provides usage examples for the Mirror Dissonance Protocol Oracle.

## Basic Usage Examples

### 1. Pull Request Analysis

Analyze a pull request in standard mode:

```bash
pnpm oracle:run run \
  --mode pull_request \
  --branch feature/new-agent \
  --author developer \
  --commit abc123def
```

**Expected Output:**
- Evaluates all 5 rules (MD-001 through MD-005)
- Applies standard thresholds
- Allows minor violations
- Blocks on critical issues

### 2. Merge Queue (Strict Mode)

Validate changes in strict mode before merging:

```bash
pnpm oracle:run run \
  --mode merge_group \
  --strict \
  --branch main \
  --commit final123
```

**Expected Output:**
- Zero-tolerance for critical violations
- Maximum 0 high severity violations
- Fail-closed behavior
- Full audit trail required

### 3. Dry Run Mode

Test without blocking:

```bash
pnpm oracle:run run \
  --mode pull_request \
  --branch experimental \
  --dry-run
```

**Expected Output:**
- All violations detected and reported
- Never blocks (always warns)
- Useful for calibration and testing

### 4. Drift Detection

Compare against baseline:

```bash
pnpm oracle:run run \
  --mode drift \
  --baseline baseline.json \
  --output drift-report.json
```

**Expected Output:**
- Compares current state to baseline
- Identifies deviations
- Reports significant changes
- Saves detailed report

## Scenario-Based Examples

### Scenario 1: Autonomous Agent Development

Branch contains autonomous AI agent code:

```bash
pnpm oracle:run run \
  --mode pull_request \
  --branch agent-auto-decision \
  --author ai-team
```

**Violations Detected:**
- MD-002: Autonomy vs compliance tension
- Requires human-in-the-loop review

### Scenario 2: ML Model Integration

Branch includes machine learning model:

```bash
pnpm oracle:run run \
  --mode pull_request \
  --branch ml-model-feature
```

**Violations Detected:**
- MD-003: Probabilistic output management
- Requires confidence thresholds
- Needs fallback mechanisms

### Scenario 3: Strict Compliance Check

Pre-merge validation with full audit:

```bash
pnpm oracle:run run \
  --mode merge_group \
  --strict \
  --author compliance-team \
  --commit verified123
```

**Violations Detected:**
- MD-004: Checks for complete audit trail
- Validates accountability chain
- Ensures liability documentation

## Output Examples

### Allow Decision

```
============================================================
MIRROR DISSONANCE PROTOCOL - ORACLE ANALYSIS
============================================================

Decision: ALLOW
Timestamp: 2026-01-28T01:00:00.000Z
Mode: pull_request

Reasons:
  - No violations detected

No violations detected.

============================================================

✅ Oracle decision: ALLOW
```

### Block Decision

```
============================================================
MIRROR DISSONANCE PROTOCOL - ORACLE ANALYSIS
============================================================

Decision: BLOCK
Timestamp: 2026-01-28T01:00:00.000Z
Mode: merge_group

Reasons:
  - Critical violations: 0, High: 1, Medium: 0

Violations:
  [HIGH] MD-003: Probabilistic outputs detected - ensure confidence thresholds and fallback mechanisms are in place

============================================================

❌ Oracle decision: BLOCK
```

### Warn Decision

```
============================================================
MIRROR DISSONANCE PROTOCOL - ORACLE ANALYSIS
============================================================

Decision: WARN
Timestamp: 2026-01-28T01:00:00.000Z
Mode: pull_request

Reasons:
  - Circuit breaker tripped - too many blocks in current hour
  - Minor violations within thresholds: Low: 2

Violations:
  [LOW] MD-005: Drift detection enabled - baseline comparison in progress

============================================================

⚠️  Oracle decision: WARN
```

## JSON Output Example

Use `--output` flag to save detailed report:

```bash
pnpm oracle:run run --mode pull_request --output report.json
```

```json
{
  "machineDecision": {
    "outcome": "allow",
    "reasons": [
      "No violations detected"
    ],
    "metadata": {
      "timestamp": "2026-01-28T01:00:00.000Z",
      "mode": "pull_request",
      "rulesEvaluated": []
    }
  },
  "violations": [],
  "summary": "...",
  "report": {
    "rulesChecked": 5,
    "violationsFound": 0,
    "criticalIssues": 0
  }
}
```

## GitHub Actions Integration

Example workflow usage:

```yaml
- name: Run Oracle Analysis
  run: |
    pnpm oracle:run run \
      --mode pull_request \
      --repo ${{ github.repository }} \
      --pr ${{ github.event.pull_request.number }} \
      --commit ${{ github.sha }} \
      --branch ${{ github.head_ref }} \
      --author ${{ github.actor }} \
      --output oracle-report.json
```

## Calibration Example

Establish baseline for your repository:

```bash
# Run calibration
pnpm oracle:run run --mode calibration --output baseline.json

# Review baseline
cat baseline.json

# Use baseline for drift detection
pnpm oracle:run run --mode drift --baseline baseline.json
```

## Advanced Usage

### Custom Threshold Testing

Test how changes would behave under different thresholds:

```bash
# Standard mode
pnpm oracle:run run --mode pull_request --branch test-branch

# Strict mode
pnpm oracle:run run --mode pull_request --branch test-branch --strict

# Dry run (see what would happen)
pnpm oracle:run run --mode pull_request --branch test-branch --strict --dry-run
```

### Continuous Monitoring

Schedule drift detection:

```bash
# Daily drift check
0 2 * * * cd /path/to/repo && pnpm oracle:run run --mode drift --baseline baseline.json --output /reports/drift-$(date +\%Y\%m\%d).json
```

## Rule-Specific Examples

### MD-001: Branch Protection

Triggers when branch protection is misconfigured.

### MD-002: Autonomy vs Compliance

Detects when branch names suggest autonomous operations:
- `agent-*`
- `auto-*`
- `autonomous-*`

### MD-003: Probabilistic Outputs

Detects when branch names indicate ML/AI work:
- `ml-*`
- `ai-*`
- `model-*`

### MD-004: Liability Framework

Requires complete metadata in strict mode:
- Author
- Commit SHA
- Context information

### MD-005: Drift Detection

Activates in drift mode with baseline file.

## Tips and Best Practices

1. **Start with dry-run**: Test oracle behavior before enforcing
2. **Establish baseline**: Create baseline.json for your repo
3. **Review violations**: Not all violations need immediate action
4. **Use strict mode for main**: Apply strict thresholds to main branch
5. **Monitor trends**: Track violation patterns over time
6. **Document overrides**: Record reasons for manual overrides
7. **Update rules**: Rules evolve with your practices
8. **Circuit breaker**: Watch for circuit breaker trips
9. **False positives**: Record and track false positives
10. **Regular calibration**: Re-calibrate quarterly
