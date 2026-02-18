# ADR-031: CLI Self-Validation as Mandatory CI Gate

**Status**: Accepted  
**Date**: 2026-02-17  
**Decision Authority**: CI/Infra Lead, approved by Governance  
**Dependencies**: ADR-029 (versioning), ADR-030 (error contracts)

## Context

Phase Mirror enforces governance rules on user repositories but has no mechanism to enforce those rules on **its own codebase**. This creates a **self-referential dissonance**: the mirror doesn't reflect on itself.

## Decision

Every PR to `main` **must** pass `oracle validate --strict` against the Phase Mirror repository itself before merge.

### **Workflow Specification**

Create `.github/workflows/validate-self.yml`:
- **Trigger**: PRs to `main`, paths `packages/**`, `.github/workflows/**`, `.phase-mirror.yml`
- **Steps**: Build core + CLI → Run `oracle validate --strict` → Block merge if exit ≠ 0
- **Failure treatment**: **Governance event**, not "flaky CI" — requires explicit investigation

### **Enforcement**

- Branch protection rule: `validate-self` workflow must pass
- Override: Requires governance owner approval (2-factor: approval + `override-governance` label)
- Audit: All overrides logged in `docs/governance-overrides.md`

### **Exit Code Semantics** (per ADR-030)

| Exit Code | Meaning | CI Effect |
|-----------|---------|-----------|
| `0` | All governance rules pass | Merge allowed |
| `1` | L0 violation or hard failure | Merge blocked |
| `2` | Degraded (infrastructure unavailable) | Merge allowed with warning |

## Rationale

This enforces the **L0 invariant of self-consistency**: governance rules apply to the governance tool. It also serves as:
1. **Continuous validation** of CLI functionality (if `validate` breaks, CI catches it)
2. **Forcing function** for maintaining `.phase-mirror.yml` alignment with codebase
3. **Cultural signal** that governance is not negotiable, even for maintainers

## Implementation

See artifact `.github/workflows/validate-self.yml` (created alongside this ADR).

## Consequences

- All future PRs gated on self-validation passing
- Governance violations in Phase Mirror repo become **unmergeable**
- Requires `.phase-mirror.yml` to be production-ready (forces prioritization)
- Override path exists but requires governance label + audit trail
