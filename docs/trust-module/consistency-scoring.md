# Consistency Scoring

## Overview

Consistency scoring is Phase Mirror's mechanism for Byzantine fault tolerance in the false positive calibration network. Organizations that contribute FP rates aligned with network consensus earn higher reputation scores, while outliers are automatically downweighted. This creates a feedback loop that incentivizes accurate reporting without requiring identity disclosure.

## Why Consistency Scoring?

Without consistency scoring, malicious organizations could poison FP calibration by submitting false data:

| Attack | Without Consistency | With Consistency |
|--------|---------------------|------------------|
| **Data Poisoning** | Single malicious org with high stake can skew consensus | Outlier automatically downweighted in future aggregations |
| **Collusion** | Multiple orgs coordinate to manipulate rates | Each org's consistency measured independently; colluding orgs detected as outliers |
| **False Positives Inflation** | Attacker submits artificially high FP rates | High deviation from consensus → low consistency → low weight |
| **No Feedback** | Bad actors undetected until manual review | Automatic feedback loop: bad reporting → lower reputation → less influence |

## How It Works

### Step 1: Contribution

Organization submits FP data for a rule:

```
Rule: no-unused-vars
Org FP Rate: 0.15 (15% false positive rate)
```

### Step 2: Consensus Calculation

Calibration Store aggregates all organizations' contributions (weighted by reputation):

```
Org A: 0.15 (weight: 1.2)
Org B: 0.12 (weight: 1.0)
Org C: 0.18 (weight: 0.8)
Org D: 0.90 (weight: 0.5) ← Outlier!

Weighted Consensus: 0.16
```

### Step 3: Consistency Measurement

Calculate deviation from consensus for each org:

```
Org A: |0.15 - 0.16| = 0.01 → Consistency = 0.99 ✅ Excellent
Org B: |0.12 - 0.16| = 0.04 → Consistency = 0.96 ✅ Good
Org C: |0.18 - 0.16| = 0.02 → Consistency = 0.98 ✅ Excellent
Org D: |0.90 - 0.16| = 0.74 → Consistency = 0.26 ❌ Poor (outlier)
```

### Step 4: Reputation Update

Update each organization's consistency score (weighted by recency):

```
Org A: Previous consistency = 0.92, New = 0.93 (improved)
Org B: Previous consistency = 0.88, New = 0.89
Org C: Previous consistency = 0.95, New = 0.95
Org D: Previous consistency = 0.60, New = 0.55 (declined)
```

### Step 5: Future Weighting

Next calibration round uses updated reputation:

```
Org A: Base reputation × (1 + stake) × (1 + 0.086) = Higher weight
Org B: Base reputation × (1 + stake) × (1 + 0.078) = Higher weight
Org C: Base reputation × (1 + stake) × (1 + 0.100) = Highest weight
Org D: Base reputation × (1 + stake) × (1 + 0.020) = Lower weight
```

**Feedback Loop**: Consistent orgs gain more influence, outliers lose influence.

## Consistency Score Formula

### Single Contribution

For a single contribution:

```
consistency = 1 - min(|contributed_rate - consensus_rate|, 1.0)
```

**Properties:**
- Range: [0.0, 1.0]
- 1.0 = perfect match
- 0.0 = maximum deviation (≥100%)
- Bounded: Deviation capped at 1.0

**Examples:**

```
Contributed: 0.15, Consensus: 0.15 → Deviation: 0.00 → Consistency: 1.00
Contributed: 0.15, Consensus: 0.20 → Deviation: 0.05 → Consistency: 0.95
Contributed: 0.15, Consensus: 0.50 → Deviation: 0.35 → Consistency: 0.65
Contributed: 0.15, Consensus: 1.50 → Deviation: 1.35 (capped at 1.0) → Consistency: 0.00
```

### Aggregated Score (Multiple Contributions)

For multiple contributions over time:

```
consistency_score = Σ(weight_i × consistency_i) / Σ(weight_i)

where:
  weight_i = e^(-λ × age_days_i)
  λ = decay rate (default: 0.01)
```

**Time Decay:**
- Recent contributions weighted more heavily
- Exponential decay with ~70-day half-life (λ = 0.01)
- Old contributions fade but never disappear

**Example:**

```
Contribution A: 30 days old, consistency = 0.95, weight = 0.74
Contribution B: 60 days old, consistency = 0.80, weight = 0.55
Contribution C: 90 days old, consistency = 0.60, weight = 0.41

Weighted score = (0.95×0.74 + 0.80×0.55 + 0.60×0.41) / (0.74+0.55+0.41)
               = 1.39 / 1.70
               = 0.818
```

## Configuration

### Default Settings

```typescript
{
  decayRate: 0.01,              // ~70-day half-life for time weighting
  maxContributionAge: 180,      // Only consider contributions from last 6 months
  minContributionsRequired: 3,  // Need at least 3 data points for reliable score
  outlierThreshold: 0.3,        // Deviation > 30% flagged as outlier
  minEventCount: 1,             // At least 1 FP event per contribution
  excludeOutliersFromScore: false, // Include outliers (but downweight them)
  maxConsistencyBonus: 0.2,     // Cap consistency bonus at 20%
}
```

### Tuning Parameters

**decayRate** - Controls how quickly old contributions fade:
- Lower (e.g., 0.005): Longer memory (~140-day half-life)
- Higher (e.g., 0.02): Shorter memory (~35-day half-life)
- Recommendation: 0.01 for balance between recency and history

**maxContributionAge** - Maximum age of contributions to consider:
- Lower (e.g., 90): Only recent data counts
- Higher (e.g., 365): Include older history
- Recommendation: 180 days (6 months) for good balance

**outlierThreshold** - Deviation threshold for outlier detection:
- Lower (e.g., 0.2): Stricter outlier detection
- Higher (e.g., 0.5): More lenient
- Recommendation: 0.3 (30% deviation) as reasonable threshold

**excludeOutliersFromScore** - Whether to exclude outliers:
- `false` (default): Include outliers but downweight them (Byzantine-tolerant)
- `true`: Exclude outliers completely (strict mode, risk of losing valid data)

## Reputation Integration

Consistency score is one factor in overall reputation:

```
contribution_weight = base_reputation × (1 + stake_multiplier) × (1 + consistency_bonus)
```

### Consistency Bonus Calculation:

```
consistency_bonus = (consistency_score - 0.5) × 2 × maxConsistencyBonus

Examples:
  consistency_score = 1.0 → bonus = +0.20 (maximum)
  consistency_score = 0.75 → bonus = +0.10
  consistency_score = 0.5 → bonus = 0.00 (neutral)
  consistency_score = 0.25 → bonus = -0.10 (penalty)
  consistency_score = 0.0 → bonus = -0.20 (maximum penalty)
```

**Neutral Point**: Consistency score of 0.5 provides no bonus or penalty.

### Example Weights:

```
Org A: base=0.8, stake_mult=0.5, consistency_bonus=0.10
  weight = 0.8 × (1 + 0.5) × (1 + 0.10) = 1.32

Org B: base=0.8, stake_mult=0.5, consistency_bonus=-0.05
  weight = 0.8 × (1 + 0.5) × (1 - 0.05) = 1.14

Org A has 16% more influence than Org B due to consistency!
```

## Cold Start Problem

**Challenge**: New organizations have no contribution history, so consistency score cannot be calculated.

**Solution**: New orgs start with neutral score (0.5):
- No bonus or penalty initially
- Must contribute to at least `minContributionsRequired` rules before score is reliable
- Gradual reputation building as more contributions are made

**Timeline:**

```
Contribution 1: Score = 0.5 (neutral, unreliable)
Contribution 2: Score = 0.5 (neutral, unreliable)
Contribution 3: Score = calculated (reliable, used for weighting)
Contribution 10: Score = mature (high confidence)
```

## Outlier Detection

Outliers are contributions with high deviation from consensus (> `outlierThreshold`).

### Why Detect Outliers?

- Identify potential Byzantine actors
- Flag suspicious patterns for manual review
- Provide visibility into data quality

### Not Automatically Excluded:

- Outliers may be legitimate (org has different codebase characteristics)
- Excluding outliers risks losing valid minority perspectives
- Instead, outliers are downweighted but still contribute

### Outlier Metrics:

```
Outlier Count: Number of contributions flagged as outliers
Outlier Rate: outlier_count / total_contributions
Average Deviation: Mean deviation across all contributions
Deviation Std Dev: Variance in deviation (consistency of consistency)
```

### Example:

```
Org with many outliers:
  Outlier Count: 8 / 20 contributions (40%)
  Average Deviation: 0.25
  → Likely data quality issue or malicious

Org with few outliers:
  Outlier Count: 1 / 20 contributions (5%)
  Average Deviation: 0.05
  → Healthy, one-off anomaly acceptable
```

## CLI Commands

### Show Reputation

```bash
oracle reputation show --org-id your-org-123

# Output:
📊 Reputation Details

  Organization ID: your-org-123
  Reputation Score: 0.850 ✨
  Consistency Score: 0.923
  Stake Pledge: $5,000
  Stake Status: Active
  Contribution Count: 50
  Age Score: 0.800
  Volume Score: 0.650
  Last Updated: 2026-02-04T02:00:00.000Z

🔢 Contribution Weight Breakdown:
  Final Weight: 1.246
  Base Reputation: 0.850
  Stake Multiplier: 0.200
  Consistency Bonus: 0.085  ← Derived from consistency score
```

### Calculate Consistency

```bash
oracle reputation calculate-consistency --org-id your-org-123 --mock-data

# Output:
🎯 Calculating Consistency Score

✓ Consistency Score: 0.923 (92.3%)

📈 Metrics:
  Rules Contributed: 15
  Contributions Considered: 18
  Average Deviation: 4.50%
  Deviation Std Dev: 3.20%
  Outliers Detected: 1
  Last Contribution: 2/1/2026
  Oldest Contribution Age: 87 days

⚠️  Outliers Detected (if any):
    Rule no-any: contributed=0.650, consensus=0.120, deviation=0.530
```

### Update Reputation

```bash
# Update individual organization
oracle reputation update --org-id your-org-123 \
  --consistency-score 0.92 \
  --contribution-count 25

# Output:
✏️  Updating Reputation

✓ Reputation updated successfully
```

### List Organizations

```bash
oracle reputation list --min-score 0.7 --sort-by consistency --limit 10

# Output:
📋 Organization Reputations

┌────────────────────────┬───────────┬─────────────┬────────┬──────────┬────────┐
│ Org ID                 │ Rep Score │ Consistency │ Stake  │ Contribs │ Status │
├────────────────────────┼───────────┼─────────────┼────────┼──────────┼────────┤
│ org-excellent          │ 0.950     │ 0.980       │ $10,000│ 100      │ Active │
│ org-good               │ 0.850     │ 0.923       │ $5,000 │ 50       │ Active │
│ org-average            │ 0.720     │ 0.750       │ $2,000 │ 25       │ Active │
└────────────────────────┴───────────┴─────────────┴────────┴──────────┴────────┘
```

## Best Practices

### For Contributors

1. **Submit Accurate Data**: Report true FP rates from your codebase
2. **Contribute Regularly**: Consistency score improves with more data points
3. **Investigate Outliers**: If flagged as outlier, investigate why your rates differ
4. **Avoid Gaming**: Attempting to match consensus without accurate data will be detected over time

### For Operators

1. **Monitor Outlier Rates**: High outlier rates across network indicate potential attack
2. **Tune Thresholds**: Adjust `outlierThreshold` based on network characteristics
3. **Review Flagged Orgs**: Manually investigate organizations with consistently low consistency
4. **Gradual Rollout**: Start with low `maxConsistencyBonus`, increase as confidence grows

### For Auditors

1. **Track Consistency Trends**: Monitor how consistency scores change over time
2. **Analyze Outlier Patterns**: Look for collusion (multiple orgs with same outlier pattern)
3. **Validate Consensus**: Ensure consensus FP rates are reasonable for each rule
4. **Cold Start Monitoring**: Track how new orgs' consistency evolves after initial contributions

## Troubleshooting

### "Insufficient data for reliable consistency score"

**Cause**: Organization has fewer than `minContributionsRequired` contributions.

**Solution**: Continue contributing FP data. After 3+ contributions, score will be calculated.

### "Consistency score unexpectedly low"

**Possible Causes:**
- Your FP rates genuinely differ from network consensus (different codebase characteristics)
- Bug in FP detection causing incorrect rates
- Network consensus is skewed by Byzantine actors

**Investigation Steps:**

```bash
# Check your contribution details
oracle reputation calculate-consistency --org-id your-org-123 --mock-data

# Compare your rates to consensus for specific rules
oracle reputation show --org-id your-org-123 --verbose

# Review your reputation history
oracle reputation list --min-score 0.0
```

### "Flagged as outlier for specific rule"

**Cause**: Your contributed FP rate deviates significantly from consensus (> 30%).

**Actions:**
1. **Validate your data**: Ensure FP events are correctly detected
2. **Check rule configuration**: Your linter settings may differ from network
3. **Accept legitimate difference**: If accurate, contribute more data to establish pattern
4. **Report bug**: If you believe consensus is wrong, report to Phase Mirror team

### "Consistency score not updating"

**Possible Causes:**
- Contributions are older than `maxContributionAge` (180 days)
- Calibration not running (consensus not being calculated)
- Bug in consistency score calculator

**Debugging:**

```bash
# Check when last contribution was made
oracle reputation show --org-id your-org-123

# Verify reputation updates are working
oracle reputation update --org-id your-org-123 --consistency-score 0.85

# Check test data with mock contributions
oracle reputation calculate-consistency --org-id your-org-123 --mock-data
```

## Security Considerations

### Byzantine Fault Tolerance

Consistency scoring provides BFT properties:

- **Minority Attack**: Small number of malicious orgs cannot significantly skew consensus
- **Collusion Resistance**: Colluding orgs detected as outliers, downweighted
- **Self-Healing**: Feedback loop gradually excludes bad actors from influence
- **No Identity Linking**: Consensus calculated at aggregate level (preserves k-anonymity)

### Privacy Preservation

Consistency scoring does not compromise k-anonymity:

- Organization IDs hashed before aggregation (`orgIdHash`)
- Consensus calculated over aggregated data (no individual rates exposed)
- Consistency score measured per org, but comparison is against anonymous consensus
- No org can determine which other orgs contributed to consensus

### Attack Vectors

**Gradual Poisoning:**
- **Attack**: Start with accurate data to build consistency, then gradually submit false data
- **Defense**: Time decay ensures recent contributions matter most; gradual shift detected

**Consensus Manipulation:**
- **Attack**: Coordinate multiple orgs to submit same false rate, become new consensus
- **Defense**: Requires majority of network weight (difficult with stake requirements + verification)

**Outlier Flooding:**
- **Attack**: Submit many outlier contributions to desensitize outlier detection
- **Defense**: Outliers reduce consistency score, reducing future influence

## FAQ

**Q: Does consistency scoring mean I must always match consensus?**

A: No. Legitimate differences in codebase characteristics will result in different FP rates. Consistency scoring measures typical alignment, not perfect matching. Occasional outliers are acceptable.

**Q: What if consensus is wrong?**

A: If your data is accurate and consistently differs, continue contributing. Over time, if your perspective is valid, it will influence consensus. Minority perspectives are downweighted but not excluded.

**Q: Can I see other organizations' consistency scores?**

A: No. Consistency scores are private to each organization. You can only see your own score and aggregate network statistics.

**Q: How quickly does consistency score adapt to new behavior?**

A: With default settings (~70-day half-life), significant changes are detectable within 2-3 months. Recent contributions have disproportionate impact.

**Q: What's a "good" consistency score?**

A: 0.80+ is good, 0.90+ is excellent, 0.50 is neutral (new orgs), <0.40 indicates potential issues.

**Q: Can I opt out of consistency scoring?**

A: No. Consistency scoring is fundamental to Byzantine fault tolerance. However, you can choose not to contribute FP data.

## Support

For consistency scoring questions:

- **GitHub Issues**: https://github.com/MultiplicityFoundation/Phase-Mirror/issues
- **Email**: support@phasemirror.com
- **Low consistency score investigation**: reputation@phasemirror.com

---

## See Also

- [Reputation Engine Documentation](../../packages/mirror-dissonance/src/trust/CONSISTENCY_SCORING.md)
- [CLI Reputation Commands](../../packages/cli/docs/REPUTATION_COMMANDS.md)
- [Trust Module Overview](../../packages/mirror-dissonance/src/trust/README.md)
- [Byzantine Fault Tolerance](./byzantine-fault-tolerance.md)
