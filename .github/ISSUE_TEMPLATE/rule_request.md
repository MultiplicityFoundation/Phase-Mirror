---
name: Rule Request
about: Propose a new detection rule for the Phase Mirror protocol
title: '[RULE] '
labels: rule-proposal, needs-discussion
assignees: ''
---

## Rule Name
<!-- e.g., "JWT Expiry Drift Detection" -->

## Category
<!-- Choose: Temporal Consistency, Schema Validation, Permission Coherence, Cryptographic Binding, Other -->

## Problem Statement
<!-- What inconsistency or vulnerability does this rule detect? Why is it important? -->

## Detection Logic
<!-- Describe the algorithm or check. Be specific. -->

**Pseudocode (optional):**
```

if (condition1 && condition2) {
  return MATCH;
}

```

## Test Cases

### True Positives (Should Match)
<!-- Examples of inputs that SHOULD trigger the rule -->
1. **Input:** ...
   **Output:** MATCH
   **Reason:** ...

2. **Input:** ...
   **Output:** MATCH
   **Reason:** ...

### True Negatives (Should NOT Match)
<!-- Examples of inputs that should NOT trigger the rule -->
1. **Input:** ...
   **Output:** NO MATCH
   **Reason:** ...

2. **Input:** ...
   **Output:** NO MATCH
   **Reason:** ...

### Potential False Positives
<!-- Are there edge cases where the rule might incorrectly match? -->
1. **Scenario:** ...
   **Mitigation:** ...

## Performance Impact
<!-- Which tier: L0 (always-on, <100ns), L1 (triggered, <1ms), L2 (explicit, <100ms)? -->
- **Compute tier:** L0 / L1 / L2
- **Estimated latency:** <!-- e.g., <1ms -->
- **External dependencies:** <!-- e.g., requires database lookup? -->

## Supporters
<!-- List at least 3 people/organizations who would benefit from this rule -->
1. @username1 (Org Name)
2. @username2 (Org Name)
3. @username3 (Org Name)

## Related Work
<!-- Are there similar rules in other systems? Research papers? -->

## Implementation Notes
<!-- Any technical considerations for implementation? -->

## Checklist
- [ ] I have described the problem clearly
- [ ] I have provided test cases (true positives and negatives)
- [ ] I have identified the compute tier (L0/L1/L2)
- [ ] I have listed ≥3 supporters
- [ ] I have checked that this doesn't duplicate an existing rule
