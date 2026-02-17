# ADR-029: CLI Versioning & Production Readiness Criteria

**Status**: Accepted  
**Date**: 2026-02-17  
**Decision Authority**: Lead Multiplicity Theorist (governance casting vote)  
**Consulted**: Product (GTM timing), Engineering (feasibility)

## Context

`packages/cli/package.json` declares `"version": "1.0.0"`, but the implementation exhibits:
- Test coverage: 27% (3/11 commands tested)
- Known critical gaps: drift baseline loader non-functional, FP store silent failures, missing templates
- Risk: Free-tier users adopt CLI, encounter silent governance failures, lose trust before network-effect moat activates

This creates a **social contract violation**: semver 1.0.0 broadcasts "production-validated" while actual state is "structurally complete, functionally unvalidated."

## Decision

We define Phase Mirror versioning policy:

### **0.x (Experimental)**
- **Allowed**: Incomplete test coverage, placeholder implementations, documented known gaps
- **Required**: All L0 invariants functional (fail-closed), no silent failures on L0 violations
- **User-facing signal**: CLI prints `⚠️ EXPERIMENTAL (v0.x): See github.com/PhaseMirror/Phase-Mirror/docs/adr/ADR-029.md` on every invocation

### **1.0.x (Production-Validated)**
- **Required**:
  - ≥80% test coverage per command in `src/commands/*.ts`
  - All README-documented commands functional (no placeholders)
  - Zero silent failures (all errors propagate with typed error contracts)
  - All documented templates present and tested
  - Self-validation CI passing (`oracle validate --strict` on Phase Mirror repo)
- **User-facing signal**: No experimental warnings

### **Decision Authority (New Governance Rule)**

The **governance owner** (currently: Lead Multiplicity Theorist) holds **casting vote** on version semantics and readiness criteria. Product and engineering are consulted but advisory.

Release workflows **must** require `GOVERNANCE_APPROVED_VERSION=true` label on release PRs, verified by CI.

## Consequences

### Immediate (Day 1)
1. Downgrade `packages/cli/package.json` to `"version": "0.9.0"`
2. Tag current `main` as `v0.9.0-rc.1`
3. Block npm publish of any `1.x.x` tag until all criteria met
4. Add experimental banner to CLI entrypoint

### Timeline
- Target `1.0.0` promotion: 7-9 days after ADR-029 merge (contingent on lever completion)
- If levers incomplete at day 9: remain on `0.9.x` line, no exceptions

### Rationale
Open-core viability principle: **"The free core must be useful on its own."** Silent failures train users to ignore governance signals, destroying trust before the network effect compounds value. We optimize for **trust preservation** over **adoption velocity**.

## Alternatives Rejected

**Option A: Keep 1.0.0, document known issues**  
Rejected because: Semver is a social contract. Documenting issues doesn't change the signal that "1.0" sends. Users filter on version numbers, not CHANGELOGs.

**Option C: Ship 1.0.0, iterate in-market**  
Rejected because: Aligns with generic SaaS playbook but conflicts with governance-first positioning. Phase Mirror's differentiation is **diagnostic precision**, not "move fast and break governance."
