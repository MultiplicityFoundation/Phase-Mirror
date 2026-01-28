# Mirror Dissonance Protocol

The Phase Mirror is a diagnostic tool that surfaces productive contradictions, names hidden assumptions, and converts them into concrete levers. This project addresses how Phase Mirror Dissonance applies specifically to agentic domain-specific reasoning—a domain where tensions between autonomy, compliance, probabilistic outputs, and liability create structural friction that organizations must navigate deliberately rather than accidentally.

## Overview

The Mirror Dissonance Protocol provides an "Oracle" that analyzes changes and makes machine decisions on whether to allow, block, or warn based on detected tensions in agentic reasoning systems. It operates across four key dimensions:

1. **Autonomy vs Compliance** - Balancing agent autonomy with organizational policies
2. **Probabilistic vs Deterministic** - Managing AI uncertainty in contexts requiring predictability
3. **Liability vs Innovation** - Enabling experimentation while containing risk
4. **Human vs Machine** - Ensuring appropriate human oversight and intervention

## Features

- **Rule-Based Analysis** - Five core rules (MD-001 through MD-005) detect specific tensions
- **Policy Framework** - Configurable thresholds for different operational modes
- **False Positive Tracking** - DynamoDB-backed store to learn from misclassifications
- **Circuit Breaker** - Automatic failsafe when block rate exceeds thresholds
- **Drift Detection** - Scheduled analysis to detect baseline deviations
- **Redaction** - Brand-by-capability redaction for sensitive information
- **GitHub Integration** - Native workflow integration with PR checks and merge queues

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- AWS account (for infrastructure)

### Installation

```bash
# Clone repository
git clone https://github.com/RyVanGyver/Phase-Mirror.git
cd Phase-Mirror

# Install dependencies
pnpm install

# Build packages
pnpm build
```

### Basic Usage

```bash
# Run oracle analysis on pull request
pnpm oracle:run run --mode pull_request

# Run in strict mode for merge queue
pnpm oracle:run run --mode merge_group --strict

# Dry run (warn only)
pnpm oracle:run run --dry-run

# Drift detection
pnpm oracle:run run --mode drift --baseline baseline.json
```

## Project Structure

```
mirror-dissonance/
├── .github/
│   ├── workflows/          # CI/CD workflows
│   ├── CODEOWNERS          # Code ownership rules
│   └── branch-protection.json
├── packages/
│   ├── mirror-dissonance/  # Core library
│   │   ├── src/
│   │   │   ├── oracle.ts   # Main entrypoint
│   │   │   ├── rules/      # MD-001 through MD-005
│   │   │   ├── policy/     # Decision logic
│   │   │   ├── redaction/  # Sensitive data redaction
│   │   │   ├── fp-store/   # False positive tracking
│   │   │   ├── block-counter/  # Rate limiting
│   │   │   └── nonce/      # Secure nonce loading
│   │   └── schemas/        # TypeScript interfaces
│   └── cli/                # Command-line interface
├── docs/ops/               # Operations runbook
├── infra/terraform/        # Infrastructure as code
└── pnpm-workspace.yaml
```

## Rules

### MD-001: Branch Protection Validation
Ensures branch protection contexts match workflow job names and required checks are properly configured.

### MD-002: Autonomy vs Compliance
Identifies conflicts between agent autonomy and compliance requirements, flagging autonomous operations that require human review.

### MD-003: Probabilistic Output Management
Detects issues when probabilistic AI outputs are used in contexts requiring deterministic behavior.

### MD-004: Liability and Accountability
Ensures proper audit trails and accountability mechanisms are in place for agent decisions.

### MD-005: Drift Detection
Compares current state against established baselines to detect significant deviations.

## Configuration

### Environment Variables

- `AWS_REGION` - AWS region for DynamoDB and SSM (default: us-east-1)
- `GITHUB_REPOSITORY` - Repository name
- `GITHUB_SHA` - Commit SHA
- `GITHUB_REF_NAME` - Branch name
- `GITHUB_ACTOR` - User triggering the action

### Modes

- `pull_request` - Standard PR validation
- `merge_group` - Strict validation for merge queue
- `drift` - Baseline drift detection
- `calibration` - Establish new baseline

### Flags

- `--strict` - Enable strict thresholds (zero critical/high violations)
- `--dry-run` - Warn-only mode, never blocks
- `--baseline <file>` - Baseline file for drift detection

## Infrastructure Setup

### 1. Generate Nonce

```bash
openssl rand -hex 32
```

### 2. Store in AWS SSM

```bash
aws ssm put-parameter \
  --name /guardian/redaction_nonce \
  --value <nonce> \
  --type SecureString
```

### 3. Deploy Infrastructure

```bash
cd infra/terraform
terraform init
terraform apply
```

This creates:
- DynamoDB tables for FP tracking and block counting
- SSM parameter for redaction nonce
- CloudWatch alarms for monitoring

### 4. Configure GitHub

- Apply branch protection rules from `.github/branch-protection.json`
- Update CODEOWNERS with actual usernames
- Enable workflows

### 5. Initial Calibration

```bash
pnpm oracle:run run --mode calibration --output baseline.json
```

## GitHub Actions

### CI Workflow
Runs on every PR, executes oracle analysis, uploads report as artifact, and blocks on critical violations.

### Merge Queue Workflow
Runs in strict mode with full history fetch for proper baseline comparison.

### Drift Detection Workflow
Scheduled daily at 2 AM UTC, compares against baseline and creates issue if drift detected.

## Development

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

### Lint

```bash
pnpm lint
```

### Clean

```bash
pnpm clean
```

## Monitoring

### CloudWatch Alarms

1. **SSM GetParameter Failures** - Alerts when nonce loading fails
2. **High Block Rate** - Triggers when blocks exceed 100/hour (circuit breaker threshold)

### Metrics

- Block count per hour by rule
- Violation counts by severity
- False positive rate
- Rule evaluation failures

## Troubleshooting

See [Operations Runbook](docs/ops/runbook.md) for detailed troubleshooting procedures.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes following code owner requirements
4. Submit PR (oracle will automatically analyze)
5. Address any violations reported by oracle

## License

Apache License 2.0 - See [LICENSE](LICENSE) file for details.

## Support

- Documentation: `/docs`
- Runbooks: `/docs/ops`
- Issues: GitHub Issues
- Contact: See CODEOWNERS for responsible parties 
