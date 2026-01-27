# Mirror Dissonance Protocol (Phase Mirror)

Mirror Dissonance is a callable, auditable inconsistency-finding protocol across requirements ↔ configs ↔ code ↔ runtime assumptions. It outputs a deterministic `dissonance_report.json` that can be used as a first-class control surface in PR checks, merge queue, drift detection, and incident response.

## What this repo is

This project packages “Mirror Dissonance” as:
- A **library**: rule registry + evidence requirements + decision policy.
- A **CLI**: runs the oracle in different event modes (`pull_request`, `merge_group`, `drift`).
- A **GitHub Actions integration**: uploads reports as artifacts and can block merges based on explicit policy.

Design goal: replace vibe-based review with mechanisms, artifacts, and governance.

## Key properties

- Repeatable: same inputs + same rule set ⇒ same report shape.
- Evidence-based: findings cite exact files/paths/keys (and line ranges when available).
- Auditable: stable JSON schema, stable ordering, hashes.
- Safe to call: read-only evaluation, bounded budgets/timeouts, redaction guarantees.
- Policy-driven: pass/warn/block is explicit, versioned, and measurable.

## Repository layout

```text
.
├── .github/
│   ├── workflows/               # CI, merge queue, drift detection
│   ├── CODEOWNERS               # Stewardship + review gates
│   └── branch-protection.json   # Example/provisioning input
├── packages/
│   ├── mirror-dissonance/       # Core library
│   └── cli/                     # CLI wrapper around library
├── docs/
│   └── ops/                     # Nonce rotation, circuit-breaker runbooks
└── infra/
    └── terraform/               # DynamoDB, SSM, alarms

