# ADR-010: MCP Tool Tier Policy

**Status:** Accepted  
**Date:** 2026-02-17  
**Owner:** Governance Council

## Context

Not all MCP tools have the same governance authority. Some must enforce L0 invariants or ADR compliance (binding), while others provide analytics or experimental features (advisory). We need clear rules for which tools can claim authoritative semantics.

## Decision

Tools are classified into **two tiers** with different requirements and constraints.

### Tier 1: Authoritative

**Semantics:** Binding governance outcomes; may emit `decision:"block"` in cloud + authoritative mode.

**Requirements:**
- Must have a corresponding ADR documenting the invariant/rule.
- Must be implemented in `mirror-dissonance` core (or equivalent) before MCP exposure.
- Must have integration tests proving floor behavior (local = advisory, cloud = authoritative).

**Tools:**
- `analyze_dissonance` → ADR-009
- `validate_l0_invariants` → ADR-009
- `check_adr_compliance` → ADR-009
- `check_consent_requirements` → ADR-009

### Tier 2: Experimental / Advisory

**Semantics:** Non-binding insights; may ship MCP-first for UX exploration.

**Constraints:**
- Cannot emit `decision:"block"`.
- Cannot use L0-only error codes (`INVARIANT_VIOLATION`, `CONSENT_REQUIRED`).
- Must be labeled with `x-tier: "experimental"` and clear `x-visibilityHint`.

**Tools:**
- `query_fp_store` (read-only FP analytics)
- `dummy_experimental` (test tool)

### Manifest Enforcement Rule

| Direction | Condition | CI Behavior | Rationale |
|-----------|-----------|-------------|-----------|
| Code without policy | Live tool has no manifest entry | **Fatal** (exit 1) | No tool may operate without declared governance posture |
| Policy without code | Manifest row has no live tool | **Warning** (non-blocking) | Governance may pre-declare intent before implementation |
| Contract drift | Generated contract ≠ committed | **Fatal** (git diff fails) | Contract must always reflect live state |
| Tier 1 without ADR | Authoritative tool missing `x-adr` | **Fatal** | Binding claims require binding documents |
| Tier 2 claiming L0 | Experimental tool emits block/L0 codes | **Fatal** | Floor enforcement |

### Tool Policy Table

| Tool | Tier | Must Lag Core | May Ship MCP-First | Allowed Decisions | Allowed Codes |
|------|------|---------------|-------------------|------------------|---------------|
| `analyze_dissonance` | authoritative | ✓ | ✗ | block/warn/pass | All |
| `validate_l0_invariants` | authoritative | ✓ | ✗ | block/warn/pass | All including L0 |
| `check_adr_compliance` | authoritative | ✓ | ✗ | block/warn/pass | All |
| `check_consent_requirements` | authoritative | ✓ | ✗ | block/warn/pass | All including CONSENT_REQUIRED |
| `query_fp_store` | experimental | ✗ | ✓ | warn/pass only | Non-L0 only |
| `dummy_experimental` | experimental | ✗ | ✓ | warn/pass only | Non-L0 only |

## Consequences

### Positive

- Clear path for experimental tools (e.g., FP analytics) without governance risk.
- Authoritative tools carry explicit ADR backing.
- CI enforces the split automatically.

### Negative

- Tier 1 tools must wait for core + ADR (slower iteration).
- Requires governance review for every tool classification.

## References

- ADR-009: MCP Governance Surface
- `packages/mcp-server/policy/mcp-tools.policy.json`
- `packages/mcp-server/scripts/build-contract.ts`
