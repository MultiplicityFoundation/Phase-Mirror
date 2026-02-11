# @phase-mirror/mirror-dissonance-pro

> Proprietary extensions for the Phase Mirror Dissonance framework.

## What is this?

`mirror-dissonance-pro` extends the open-core [`@phase-mirror/mirror-dissonance`](https://github.com/MultiplicityFoundation/Phase-Mirror) package with enterprise-grade features:

| Feature | Description |
|---------|-------------|
| **Tier B Rules** (MD-100+) | Semantic analysis rules — job drift detection, cross-repo gaps, runner trust chains |
| **Compliance Packs** | Pre-built rule bundles for SOC2, HIPAA, PCI-DSS, AI Act |
| **Production Stores** | DynamoDB and Redis implementations of FP store, block counter adapters |
| **FP Calibration Aggregator** | Cross-customer false-positive pooling with k-anonymity guarantees |
| **Hosted Oracle API** | Multi-tenant SaaS oracle with consent management |
| **Federation** | Multi-repo rollup, cross-repo rule evaluation, org-level aggregation |

## Prerequisites

- Active Phase Mirror Enterprise subscription
- `@phase-mirror/mirror-dissonance` ^1.0.0 (peer dependency)
- Node.js >= 18

## Installation

```bash
npm install @phase-mirror/mirror-dissonance-pro
```

## Schema Sync

The `schemas/dissonance-report.schema.json` in this repo MUST exactly match the OSS version.
A daily CI job (`schema-sync-check.yml`) verifies this. Schema changes always originate in OSS.

## Architecture

```
mirror-dissonance-pro/
├── src/
│   ├── rules/tier-b/        # Tier B semantic rules (MD-100+)
│   ├── compliance/           # SOC2, HIPAA compliance packs
│   ├── infra/                # DynamoDB/Redis store implementations
│   ├── calibration/          # FP calibration aggregator
│   ├── federation/           # Multi-repo rollup
│   └── saas/                 # Hosted oracle API
├── schemas/                  # Synced from OSS (read-only)
└── tests/                    # Test suites
```

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

Proprietary — see [LICENSE.md](./LICENSE.md)
