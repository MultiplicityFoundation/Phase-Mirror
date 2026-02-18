# Phase Mirror CLI (Mirror Dissonance Protocol)

AI Governance for GitHub Actions - Command Line Interface

## Overview

The Phase Mirror CLI provides a command-line interface to the Mirror Dissonance Protocol Oracle. It enables you to:

- Analyze workflow files for policy violations
- Validate L0 invariants (non-negotiable security boundaries)
- Detect configuration drift
- Manage false positives
- Configure governance rules

## Installation

```bash
# From the monorepo root
pnpm install

# Build the CLI
pnpm --filter @mirror-dissonance/cli build
```

## Usage

### Initialize Configuration

```bash
oracle init --template standard
```

Available templates:
- `minimal` - Essential rules only (L0 invariants, no drift, no FP)
- `standard` - Recommended rules for most projects (default)
- `strict` - Maximum governance: strict L0, tight drift threshold, circuit-breaker

Standalone template files are in `templates/minimal.yml`, `standard.yml`, `strict.yml`.
Copy directly: `cp node_modules/@mirror-dissonance/cli/templates/strict.yml .phase-mirror.yml`

### Analyze Files

```bash
# Analyze all workflow files
oracle analyze

# Analyze specific files
oracle analyze .github/workflows/*.yml

# With custom mode
oracle analyze --mode pull_request --strict
```

### Validate L0 Invariants

```bash
oracle validate
oracle validate --strict --workflows-dir .github/workflows
```

### Drift Detection

```bash
# Create baseline
oracle baseline --output baseline.json

# Check for drift
oracle drift --baseline baseline.json
```

### Configuration Management

```bash
# Show current configuration
oracle config show

# Get a specific value
oracle config get drift.threshold

# Set a value
oracle config set drift.threshold 0.20

# Validate configuration
oracle config validate
```

### False Positive Management

```bash
# Mark a finding as false positive
oracle fp mark FINDING-123 --reason "Known safe pattern" --pattern

# List false positives
oracle fp list
oracle fp list --rule MD-001

# Export false positives (anonymized)
oracle fp export --output fp-export.json

# Import false positive patterns
oracle fp import fp-patterns.json
```

### Identity Verification

Verify organizational identities for trust network participation:

```bash
# Verify via GitHub organization
export GITHUB_TOKEN=ghp_your_token
oracle verify github \
  --org-id your-org-123 \
  --github-org your-github-org \
  --public-key your-public-key

# Verify via Stripe customer (basic)
export STRIPE_SECRET_KEY=sk_test_your_key
oracle verify stripe \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key your-public-key

# Verify via Stripe with subscription requirement
oracle verify stripe \
  --org-id your-org-123 \
  --stripe-customer cus_ABC123XYZ \
  --public-key your-public-key \
  --require-subscription \
  --product-ids prod_PhaseMirrorEnterprise

# List verified identities
oracle verify list
oracle verify list --method stripe_customer
```

### Nonce Management

Manage cryptographic nonce bindings for verified organizations:

```bash
# Generate and bind nonce for verified org
oracle nonce generate --org-id your-org-123 --public-key your-key

# Validate nonce binding
oracle nonce validate --org-id your-org-123 --nonce abc123...

# Rotate nonce (e.g., after key rotation)
oracle nonce rotate --org-id your-org-123 --new-public-key new-key --reason "Key rotation"

# Show nonce binding details
oracle nonce show --org-id your-org-123

# List all nonce bindings
oracle nonce list

# Show rotation history
oracle nonce history --org-id your-org-123
```

## Configuration File

The CLI uses `.phase-mirror.yml` for configuration:

```yaml
version: "1"

rules:
  enabled:
    - MD-001  # L0 Invariant: Workflow Integrity
    - MD-002  # L0 Invariant: Permissions Boundary
    - MD-003  # L0 Invariant: Baseline Drift
    - MD-004  # Circuit Breaker Detection
    - MD-005  # Consent Boundary

  severity:
    MD-001: critical
    MD-002: high
    MD-003: high
    MD-004: medium
    MD-005: medium

l0_invariants:
  enabled: true
  strict: false

drift:
  enabled: true
  threshold: 0.15

false_positives:
  enabled: true
  storage: local

fail_on: high
```

## Output Formats

The CLI supports multiple output formats:

- `text` - Human-readable text (default)
- `json` - Machine-readable JSON
- `sarif` - SARIF 2.1.0 format for code scanning
- `github` - GitHub Actions annotations

```bash
oracle analyze --format json --output results.json
oracle analyze --format sarif --output results.sarif
oracle analyze --format github  # Outputs annotations
```

## GitHub Actions Integration

The CLI automatically detects GitHub Actions environment variables:

- `GITHUB_REPOSITORY` - Repository name
- `GITHUB_SHA` - Commit SHA
- `GITHUB_REF_NAME` - Branch name
- `GITHUB_ACTOR` - Actor username
- `GITHUB_PR_NUMBER` - Pull request number
- `GITHUB_STEP_SUMMARY` - Step summary file

It will write results to the step summary when running in CI.

## Exit Codes

- `0` - Success (PASS or WARN)
- `1` - Failure (BLOCK or error)

## Development

```bash
# Build
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Clean
pnpm clean
```

## License

Apache-2.0
