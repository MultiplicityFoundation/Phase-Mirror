# Byzantine Filtering in FP Calibration

## Overview

Byzantine filtering is Phase Mirror's defense mechanism against malicious actors in the FP calibration network. It filters statistical outliers and low-reputation contributors before calculating weighted consensus, ensuring that malicious data cannot poison calibration results.

The Byzantine filtering system provides **multi-layered defense** against various attack vectors, combining statistical analysis, reputation scoring, and economic incentives to maintain the integrity of false positive rate calibration across the network.

## Why Byzantine Filtering?

### Attack Scenarios

Without Byzantine filtering, the calibration network is vulnerable to:

| Attack | Description | Impact |
|--------|-------------|--------|
| **Data Poisoning** | Submit extreme FP rates to skew consensus | Calibration results incorrect, affecting all network users |
| **Sybil Attack** | Create multiple fake orgs to dominate voting | False consensus from attacker-controlled entities |
| **Reputation Gaming** | Build reputation then submit malicious data | Trusted attacker has high weight in consensus |
| **Collusion** | Multiple orgs coordinate false submissions | Coordinated manipulation overwhelming honest participants |

### Defense Mechanisms

Byzantine filtering provides multiple layers of defense:

1. **Statistical Outlier Detection** (Z-score) - Removes extreme values that deviate significantly from the mean
2. **Reputation Percentile Filter** - Excludes bottom 20% by reputation weight
3. **Minimum Reputation Threshold** - Requires minimum reputation score to participate
4. **Optional Stake Requirement** - Requires economic commitment (configurable)
5. **Consistency Scoring** - Tracks historical accuracy and penalizes deviations

Together, these mechanisms create a Byzantine fault-tolerant system that can resist up to ~30% malicious actors.

## How It Works

### Filter Pipeline

The Byzantine filtering system processes contributors through multiple stages:

```
All Contributors
      ↓
[Stage 1: Missing Weight Filter]
      ↓ (orgs without reputation data removed)
[Stage 2: Minimum Reputation Filter]
      ↓ (orgs with rep < 0.1 removed)
[Stage 3: Stake Requirement Filter] (optional)
      ↓ (orgs with no stake removed)
[Stage 4: Statistical Outlier Filter]
      ↓ (orgs with |Z| > 3.0 removed)
[Stage 5: Reputation Percentile Filter]
      ↓ (bottom 20% by weight removed)
Trusted Contributors
      ↓
[Weighted Consensus Calculation]
      ↓
Consensus FP Rate
```

Each stage removes a specific category of potentially problematic contributors, ensuring that only trusted, consistent organizations contribute to the final consensus.

### Statistical Outlier Detection

Uses Z-score to identify contributors whose FP rates deviate significantly from the mean:

```
Z = (x - μ) / σ

where:
  x = contributor's FP rate
  μ = mean FP rate across all contributors
  σ = standard deviation of FP rates
```

**Filtering Rule:** Contributors with |Z| > 3.0 are filtered as outliers.

**Statistical Significance:** The 3.0 threshold corresponds to 99.7% confidence - only extreme outliers beyond 3 standard deviations are removed. This is intentionally conservative to avoid filtering legitimate but unusual data.

**Example:**

```
Contributors: [0.10, 0.12, 0.11, 0.10, 0.11, 0.95]
Mean (μ): 0.248
Std Dev (σ): 0.314

Z-scores:
  0.10: (0.10 - 0.248) / 0.314 = -0.47 ✅ Pass
  0.12: (0.12 - 0.248) / 0.314 = -0.41 ✅ Pass
  0.11: (0.11 - 0.248) / 0.314 = -0.44 ✅ Pass
  0.10: (0.10 - 0.248) / 0.314 = -0.47 ✅ Pass
  0.11: (0.11 - 0.248) / 0.314 = -0.44 ✅ Pass
  0.95: (0.95 - 0.248) / 0.314 = +2.23 ✅ Pass (below threshold)
```

**More extreme example:**

```
Contributors: [0.05, 0.06, 0.05, 0.06, 0.05, 0.99]
Mean (μ): 0.21
Std Dev (σ): 0.37

Z-score for 0.99: (0.99 - 0.21) / 0.37 = +2.11 ✅ Still passes

With tighter clustering:
Contributors: [0.05, 0.05, 0.05, 0.06, 0.05, 0.90]
Mean (μ): 0.127
Std Dev (σ): 0.338

Z-score for 0.90: (0.90 - 0.127) / 0.338 = +2.29 ✅ Still passes
```

**Note:** Z-score filtering with threshold 3.0 only catches **extreme** outliers (99.7% confidence level). For detecting subtle manipulation, the reputation percentile filter and consistency scoring provide additional defense layers.

### Reputation Percentile Filter

After outlier detection, the bottom 20% of contributors by reputation weight are excluded:

```
Example weights sorted: [0.3, 0.5, 0.6, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4]
                         └─────┘
                      Bottom 20% (2 orgs) → Filtered
                                └─────────────────────────────┘
                                Remaining 8 orgs → Trusted
```

**Rationale:** Low-reputation organizations are more likely to be:
- **New** - Insufficient track record to verify consistency
- **Previously flagged** - History of suspicious or inaccurate submissions
- **Poor consistency** - Frequently deviate from network consensus
- **Gaming attempts** - Attempting to manipulate without building real reputation

**Dynamic Adaptation:** As organizations improve consistency and accuracy, their reputation increases, moving them out of the filtered percentile.

### Weighted Consensus Calculation

Trusted contributors' FP rates are combined using reputation-weighted average:

```
consensus = Σ(weight_i × fpRate_i) / Σ(weight_i)

where:
  weight_i = baseReputation × (1 + stakeMultiplier) × (1 + consistencyBonus)
```

**Example Calculation:**

```
Org A: fpRate=0.10, weight=1.2 → contribution = 0.10 × 1.2 = 0.12
Org B: fpRate=0.15, weight=1.0 → contribution = 0.15 × 1.0 = 0.15
Org C: fpRate=0.12, weight=0.8 → contribution = 0.12 × 0.8 = 0.096

consensus = (0.12 + 0.15 + 0.096) / (1.2 + 1.0 + 0.8)
          = 0.366 / 3.0
          = 0.122 (12.2% FP rate)
```

**Weight Factors:**
- **Base Reputation** (0.0-1.0): Core reputation score based on verification and history
- **Stake Multiplier** (0.0-1.0): Economic commitment increases weight up to 100%
- **Consistency Bonus** (0.0-0.2): Accuracy bonus for consistently matching consensus

This ensures that trusted, consistent, and committed organizations have more influence over calibration results.

## Configuration

### Default Settings

```typescript
{
  zScoreThreshold: 3.0,              // Filter outliers beyond ±3 std devs
  byzantineFilterPercentile: 0.2,    // Exclude bottom 20% by reputation
  minContributorsForFiltering: 5,    // Need 5+ orgs for statistical filtering
  requireStake: false,               // Don't require economic stake
  requireMinimumReputation: true,    // Require minimum reputation
  minimumReputationScore: 0.1,       // 10% minimum reputation
}
```

### Tuning Parameters

#### zScoreThreshold

Controls outlier sensitivity:

- **Lower (e.g., 2.0)**: More aggressive filtering, may exclude valid but unusual data
- **Higher (e.g., 4.0)**: More lenient, may include more outliers
- **Recommendation**: `3.0` (99.7% confidence interval, standard statistical practice)

**Trade-offs:**
- Lower threshold: Better protection against subtle attacks, risk of false positives
- Higher threshold: More inclusive, less protection against coordinated attacks

#### byzantineFilterPercentile

Controls reputation cutoff:

- **Lower (e.g., 0.1)**: Only bottom 10% excluded, more inclusive
- **Higher (e.g., 0.3)**: Bottom 30% excluded, more exclusive
- **Recommendation**: `0.2` (balance between inclusivity and security)

**Trade-offs:**
- Lower percentile: More open to new participants, less protection
- Higher percentile: Stronger security, may discourage new contributors

#### minContributorsForFiltering

Minimum contributors required for statistical validity:

- **Lower (e.g., 3)**: Apply filtering with fewer contributors
- **Higher (e.g., 10)**: Require more data before filtering
- **Recommendation**: `5` (statistical minimum for meaningful Z-scores)

**Rationale:** Standard deviations are unreliable with very small sample sizes. Five contributors provides sufficient data for basic statistical analysis.

#### requireStake

Economic commitment requirement:

- **`false` (default)**: All verified orgs can participate
- **`true`**: Only orgs with stake can participate (higher security)
- **Recommendation**: 
  - `false` for open-core deployments (maximize participation)
  - `true` for enterprise deployments (maximize security)

**Impact:** Requiring stake adds economic disincentive for malicious behavior but may reduce overall participation.

## Confidence Metrics

Calibration results include confidence metrics based on four independent factors:

| Factor | Weight | Description |
|--------|--------|-------------|
| **Contributor Count** | 35% | More contributors = higher confidence |
| **Agreement** | 30% | Lower variance = higher confidence |
| **Event Count** | 20% | More FP events = higher confidence |
| **Reputation** | 15% | Higher avg reputation = higher confidence |

### Confidence Categories

| Category | Range | Description | Usage Recommendation |
|----------|-------|-------------|---------------------|
| **High** | ≥70% | Reliable result, sufficient data | Safe for production use |
| **Medium** | 50-69% | Reasonable result, some uncertainty | Use with monitoring |
| **Low** | 30-49% | Use with caution | Manual review recommended |
| **Insufficient** | <30% or <3 contributors | Not reliable | Do not use |

### Confidence Calculation

```typescript
confidence = (
  contributorCountFactor * 0.35 +
  agreementFactor * 0.30 +
  eventCountFactor * 0.20 +
  reputationFactor * 0.15
)

where:
  contributorCountFactor = min(trustedCount / 20, 1.0)
  agreementFactor = max(0, 1.0 - coefficientOfVariation)
  eventCountFactor = min(totalEvents / 1000, 1.0)
  reputationFactor = averageReputationWeight
```

## CLI Commands

### Aggregate Single Rule

Aggregate FPs for a specific rule with Byzantine filtering:

```bash
oracle calibration aggregate --rule-id no-unused-vars
```

**Output:**
```
✓ Calibration complete

Calibration Result
────────────────────────────────────────────────────────────
Rule ID:              no-unused-vars
Consensus FP Rate:    12.45%
Confidence:           ● High (85.3%)

Contributors
────────────────────────────────────────────────────────────
Trusted Contributors: 8
Total Contributors:   10
Total Events:         1247
Calculated At:        2026-02-04T03:03:52.719Z

Byzantine Filtering
────────────────────────────────────────────────────────────
Filter Rate:          20.0%
Outliers Filtered:    1
Low Reputation:       1
Z-Score Threshold:    3.0
Reputation Percentile: 20%
```

**Verbose mode** (shows confidence factor breakdown):

```bash
oracle calibration aggregate --rule-id no-unused-vars -v
```

**Additional output:**
```
Confidence Factors
────────────────────────────────────────────────────────────
Contributor Count:    90.0%
Agreement:            85.0%
Event Count:          82.0%
Reputation:           84.5%
```

### List All Results

List all calibration results with filtering:

```bash
oracle calibration list
```

**Output:**
```
✓ Found 5 calibration results

┌─────────────────┬──────────────────┬────────────┬──────────────┬────────┐
│ Rule ID         │ Consensus FP Rate│ Confidence │ Contributors │ Events │
├─────────────────┼──────────────────┼────────────┼──────────────┼────────┤
│ no-unused-vars  │ 12.45%          │ ● High     │ 8/10         │ 1247   │
│ no-console      │ 8.23%           │ ● High     │ 15/18        │ 2134   │
│ prefer-const    │ 5.67%           │ ● Medium   │ 6/10         │ 543    │
└─────────────────┴──────────────────┴────────────┴──────────────┴────────┘
```

**Filter by confidence:**

```bash
oracle calibration list --min-confidence medium
```

### Show Detailed Result

Show detailed calibration result for a specific rule:

```bash
oracle calibration show --rule-id no-unused-vars
```

**Output:**
```
═══════════════════════════════════════════════════════════
  Calibration Result Details
═══════════════════════════════════════════════════════════

Basic Information
────────────────────────────────────────────────────────────
Rule ID:              no-unused-vars
Consensus FP Rate:    12.45%
Calculated At:        2026-02-04T03:03:52.719Z

Contributors
────────────────────────────────────────────────────────────
Trusted:              8
Total:                10
Total Events:         1247

Confidence Metrics
────────────────────────────────────────────────────────────
Overall:              ● High (85.3%)

  Factors:
  Contributor Count:  90.0%
  Agreement:          85.0%
  Event Count:        82.0%
  Reputation:         84.5%

Byzantine Filtering
────────────────────────────────────────────────────────────
Applied:              Yes
Filter Rate:          20.0%
Outliers Filtered:    1
Low Reputation:       1

  Configuration:
  Z-Score Threshold:  3.0
  Reputation %ile:    20%

═══════════════════════════════════════════════════════════
```

**JSON output:**

```bash
oracle calibration show --rule-id no-unused-vars -f json
```

### Show Network Statistics

Show aggregate statistics across all calibrations:

```bash
oracle calibration stats
```

**Output:**
```
═══════════════════════════════════════════════════════════
  Network Calibration Statistics
═══════════════════════════════════════════════════════════

Overview
────────────────────────────────────────────────────────────
Total Rules Calibrated:    15
Average Confidence:        78.5%
Average FP Rate:           9.34%

Confidence Distribution
────────────────────────────────────────────────────────────
High:                      10 (66.7%)
Medium:                    4 (26.7%)
Low:                       1 (6.7%)
Insufficient:              0 (0.0%)

Contributors
────────────────────────────────────────────────────────────
Total Contributors:        123
Average per Rule:          8.2

Events
────────────────────────────────────────────────────────────
Total Events:              18,432
Average per Rule:          1,228.8

Byzantine Filtering
────────────────────────────────────────────────────────────
Rules with Filtering:      13 (86.7%)
Average Filter Rate:       22.3%

═══════════════════════════════════════════════════════════
```

## Security Analysis

### Byzantine Fault Tolerance

With default settings (20% reputation filter + 3.0 Z-score threshold), the system tolerates:

- **Up to ~30% malicious actors** - Bottom 20% filtered by reputation, plus additional filtering by Z-score
- **Coordinated attacks** - Colluding orgs share reputation penalty, eventually filtered
- **New account attacks** - New orgs start with 0.5 reputation, below threshold for significant influence
- **Gradual manipulation** - Consistency scoring detects slow reputation gaming

### Attack Resistance Matrix

| Attack Type | Defense Mechanism | Effectiveness |
|------------|-------------------|---------------|
| Single org poisoning | Z-score filter | **High** - Extreme values filtered |
| Multiple org poisoning | Reputation filter | **High** - Low-rep orgs filtered |
| Gradual reputation gaming | Consistency scoring | **Medium** - Eventual detection |
| Sybil attack | Identity verification | **High** - GitHub/Stripe required |
| Stake manipulation | Stake slashing | **High** - Malicious stake forfeited |
| Coordinated small deviations | Weighted consensus | **Medium** - Diluted by honest majority |

### Security Assumptions

The Byzantine filtering system assumes:

1. **Identity verification works** - GitHub/Stripe verification prevents trivial Sybil attacks
2. **Honest majority** - >50% of network participants are honest
3. **Reputation is meaningful** - Historical consistency predicts future behavior
4. **Economic rationality** - Stake requirements deter malicious behavior

### Limitations

1. **Slow adaptation** - New legitimate orgs need time to build reputation
2. **Majority attack** - If >50% of network is malicious with high reputation, defense fails
3. **Subtle manipulation** - Small coordinated deviations within Z-score threshold may pass
4. **Cold start** - New rules have no calibration until sufficient contributor data
5. **Reputation lock-in** - High-reputation orgs may have excessive influence

## Best Practices

### For Network Operators

1. **Monitor filter rates**
   - High filter rates (>40%) may indicate attack or misconfiguration
   - Track trends over time to detect anomalies

2. **Review filtered organizations**
   - Periodically audit why organizations are being filtered
   - Investigate patterns in filtering (e.g., all new orgs filtered)

3. **Adjust thresholds based on network characteristics**
   - More established networks can use stricter filtering
   - Growing networks may need more lenient settings

4. **Set confidence requirements**
   - Only use high-confidence calibrations in production
   - Implement fallback strategies for low-confidence rules

5. **Regular security audits**
   - Review calibration stability over time
   - Check for coordinated filtering patterns
   - Validate sample calibrations manually

### For Contributors

1. **Maintain reputation**
   - Submit consistent, accurate FP data
   - Avoid submitting data that differs significantly from peers

2. **Stake if possible**
   - Economic stake increases contribution weight
   - Demonstrates commitment to network integrity

3. **Investigate if filtered**
   - If consistently filtered, investigate why your data differs
   - Contact support if you believe filtering is incorrect

4. **Report issues**
   - Report bugs in calibration that affect your contributions
   - Provide feedback on filtering behavior

5. **Build history gradually**
   - New organizations should expect limited initial influence
   - Focus on consistency to build reputation over time

### For Auditors

1. **Track consensus stability**
   - Sudden shifts in consensus may indicate manipulation
   - Monitor consensus changes across rule updates

2. **Analyze filter patterns**
   - Look for coordinated filtering across multiple rules
   - Check if filtering patterns correlate with events

3. **Validate sample calibrations**
   - Manually verify random calibration results
   - Compare automated results with manual analysis

4. **Monitor reputation distribution**
   - Healthy network has diverse reputation levels
   - Watch for concentration of reputation in few orgs

5. **Review Byzantine filter effectiveness**
   - Track how often filters catch actual malicious actors
   - Assess false positive rate (legitimate orgs filtered)

## FAQ

### Q: Why was my organization filtered?

**A:** Organizations can be filtered for several reasons:

1. **Low reputation** (<0.1 or bottom 20% percentile)
2. **Statistical outlier** (FP rate |Z| > 3.0 from mean)
3. **Missing stake** (if stake is required)
4. **Insufficient data** (contributed to too few calibrations)

Check your reputation score and consistency history. Use the CLI to see specific filtering details:

```bash
oracle calibration show --rule-id <rule-id>
```

### Q: Can I see why a specific calibration result was calculated?

**A:** Yes! Use the detailed show command:

```bash
oracle calibration show --rule-id <rule-id>
```

This shows:
- All trusted contributors
- All filtered contributors with reasons
- Filtering thresholds applied
- Confidence factor breakdown

For JSON output with complete data:

```bash
oracle calibration show --rule-id <rule-id> -f json
```

### Q: What happens if all contributors are filtered?

**A:** The calibration returns:
- `consensusFpRate`: 0
- `confidence.category`: "insufficient"
- `confidence.level`: 0
- `lowConfidenceReason`: "No trusted contributors after filtering"

This indicates manual review is required. The rule should not be used until sufficient trusted contributors provide data.

### Q: How quickly do reputation changes affect filtering?

**A:** **Immediately**. The next calibration aggregation uses current reputation scores. However:

- Reputation changes gradually based on consistency
- Single submissions typically don't dramatically change reputation
- Building reputation takes multiple consistent contributions

### Q: Can I disable Byzantine filtering?

**A:** Not recommended, but you can make it less aggressive:

```typescript
{
  zScoreThreshold: 5.0,              // Very lenient outlier threshold
  byzantineFilterPercentile: 0.05,   // Only filter bottom 5%
  requireMinimumReputation: false,   // No minimum reputation
  minContributorsForFiltering: 100,  // Effectively disable for small networks
}
```

**Warning:** Disabling filtering removes protection against malicious actors.

### Q: How do I improve my organization's reputation?

**A:** Reputation improves through:

1. **Consistency** - Submit FP rates close to consensus
2. **Stake** - Increase economic commitment (if supported)
3. **Verification** - Complete additional verification methods
4. **History** - Contribute to more calibrations over time
5. **Accuracy** - Ensure your FP detection is accurate

Reputation typically improves by 0.01-0.05 per consistent calibration.

### Q: What if legitimate data is consistently filtered as an outlier?

**A:** This could indicate:

1. **Your linting configuration differs** - Check rule configuration matches network
2. **Your codebase is unusual** - Some codebases have legitimately different FP rates
3. **Network consensus is wrong** - Possible if network is small or biased

If you believe your data is correct:
- Document why your FP rate differs
- Contact network operators with evidence
- Request manual review of your contributions
- Consider whether network assumptions match your use case

### Q: How does the consistency bonus work?

**A:** Consistency bonus is calculated per calibration:

```
deviation = |orgFpRate - consensusFpRate|

if deviation < 0.02:  bonus = +0.05
if deviation < 0.05:  bonus = +0.02
if deviation < 0.10:  bonus = +0.01
if deviation > 0.30:  bonus = -0.10  (penalty)
if deviation > 0.20:  bonus = -0.05  (penalty)
```

Over time, consistent contributions build higher reputation, while inconsistent ones reduce it.

## Support

### For Byzantine Filtering Questions

**GitHub Issues:** [https://github.com/MultiplicityFoundation/Phase-Mirror/issues](https://github.com/MultiplicityFoundation/Phase-Mirror/issues)

Tag issues with: `byzantine-filtering`, `calibration`, `trust-module`

### Email Support

**General support:** support@phasemirror.com

**Filtered incorrectly:** calibration@phasemirror.com  
Include: Organization ID, Rule ID, Timestamp, Reason for dispute

**Security issues:** security@phasemirror.com  
For reporting potential attacks or vulnerabilities in Byzantine filtering

### Community

**Discord:** [Phase Mirror Discord](https://discord.gg/phasemirror)  
Channel: `#calibration-support`

**Office Hours:** Every Tuesday 2-3pm PST  
Zoom link in Discord

---

## References

- [Trust Module Overview](./README.md)
- [Nonce Binding Guide](./nonce-binding.md)
- [Reputation Engine Documentation](./reputation-engine.md)
- [CalibrationStore API](../../packages/mirror-dissonance/src/calibration-store/README.md)
- [CLI Commands Guide](../../packages/cli/docs/CALIBRATION_CLI.md)

---

**Last Updated:** 2026-02-04  
**Version:** 1.0  
**Status:** Production Ready
