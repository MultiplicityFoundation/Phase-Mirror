# Mirror Dissonance Protocol (Phase Mirror)

![Coverage](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/PhaseMirror/Phase-Mirror/main/coverage-badge.json)

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

## Installation

### Prerequisites
- Node.js 18+ and pnpm
- AWS CLI (for production deployment)
- Terraform 1.6+ (for infrastructure)

### Local Development

```bash
git clone https://github.com/PhaseMirror/Phase-Mirror.git
cd Phase-Mirror
pnpm install
pnpm build
```

### Global CLI Installation

```bash
npm install -g @mirror-dissonance/cli
mirror-dissonance --help
```

### MCP Server for GitHub Copilot

Enable governance-aware code generation:

```bash
npm install -g @phase-mirror/mcp-server
```

Configure in repository settings → Copilot → Coding Agent:

```json
{
  "mcpServers": {
    "phase-mirror": {
      "type": "local",
      "command": "phase-mirror-mcp"
    }
  }
}
```

See [MCP Server README](packages/mcp-server/README.md) for full documentation.

### Self-Hosted Deployment

```bash
# Deploy infrastructure
cd infra/terraform
terraform init
terraform workspace new staging
terraform apply -var-file=staging.tfvars

# Generate nonce
./scripts/rotate-nonce.sh staging 0
```

See the [Quick Start Guide](docs/QUICKSTART.md) for detailed instructions.

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# View coverage report
pnpm test:coverage:report

# Run in watch mode
pnpm test:watch
```

### Coverage Requirements

- **Global threshold:** 80% (branches, functions, lines, statements)
- **Critical paths:** 90% (L0 invariants, redaction, nonce)
- **Integration layers:** 75% (DynamoDB adapters, CLI)

Coverage is enforced in CI. PRs below threshold will fail.

See [Testing Guide](docs/TESTING.md) for detailed testing documentation.

## Cloud Adapters

Phase Mirror uses **cloud adapters** to abstract AWS SDK dependencies and enable:

- ✅ **Local testing** without AWS resources
- ✅ **Multi-cloud support** (AWS, GCP, Azure)
- ✅ **Easier mocking** in unit tests
- ✅ **Better separation of concerns**

### Quick Start

```typescript
import { createAdapters, loadCloudConfig } from '@mirror-dissonance/core/adapters';

// Auto-load from environment
const adapters = await createAdapters(loadCloudConfig());

// Record false positive
await adapters.fpStore.record({
  findingId: 'finding-123',
  ruleId: 'MD-001',
  resolvedBy: 'developer',
  orgIdHash: 'org-hash',
  consent: 'explicit',
  context: { repoId: 'repo-456' },
});

// Query by organization
const events = await adapters.fpStore.query({
  orgId: 'org-hash',
  startTime: new Date('2024-01-01'),
  limit: 50,
});
```

### Environment Configuration

```bash
# Provider (default: 'aws')
export CLOUD_PROVIDER=aws

# AWS Configuration
export AWS_REGION=us-east-1
export FP_TABLE_NAME=phase-mirror-fp-events
export CONSENT_TABLE_NAME=phase-mirror-consents
export BLOCK_COUNTER_TABLE_NAME=phase-mirror-block-counter

# SSM Parameter Names
export NONCE_PARAMETER_NAME=/phase-mirror/redaction-nonce
export SALT_PARAMETER_PREFIX=/phase-mirror/salts/

# S3 Buckets
export BASELINE_BUCKET=phase-mirror-baselines
export REPORT_BUCKET=phase-mirror-reports
```

### Local Testing (No AWS Required)

```bash
# Use in-memory adapters
export CLOUD_PROVIDER=local
pnpm test
```

### Available Adapters

| Adapter | Purpose | AWS Implementation |
|---------|---------|-------------------|
| **FPStoreAdapter** | False positive event tracking | DynamoDB with GSIs |
| **ConsentStoreAdapter** | Organization consent management | DynamoDB |
| **BlockCounterAdapter** | Circuit breaker counters | DynamoDB with TTL |
| **SecretStoreAdapter** | Nonces and salts (fail-closed) | SSM Parameter Store |
| **ObjectStoreAdapter** | Baseline/report storage | S3 with versioning |

### Infrastructure

Deploy DynamoDB tables with required GSIs:

```bash
cd infra/aws
terraform init
terraform apply -var="environment=dev"
```

See the **[Migration Guide](docs/MIGRATION.md)** for detailed adapter usage and the **[Refactor Plan](docs/REFACTOR_PLAN.md)** for migration strategy.

## GitHub Actions Integration

Add to `.github/workflows/mirror-dissonance.yml`:

```yaml
name: Mirror Dissonance Check

on:
  pull_request:
  merge_group:

jobs:
  oracle:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
      
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ORACLE_ROLE }}
          aws-region: us-east-1
      
      - name: Run Oracle
        run: |
          npx @mirror-dissonance/cli analyze \
            --mode pull_request \
            --repository ${{ github.repository }} \
            --commit ${{ github.sha }}
      
      - name: Upload Report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: dissonance-report
          path: dissonance_report.json
```

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
│   │       ├── l0-invariants/   # Foundation-tier validation (L0)
│   │       ├── consent-store/   # Organization consent management
│   │       ├── anonymizer/      # HMAC-SHA256 anonymization
│   │       ├── calibration-store/ # k-Anonymity queries
│   │       ├── ingest-handler/  # FP ingestion pipeline
│   │       └── fp-store/        # False positive storage
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

### Getting Started
- **[Quick Start Guide](docs/QUICKSTART.md)** - Get up and running in 5 minutes
- **[Configuration Guide](docs/CONFIGURATION.md)** - Environment variables, Terraform, rule tuning
- **[FAQ](docs/FAQ.md)** - Frequently asked questions
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and debugging

### Architecture & Governance
- **[Architecture](docs/architecture.md)** - System design and component interactions
- **Governance:** [docs/governance/](/docs/governance/) - Legal foundation, bylaws, succession planning
- **ADRs:** [docs/adr/](/docs/adr/) - All architectural decisions with rationale

### Development & Operations
- **[Contributing](CONTRIBUTING.md)** - How to contribute, ADR process
- **[Operations](docs/ops/)** - Nonce rotation, circuit-breaker runbooks
- **[L0 Benchmarks](docs/benchmarks/L0_BENCHMARK_REPORT.md)** - Performance metrics

### Deployment Guides
- **[Phase 1 Completion](docs/PHASE_1_COMPLETION_CHECKLIST.md)** - Foundation checklist
- **[Phase 2 Summary](PHASE_2_SUMMARY.md)** - FP Calibration Service implementation
- **[Phase 3 Infrastructure](docs/Phase%203:%20Infrastructure%20Deployment%20(Days%2022-30).md)** - Production deployment

## Key Architecture Decisions

- **ADR-001:** [Foundation-First Entity Architecture](/docs/adr/ADR-001-foundation-first-entity-architecture.md) - Why 501(c)(3) nonprofit
- **ADR-002:** [Apache 2.0 + Managed Service Restriction](/docs/adr/ADR-002-apache-2-license-with-managed-service-restriction.md) - Licensing strategy
- **ADR-003:** [Hierarchical PMD Compute (L0/L1/L2)](/docs/adr/ADR-003-hierarchical-pmd-compute.md) - Three-tier cost model
- **ADR-004:** [FP Anonymization with HMAC + k-Anonymity](/docs/adr/ADR-004-fp-anonymization-with-hmac-k-anonymity.md) - Privacy-respecting calibration
- **ADR-005:** [Nonce Rotation & Fail-Closed Availability](/docs/adr/ADR-005-nonce-rotation-fail-closed-availability.md) - Security and availability

