# CLI Reputation Commands

## Overview

The reputation commands provide a command-line interface for managing organization reputation, consistency scores, and stake pledges in the Phase Mirror Trust Module.

## Commands

### `oracle reputation show`

Show reputation details for an organization.

```bash
oracle reputation show --org-id <orgId> [--verbose]
```

**Options:**
- `--org-id <orgId>` (required): Organization ID to show
- `--verbose, -v`: Show detailed information including contribution weights

**Example:**
```bash
oracle reputation show --org-id org-123 --verbose
```

**Output:**
```
📊 Reputation Details

  Organization ID: org-123
  Reputation Score: 0.900 🌟
  Consistency Score: 0.950
  Stake Pledge: $5,000
  Stake Status: Active
  Contribution Count: 50
  Flagged Count: 0
  Age Score: 0.800
  Volume Score: 0.700
  Last Updated: 2026-02-04T02:00:00.000Z

🔢 Contribution Weight Breakdown:
  Final Weight: 1.000
  Base Reputation: 0.900
  Stake Multiplier: 1.000
  Consistency Bonus: 0.190
  Can Participate: Yes ✓
```

---

### `oracle reputation list`

List organizations by reputation score.

```bash
oracle reputation list [--min-score <score>] [--sort-by <field>] [--limit <number>]
```

**Options:**
- `--min-score <score>`: Minimum reputation score filter (0.0-1.0)
- `--sort-by <field>`: Sort by field (reputation, consistency, stake) [default: reputation]
- `--limit <number>`: Limit number of results

**Example:**
```bash
oracle reputation list --min-score 0.5 --sort-by consistency --limit 10
```

**Output:**
```
📋 Organization Reputations

┌────────────────────────┬───────────┬─────────────┬────────┬──────────┬────────┐
│ Org ID                 │ Rep Score │ Consistency │ Stake  │ Contribs │ Status │
├────────────────────────┼───────────┼─────────────┼────────┼──────────┼────────┤
│ org-good-contributor   │ 0.900     │ 0.950       │ $5,000 │ 50       │ Active │
│ org-new-contributor    │ 0.500     │ 0.500       │ $1,000 │ 2        │ Active │
└────────────────────────┴───────────┴─────────────┴────────┴──────────┴────────┘

Total: 2 organization(s)
```

---

### `oracle reputation calculate-consistency`

Calculate consistency score for an organization based on contribution history.

```bash
oracle reputation calculate-consistency --org-id <orgId> [--mock-data]
```

**Options:**
- `--org-id <orgId>` (required): Organization ID
- `--mock-data`: Use mock contribution data for demo [default: false]

**Example:**
```bash
oracle reputation calculate-consistency --org-id org-123 --mock-data
```

**Output:**
```
🎯 Calculating Consistency Score

✓ Consistency Score: 0.974 (97.4%)

📈 Metrics:
  Rules Contributed: 4
  Contributions Considered: 4
  Average Deviation: 2.50%
  Deviation Std Dev: 0.50%
  Outliers Detected: 0
  Last Contribution: 2/3/2026
  Oldest Contribution Age: 30 days
```

---

### `oracle reputation update`

Update reputation metrics for an organization.

```bash
oracle reputation update --org-id <orgId> [options]
```

**Options:**
- `--org-id <orgId>` (required): Organization ID
- `--reputation-score <score>`: Reputation score (0.0-1.0)
- `--consistency-score <score>`: Consistency score (0.0-1.0)
- `--contribution-count <count>`: Number of contributions
- `--flagged-count <count>`: Number of times flagged
- `--age-score <score>`: Age score (0.0-1.0)
- `--volume-score <score>`: Volume score (0.0-1.0)

**Example:**
```bash
oracle reputation update --org-id org-123 \
  --reputation-score 0.85 \
  --consistency-score 0.92 \
  --contribution-count 55
```

**Output:**
```
✏️  Updating Reputation

✓ Reputation updated successfully

📊 Reputation Details
[Shows updated reputation details]
```

---

### `oracle reputation stake pledge`

Create a stake pledge for an organization.

```bash
oracle reputation stake pledge --org-id <orgId> --amount <amount>
```

**Options:**
- `--org-id <orgId>` (required): Organization ID
- `--amount <amount>` (required): Stake amount in USD

**Example:**
```bash
oracle reputation stake pledge --org-id org-123 --amount 2500
```

**Output:**
```
💰 Creating Stake Pledge

✓ Stake pledge of $2,500 created successfully

  Organization: org-123
  Amount: $2,500
  Status: Active
  Pledged At: 2026-02-04T02:00:00.000Z
```

---

### `oracle reputation stake show`

Show stake pledge details for an organization.

```bash
oracle reputation stake show --org-id <orgId>
```

**Options:**
- `--org-id <orgId>` (required): Organization ID

**Example:**
```bash
oracle reputation stake show --org-id org-123
```

**Output:**
```
💰 Stake Pledge Details

  Organization: org-123
  Amount: $5,000
  Status: Active
  Pledged At: 2026-01-15T10:00:00.000Z
```

---

### `oracle reputation stake slash`

Slash stake for malicious behavior (Byzantine fault).

```bash
oracle reputation stake slash --org-id <orgId> --reason <reason>
```

**Options:**
- `--org-id <orgId>` (required): Organization ID
- `--reason, -r <reason>` (required): Reason for slashing

**Example:**
```bash
oracle reputation stake slash --org-id org-malicious --reason "Data poisoning detected"
```

**Output:**
```
⚠️  Slashing Stake

✓ Stake slashed successfully

  Organization: org-malicious
  Reason: Data poisoning detected
  ⚠️  This organization can no longer participate in the network.
```

---

## Environment Variables

- `PHASE_MIRROR_DATA_DIR`: Data directory for trust adapters [default: .phase-mirror-data]

## Examples

### Complete Workflow

1. **Create an organization with stake:**
```bash
oracle reputation update --org-id org-new \
  --reputation-score 0.5 \
  --consistency-score 0.5 \
  --age-score 0.1 \
  --volume-score 0.2

oracle reputation stake pledge --org-id org-new --amount 1000
```

2. **Check reputation status:**
```bash
oracle reputation show --org-id org-new --verbose
```

3. **Calculate consistency score:**
```bash
oracle reputation calculate-consistency --org-id org-new --mock-data
```

4. **Update based on performance:**
```bash
oracle reputation update --org-id org-new \
  --consistency-score 0.92 \
  --contribution-count 25
```

5. **List top performers:**
```bash
oracle reputation list --min-score 0.7 --sort-by consistency
```

### Byzantine Fault Response

If an organization is detected submitting malicious data:

```bash
# Slash their stake
oracle reputation stake slash --org-id org-malicious \
  --reason "Attempted FP rate poisoning"

# Verify they can't participate
oracle reputation show --org-id org-malicious --verbose
# Will show: Can Participate: No ✗
```

---

## Integration with Trust Module

These CLI commands interact with the following Trust Module components:

- **ReputationEngine**: Manages reputation scores and contribution weights
- **ConsistencyScoreCalculator**: Calculates consensus alignment
- **LocalTrustAdapters**: Persists reputation and stake data
- **Byzantine Fault Tolerance**: Automatic outlier downweighting

For more details, see:
- [Consistency Scoring Documentation](../../../mirror-dissonance/src/trust/CONSISTENCY_SCORING.md)
- [Trust Module Overview](../../../mirror-dissonance/src/trust/README.md)
