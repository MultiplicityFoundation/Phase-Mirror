# Calibration CLI Commands

## Overview

The Phase Mirror CLI provides comprehensive commands for managing FP calibration with Byzantine filtering.

## Commands

### `calibration aggregate`

Aggregate FPs for a specific rule with Byzantine filtering.

```bash
oracle calibration aggregate --rule-id <rule-id> [options]
```

**Options:**
- `--rule-id <ruleId>` - (Required) Rule ID to aggregate
- `-v, --verbose` - Show detailed information including confidence factors

**Example:**
```bash
oracle calibration aggregate --rule-id no-unused-vars
oracle calibration aggregate --rule-id no-unused-vars --verbose
```

**Output:**
- Consensus FP rate (weighted average of trusted contributors)
- Confidence level with category (High/Medium/Low/Insufficient)
- Trusted vs total contributors
- Total FP events
- Byzantine filtering summary (filter rate, outliers, low reputation)
- Confidence factor breakdown (in verbose mode)

---

### `calibration list`

List all calibration results.

```bash
oracle calibration list [options]
```

**Options:**
- `-f, --format <format>` - Output format: `text` or `json` (default: `text`)

**Examples:**
```bash
oracle calibration list
oracle calibration list -f json
```

**Output (text):**
- Table with Rule ID, Consensus FP Rate, Confidence, Contributors, Events
- Color-coded confidence indicators

**Output (json):**
- JSON array of all calibration results

---

### `calibration show`

Show detailed calibration result for a specific rule.

```bash
oracle calibration show --rule-id <rule-id> [options]
```

**Options:**
- `--rule-id <ruleId>` - (Required) Rule ID to show
- `-f, --format <format>` - Output format: `text` or `json` (default: `text`)

**Examples:**
```bash
oracle calibration show --rule-id no-unused-vars
oracle calibration show --rule-id no-unused-vars -f json
```

**Output:**
- Complete calibration details
- Confidence metrics with all 4 factors
- Byzantine filtering configuration and results
- Low confidence reasons (if applicable)

---

### `calibration stats`

Show aggregate calibration statistics across all rules.

```bash
oracle calibration stats
```

**Output:**
- Network-wide statistics
- Total rules calibrated
- Average confidence and FP rate
- Confidence distribution (high/medium/low/insufficient percentages)
- Contributor and event statistics
- Byzantine filtering usage statistics

---

## Output Features

### Confidence Indicators

The CLI uses color-coded indicators for confidence levels:
- 🟢 **High** - Green indicator (confidence ≥ 70%)
- 🟡 **Medium** - Yellow indicator (50% ≤ confidence < 70%)
- 🔴 **Low** - Red indicator (30% ≤ confidence < 50%)
- ⚪ **Insufficient** - Gray indicator (confidence < 30% or < 3 contributors)

### Output Formats

- **Text** (default): Human-readable with colors and formatting
- **JSON**: Machine-readable for programmatic access

### Byzantine Filtering Details

When Byzantine filtering is applied (≥5 contributors), the output includes:
- **Filter Rate**: Percentage of contributors filtered out
- **Outliers Filtered**: Number of statistical outliers (Z-score > 3.0)
- **Low Reputation**: Number filtered by reputation percentile (bottom 20%)
- **Configuration**: Z-score threshold and reputation percentile used

### Confidence Factors

In verbose mode, the confidence breakdown shows:
- **Contributor Count Factor** (35% weight): More contributors = higher confidence
- **Agreement Factor** (30% weight): Lower variance = higher confidence
- **Event Count Factor** (20% weight): More events = higher confidence
- **Reputation Factor** (15% weight): Higher average reputation = higher confidence

---

## Example Workflow

### 1. Aggregate FPs for a rule
```bash
oracle calibration aggregate --rule-id no-unused-vars -v
```

### 2. View all calibration results
```bash
oracle calibration list
```

### 3. Get detailed information about a specific rule
```bash
oracle calibration show --rule-id no-unused-vars
```

### 4. Check network-wide statistics
```bash
oracle calibration stats
```

---

## Environment Variables

- `PHASE_MIRROR_DATA_DIR` - Data directory for local adapters (default: `.phase-mirror-data`)

---

## Integration

The calibration CLI integrates with:
- **CalibrationStore**: Byzantine filtering pipeline
- **ReputationEngine**: Contribution weight calculation
- **FpStore**: False positive event storage
- **Local Trust Adapters**: File-based storage for reputation and identity data

---

## Error Handling

All commands include proper error handling:
- Clear error messages
- Spinner feedback during operations
- Graceful handling of missing data
- Helpful suggestions when no data is found

Example error handling:
```bash
$ oracle calibration show --rule-id non-existent-rule
✗ No calibration found for rule: non-existent-rule
  Run `oracle calibration aggregate --rule-id non-existent-rule` to create one.
```

---

## Notes

- All commands require the Phase Mirror data directory to exist
- Calibration results are stored in memory by default (use appropriate adapter for persistence)
- Byzantine filtering requires at least 5 contributors to be applied
- Confidence calculation is based on 4 independent factors for transparency
