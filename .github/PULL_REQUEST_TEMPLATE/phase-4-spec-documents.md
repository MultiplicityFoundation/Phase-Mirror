# Phase 4: Formalize Three-Plane Architecture Specs

## Summary
This PR creates formal specification documents for the Phase Mirror Dissonance three-plane architecture: SPEC-COMPUTE, SPEC-PMD, and SPEC-TRUST.

## Phase 4 Checklist

Each commit creates one complete specification document.

### Specification Documents (Commits 1-3)
- [ ] **Create SPEC-COMPUTE.md**: Computational plane specification with L0-L3 invariants, formal definitions, performance requirements
- [ ] **Create SPEC-PMD.md**: Phase Mirror Dissonance protocol specification with state machines, API contracts, data formats
- [ ] **Create SPEC-TRUST.md**: Trust plane specification with identity verification, reputation algorithms, Byzantine filtering

## Specification Structure

Each spec follows this format:

### Table of Contents
1. Overview and Purpose
2. Formal Definitions
3. Requirements (MUST/SHOULD/MAY per RFC 2119)
4. State Machines and Flows
5. API Contracts
6. Performance Targets
7. Security Considerations
8. Examples

## SPEC-COMPUTE.md (Commit 1)

### Key Sections
- **L0 Invariants**: Structural integrity rules for PMD files
- **L1 Invariants**: Type safety and semantic consistency
- **L2 Invariants**: Cross-module consistency checks
- **L3 Invariants**: System-wide properties
- **Performance**: Rule evaluation must complete in <100ms
- **Correctness**: Formal proofs of invariant completeness

### Example Content
```markdown
## L0-001: PMD File Structure

**Requirement**: Every PMD file MUST contain a `phaseMirrorDissonance` object
with `computational`, `trust`, and `metadata` fields.

**Formal Definition**:
```typescript
type PMD = {
  phaseMirrorDissonance: {
    computational: ComputationalPlane;
    trust: TrustPlane;
    metadata: Metadata;
  }
}
```

**Rationale**: Ensures minimal structure for oracle evaluation.
```

## SPEC-PMD.md (Commit 2)

### Key Sections
- **Protocol Overview**: What PMD is and why it exists
- **State Machine**: States (pending, evaluated, violated, resolved)
- **Event Types**: pull_request, merge_group, drift
- **API Contracts**: Oracle inputs/outputs, error codes
- **Data Formats**: JSON schema for PMD files
- **Versioning**: Semantic versioning for PMD format

### State Machine Diagram
```
   ┌─────────┐
   │ Pending │
   └────┬────┘
        │
        ▼
   ┌──────────┐     ┌──────────┐
   │ Evaluated│────▶│ Resolved │
   └────┬─────┘     └──────────┘
        │
        ▼
   ┌──────────┐
   │ Violated │
   └──────────┘
```

## SPEC-TRUST.md (Commit 3)

### Key Sections
- **Identity Verification**: GitHub OAuth, Stripe verification
- **Reputation Engine**: How trust scores are calculated
- **Byzantine Filtering**: Detecting and handling adversarial actors
- **Nonce Protocol**: Time-limited verification tokens
- **False Positive Handling**: Proof requirements, validation
- **Calibration**: Adaptive thresholding based on reputation

### Trust Score Formula
```
TrustScore = w₁·GitHubReputation + w₂·StripeVerification + 
             w₃·HistoricalAccuracy - w₄·FalsePositiveRate
```

## Commit Discipline
- [ ] Each commit message written before coding
- [ ] Each commit is bisectable (builds succeed)
- [ ] No scope creep (documentation only, no code changes)
- [ ] All commits follow Conventional Commits format

## Documentation Standards

### RFC 2119 Keywords
- **MUST**: Absolute requirement
- **MUST NOT**: Absolute prohibition
- **SHOULD**: Recommended but not required
- **SHOULD NOT**: Not recommended but not prohibited
- **MAY**: Optional

### Example Usage
```markdown
The oracle MUST reject PMD files without L0-001 structure.
The oracle SHOULD log a warning for deprecated fields.
Clients MAY implement custom rules beyond L0-L3.
```

## Related Documentation
- `docs/architecture.md` - High-level architecture overview
- `docs/BRANCH_STRATEGY.md` - Phase strategy overview
- ADRs in `docs/adr/` - Architecture decision records

## Review Notes
These specifications formalize the Phase Mirror architecture. They serve as:
1. **Reference**: Canonical source of truth for implementation
2. **Testing**: Basis for verification and validation
3. **Communication**: Clear contracts for contributors
4. **Governance**: Standards for protocol evolution

Each commit is a complete, self-contained specification document.

## Breaking Changes
- [ ] None (documentation only)
- [ ] If specs contradict existing behavior, file issues for reconciliation

## Quality Checklist
- [ ] All sections complete and coherent
- [ ] Examples provided for complex concepts
- [ ] Diagrams included where helpful
- [ ] Cross-references to related docs
- [ ] RFC 2119 keywords used consistently

## Future Use
These specs will be used for:
- Generating reference implementations
- Creating conformance tests
- Onboarding new contributors
- Evaluating protocol changes
- Academic research and citations

---
**Phase**: 4 (Specification Documents)  
**Branch**: `docs/spec-documents`  
**Target**: `main`  
**Depends On**: Phase 3 (`test/integration`)
