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
│   │   └── src/
│   │       └── l0-invariants/   # Foundation-tier validation (L0)
│   └── cli/                     # CLI wrapper around library
├── docs/
│   ├── governance/              # Articles, Bylaws, Succession Planning
│   ├── adr/                     # Architecture Decision Records (ADRs)
│   ├── benchmarks/              # L0 performance benchmarks
│   └── ops/                     # Nonce rotation, circuit-breaker runbooks
└── infra/
    └── terraform/               # DynamoDB, SSM, alarms

```

## Documentation

- **Governance:** [docs/governance/](/docs/governance/) - Legal foundation, bylaws, succession planning
- **ADRs:** [docs/adr/](/docs/adr/) - All architectural decisions with rationale
- **Contributing:** [CONTRIBUTING.md](/CONTRIBUTING.md) - How to contribute, ADR process
- **Phase 1 Completion:** [docs/PHASE_1_COMPLETION_CHECKLIST.md](/docs/PHASE_1_COMPLETION_CHECKLIST.md)
- **L0 Benchmarks:** [docs/benchmarks/L0_BENCHMARK_REPORT.md](/docs/benchmarks/L0_BENCHMARK_REPORT.md)

## Key Architecture Decisions

- **ADR-001:** [Foundation-First Entity Architecture](/docs/adr/ADR-001-foundation-first-entity-architecture.md) - Why 501(c)(3) nonprofit
- **ADR-002:** [Apache 2.0 + Managed Service Restriction](/docs/adr/ADR-002-apache-2-license-with-managed-service-restriction.md) - Licensing strategy
- **ADR-003:** [Hierarchical PMD Compute (L0/L1/L2)](/docs/adr/ADR-003-hierarchical-pmd-compute.md) - Three-tier cost model
- **ADR-004:** [FP Anonymization with HMAC + k-Anonymity](/docs/adr/ADR-004-fp-anonymization-with-hmac-k-anonymity.md) - Privacy-respecting calibration
- **ADR-005:** [Nonce Rotation & Fail-Closed Availability](/docs/adr/ADR-005-nonce-rotation-fail-closed-availability.md) - Security and availability

