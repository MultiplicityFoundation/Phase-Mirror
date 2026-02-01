# MCP Inspector Test Results
**Date**: 2026-02-01  
**Tester**: [Your Name]  
**Server Version**: 0.1.0

---

## Test Execution Summary

| Tool | Total Tests | Passed | Failed | Pass Rate |
|------|-------------|--------|--------|-----------|
| `analyze_dissonance` | 5 | 0 | 0 | 0% |
| `validate_l0_invariants` | 8 | 0 | 0 | 0% |
| **Total** | **13** | **0** | **0** | **0%** |

---

## `analyze_dissonance` Test Results

### Test 1: Basic Analysis
- **Status**: ⏳ Not Started
- **Input**: Single file (README.md)
- **Expected**: `success: true`, `filesAnalyzed: 1`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 2: Workflow Analysis
- **Status**: ⏳ Not Started
- **Input**: CI workflow file
- **Expected**: `success: true`, `mode: pull_request`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 3: Multiple Files
- **Status**: ⏳ Not Started
- **Input**: 2 files (TypeScript + package.json)
- **Expected**: `filesAnalyzed: 2`, ADRs included
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 4: Invalid Input
- **Status**: ⏳ Not Started
- **Input**: Empty files array
- **Expected**: `success: false`, `code: INVALID_INPUT`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 5: Missing File
- **Status**: ⏳ Not Started
- **Input**: Nonexistent file path
- **Expected**: `success: false`, `code: EXECUTION_FAILED`
- **Actual**: 
- **Duration**: 
- **Notes**: 

---

## `validate_l0_invariants` Test Results

### Test 1: Permission Check
- **Status**: ⏳ Not Started
- **Input**: CI workflow file
- **Expected**: L0-002 check runs
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 2: Nonce Freshness (Valid)
- **Status**: ⏳ Not Started
- **Input**: Fresh nonce (current timestamp)
- **Expected**: `allPassed: true`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 3: Nonce Freshness (Expired)
- **Status**: ⏳ Not Started
- **Input**: Old nonce (24h ago)
- **Expected**: `allPassed: false`, L0-004 failure
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 4: Drift Within Threshold
- **Status**: ⏳ Not Started
- **Input**: 5% drift, 10% threshold
- **Expected**: `allPassed: true`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 5: Drift Exceeds Threshold
- **Status**: ⏳ Not Started
- **Input**: 50% drift, 30% threshold
- **Expected**: `allPassed: false`, L0-003 failure
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 6: Contraction Legitimate
- **Status**: ⏳ Not Started
- **Input**: FPR 0.08→0.03, 20 events
- **Expected**: `allPassed: true`
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 7: Contraction Illegitimate
- **Status**: ⏳ Not Started
- **Input**: FPR 0.08→0.03, 3 events
- **Expected**: `allPassed: false`, L0-005 failure
- **Actual**: 
- **Duration**: 
- **Notes**: 

### Test 8: Multi-Check
- **Status**: ⏳ Not Started
- **Input**: Permissions + nonce + drift
- **Expected**: 3 checks run
- **Actual**: 
- **Duration**: 
- **Notes**: 

---

## Issues Discovered

| ID | Tool | Issue Description | Severity | Status |
|----|------|------------------|----------|--------|
| | | | | |

---

## Performance Observations

| Tool | Metric | Target | Actual | Status |
|------|--------|--------|--------|--------|
| `validate_l0_invariants` | Latency (ns) | <100 | | |
| `analyze_dissonance` | Latency (ms) | <2000 | | |

---

## Recommendations

- [ ] All tests passed → Proceed to GitHub Copilot integration (Day 7)
- [ ] Minor issues found → Document and fix before Day 7
- [ ] Critical issues found → Pause, debug, retest

**Sign-off**: ________________  
**Date**: 2026-02-01
