# Byzantine Filter Integration Guide

## Overview

This guide explains how to integrate the Byzantine Filter into Phase Mirror's FP calibration system. The Byzantine Filter provides fault tolerance by filtering out statistical outliers and low-reputation contributors before calculating consensus FP rates.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│           Complete FP Calibration with Byzantine Filtering             │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. Organizations submit FP data with bound nonces                    │
│     ↓                                                                  │
│  2. FpStore validates nonce bindings (Trust Layer 1: Identity)        │
│     ↓                                                                  │
│  3. FP events stored with orgIdHash (k-anonymity preserved)           │
│     ↓                                                                  │
│  4. CalibrationStore.aggregateFPsByRule(ruleId) triggered             │
│     ↓                                                                  │
│  5. Fetch contribution weights from ReputationEngine                  │
│     (Trust Layer 2: Reputation + Consistency + Stake)                 │
│     ↓                                                                  │
│  6. ByzantineFilter.filterContributors():                             │
│     a. Calculate FP rates per organization                            │
│     b. Compute Z-scores for each rate                                 │
│     c. Filter outliers (|Z| > threshold)                              │
│     d. Filter bottom percentile by reputation weight                  │
│     ↓                                                                  │
│  7. ByzantineFilter.calculateWeightedConsensus():                     │
│     a. Only include filtered (trusted) contributors                   │
│     b. Weight by reputation score                                     │
│     c. Return consensus FP rate                                       │
│     ↓                                                                  │
│  8. Update consistency scores for all contributors                    │
│     (Feedback loop: good actors → higher weight → more influence)     │
│     ↓                                                                  │
│  9. Store calibration result                                          │
│     ↓                                                                  │
│ 10. Return CalibrationResult with confidence metrics                  │
│                                                                        │
└───────────────────────────────────────────────────────────────────────┘
```

## Installation

The Byzantine Filter is part of the trust module:

```typescript
import { 
  ByzantineFilter,
  ByzantineFilterConfig,
  RawContribution,
  ContributionWeight 
} from '@mirror-dissonance/trust';
```

## Configuration

### Default Configuration

```typescript
const defaultConfig: ByzantineFilterConfig = {
  zScoreThreshold: 3.0,              // 99.7% confidence interval
  byzantineFilterPercentile: 0.2,    // Exclude bottom 20%
  minContributorsForFiltering: 5,    // Need 5+ for statistics
  requireStake: false,               // Don't require stake by default
  requireMinimumReputation: true,    // Require minimum rep
  minimumReputationScore: 0.1,       // 10% minimum
};
```

### Custom Configuration

```typescript
const filter = new ByzantineFilter({
  zScoreThreshold: 2.5,              // More aggressive filtering
  byzantineFilterPercentile: 0.3,    // Exclude bottom 30%
  requireStake: true,                // Require economic stake
  minimumReputationScore: 0.2,       // Higher minimum (20%)
});
```

## Usage Example

### Basic Usage

```typescript
import { ByzantineFilter, RawContribution, ContributionWeight } from '@mirror-dissonance/trust';

// Step 1: Prepare contribution data
const contributions: RawContribution[] = [
  { orgIdHash: 'org1_hash', fpRate: 0.05, eventCount: 100 },
  { orgIdHash: 'org2_hash', fpRate: 0.06, eventCount: 150 },
  { orgIdHash: 'org3_hash', fpRate: 0.95, eventCount: 50 },  // Outlier
];

// Step 2: Get reputation weights
const weights = new Map<string, ContributionWeight>([
  ['org1_hash', { 
    orgId: 'org1', 
    weight: 0.8, 
    factors: { 
      baseReputation: 0.7, 
      stakeMultiplier: 0.05, 
      consistencyBonus: 0.05 
    } 
  }],
  ['org2_hash', { 
    orgId: 'org2', 
    weight: 0.75, 
    factors: { 
      baseReputation: 0.7, 
      stakeMultiplier: 0.0, 
      consistencyBonus: 0.05 
    } 
  }],
  ['org3_hash', { 
    orgId: 'org3', 
    weight: 0.3, 
    factors: { 
      baseReputation: 0.3, 
      stakeMultiplier: 0.0, 
      consistencyBonus: 0.0 
    } 
  }],
]);

// Step 3: Create filter and apply
const filter = new ByzantineFilter();
const result = await filter.filterContributors(contributions, weights);

// Step 4: Calculate consensus
const consensusFpRate = filter.calculateWeightedConsensus(result.trustedContributors);

// Step 5: Examine results
console.log('Trusted contributors:', result.trustedCount);
console.log('Filtered as outliers:', result.outlierFiltered.length);
console.log('Filtered by reputation:', result.reputationFiltered.length);
console.log('Filter rate:', result.filterRate);
console.log('Consensus FP rate:', consensusFpRate);
```

### Integration with CalibrationStore

```typescript
import { DynamoDBCalibrationStore } from '@mirror-dissonance/calibration-store';
import { ReputationEngine } from '@mirror-dissonance/trust';
import { ByzantineFilter } from '@mirror-dissonance/trust';

class ByzantineAwareCalibrationStore extends DynamoDBCalibrationStore {
  constructor(
    config: CalibrationStoreConfig,
    private reputationEngine: ReputationEngine,
    private byzantineFilter: ByzantineFilter
  ) {
    super(config);
  }

  async aggregateFPsByRuleWithByzantineFiltering(ruleId: string) {
    // Step 1: Get raw FP data
    const items = await this.getRawFPData(ruleId);
    
    // Step 2: Calculate FP rates per org
    const contributions = this.calculateOrgFPRates(items);
    
    // Step 3: Get reputation weights
    const weights = await this.getReputationWeights(contributions);
    
    // Step 4: Apply Byzantine filtering
    const filterResult = await this.byzantineFilter.filterContributors(
      contributions, 
      weights
    );
    
    // Step 5: Calculate consensus
    const consensusFpRate = this.byzantineFilter.calculateWeightedConsensus(
      filterResult.trustedContributors
    );
    
    // Step 6: Build result
    return {
      ruleId,
      consensusFpRate,
      trustedContributorCount: filterResult.trustedCount,
      totalContributorCount: filterResult.totalContributors,
      totalEventCount: items.length,
      calculatedAt: new Date(),
      confidence: this.calculateConfidence(filterResult),
      byzantineFilterSummary: {
        filteringApplied: true,
        filterRate: filterResult.filterRate,
        outliersFiltered: filterResult.outlierFiltered.length,
        lowReputationFiltered: filterResult.reputationFiltered.length,
        zScoreThreshold: this.byzantineFilter.config.zScoreThreshold,
        reputationPercentile: this.byzantineFilter.config.byzantineFilterPercentile,
      },
    };
  }

  private async getReputationWeights(
    contributions: RawContribution[]
  ): Promise<Map<string, ContributionWeight>> {
    const weights = new Map();
    
    for (const contrib of contributions) {
      const weight = await this.reputationEngine.calculateContributionWeight(
        contrib.orgIdHash
      );
      weights.set(contrib.orgIdHash, weight);
    }
    
    return weights;
  }

  private calculateOrgFPRates(items: any[]): RawContribution[] {
    const orgStats = new Map<string, { fpCount: number; totalCount: number }>();
    
    // Aggregate by org
    for (const item of items) {
      if (!orgStats.has(item.orgIdHash)) {
        orgStats.set(item.orgIdHash, { fpCount: 0, totalCount: 0 });
      }
      const stats = orgStats.get(item.orgIdHash)!;
      stats.totalCount++;
      if (item.context?.isFalsePositive) {
        stats.fpCount++;
      }
    }
    
    // Calculate rates
    return Array.from(orgStats.entries()).map(([orgIdHash, stats]) => ({
      orgIdHash,
      fpRate: stats.totalCount > 0 ? stats.fpCount / stats.totalCount : 0,
      eventCount: stats.totalCount,
    }));
  }

  private calculateConfidence(filterResult: ByzantineFilterResult): CalibrationConfidence {
    const contributorCountFactor = Math.min(filterResult.trustedCount / 10, 1.0);
    const agreementFactor = 1 - Math.min(filterResult.statistics.stdDevFpRate * 10, 1.0);
    const eventCountFactor = Math.min(
      filterResult.trustedContributors.reduce((sum, c) => sum + c.eventCount, 0) / 1000,
      1.0
    );
    const reputationFactor = filterResult.statistics.meanWeight;
    
    const level = (contributorCountFactor + agreementFactor + eventCountFactor + reputationFactor) / 4;
    
    let category: 'high' | 'medium' | 'low' | 'insufficient';
    if (level >= 0.7) category = 'high';
    else if (level >= 0.5) category = 'medium';
    else if (level >= 0.3) category = 'low';
    else category = 'insufficient';
    
    return {
      level,
      category,
      factors: {
        contributorCountFactor,
        agreementFactor,
        eventCountFactor,
        reputationFactor,
      },
      lowConfidenceReason: category === 'low' || category === 'insufficient' 
        ? `Insufficient data: ${filterResult.trustedCount} contributors`
        : undefined,
    };
  }
}
```

## Filtering Stages

The Byzantine Filter applies filtering in multiple stages:

### Stage 1: Missing Weight Check

Filters out contributors with no reputation weight data.

```typescript
// Filtered as 'insufficient_data'
if (!weights.has(contrib.orgIdHash)) {
  // Filter out
}
```

### Stage 2: Minimum Reputation Check

Filters out contributors below minimum reputation threshold.

```typescript
// Filtered as 'below_minimum_reputation'
if (weight.weight < config.minimumReputationScore) {
  // Filter out
}
```

### Stage 3: Stake Requirement Check (Optional)

Optionally filters out contributors with no economic stake.

```typescript
// Filtered as 'no_stake'
if (config.requireStake && weight.factors.stakeMultiplier === 0) {
  // Filter out
}
```

### Stage 4: Statistical Outlier Detection

Filters out contributors with extreme FP rates using Z-score analysis.

```typescript
// Filtered as 'statistical_outlier'
const zScore = (fpRate - mean) / stdDev;
if (Math.abs(zScore) > config.zScoreThreshold) {
  // Filter out (default: |Z| > 3.0)
}
```

### Stage 5: Reputation Percentile Filtering

Filters out bottom X% of contributors by reputation weight.

```typescript
// Filtered as 'low_reputation'
const cutoffIndex = Math.floor(contributors.length * config.byzantineFilterPercentile);
if (contributorIndex < cutoffIndex) {
  // Filter out (default: bottom 20%)
}
```

## Mathematical Foundation

### Z-Score Calculation

```
Z(x) = (x - μ) / σ

where:
  x = FP rate for organization
  μ = mean FP rate across all contributors
  σ = standard deviation of FP rates
```

### Weighted Consensus

```
consensus_fp_rate = Σ(weight_i × fp_rate_i) / Σ(weight_i)

where:
  weight_i = baseReputation + stakeMultiplier + consistencyBonus
  fp_rate_i = FP rate for trusted contributor i
```

### Weight Calculation

```
weight = min(baseReputation + stakeMultiplier + consistencyBonus, 1.0)

where:
  baseReputation = reputation.reputationScore (0.0 - 1.0)
  stakeMultiplier = (stakePledge / minStake) × stakeMultiplierCap
  consistencyBonus = consistencyScore × consistencyBonusCap
```

## Security Properties

### Byzantine Fault Tolerance

- **Default Settings**: Tolerates up to ~30% Byzantine actors
- **Aggressive Settings**: Can tolerate up to ~40% with stricter thresholds
- **Conservative Settings**: ~20% with looser thresholds

### Attack Resistance

| Attack Type | Mitigation | Effectiveness |
|------------|-----------|---------------|
| Single high-stake malicious org | Outlier detection | ✅ High |
| Coordinated Sybil attack | Percentile filtering | ✅ High |
| Data poisoning (extreme values) | Z-score filtering | ✅ High |
| Low-reputation spam | Minimum reputation | ✅ High |
| Gradual reputation gaming | Consistency tracking | ✅ Medium |

## Best Practices

### 1. Tune Thresholds Based on Network Size

```typescript
// Small network (<10 orgs): Be more lenient
const smallNetworkFilter = new ByzantineFilter({
  zScoreThreshold: 4.0,
  byzantineFilterPercentile: 0.1,
  minContributorsForFiltering: 3,
});

// Large network (>50 orgs): Be more aggressive
const largeNetworkFilter = new ByzantineFilter({
  zScoreThreshold: 2.5,
  byzantineFilterPercentile: 0.3,
  minContributorsForFiltering: 10,
});
```

### 2. Implement Feedback Loop

Update consistency scores based on filtering results:

```typescript
// After filtering, update consistency scores
for (const trusted of filterResult.trustedContributors) {
  await reputationEngine.updateReputation(trusted.orgIdHash, {
    consistencyScore: Math.min(reputation.consistencyScore + 0.01, 1.0),
  });
}

for (const filtered of filterResult.outlierFiltered) {
  await reputationEngine.updateReputation(filtered.orgIdHash, {
    consistencyScore: Math.max(reputation.consistencyScore - 0.1, 0.0),
    flaggedCount: reputation.flaggedCount + 1,
  });
}
```

### 3. Monitor Filter Rates

```typescript
// Alert if filter rate is too high
if (filterResult.filterRate > 0.5) {
  console.warn('High filter rate:', filterResult.filterRate);
  console.warn('May indicate network attack or misconfiguration');
}

// Alert if no filtering occurs with many contributors
if (filterResult.totalContributors > 20 && filterResult.filterRate === 0) {
  console.warn('No contributors filtered with large network');
  console.warn('May indicate homogeneous attack or threshold too lenient');
}
```

### 4. Provide Transparency

```typescript
// Include filtering details in result
return {
  consensusFpRate,
  byzantineFilterSummary: {
    filteringApplied: true,
    filterRate: filterResult.filterRate,
    outliersFiltered: filterResult.outlierFiltered.length,
    lowReputationFiltered: filterResult.reputationFiltered.length,
    
    // Include filtered org details for transparency
    filteredOrgs: [
      ...filterResult.outlierFiltered.map(f => ({
        orgIdHash: f.orgIdHash,
        reason: f.reason,
        details: f.details,
      })),
    ],
  },
};
```

## Testing

The Byzantine Filter includes comprehensive test coverage:

```bash
# Run Byzantine filter tests
npm test -- --testPathPattern=byzantine-filter

# Run all trust module tests
npm test -- --testPathPattern=trust
```

Test coverage includes:
- ✅ Outlier detection with various Z-scores
- ✅ Reputation percentile filtering
- ✅ Minimum reputation filtering
- ✅ Stake requirement filtering
- ✅ Weighted consensus calculation
- ✅ Edge cases (empty data, zero variance)
- ✅ Statistical calculations

## Troubleshooting

### Issue: Too Many Contributors Filtered

**Symptom**: Filter rate > 50%

**Solutions**:
1. Lower Z-score threshold (e.g., 2.0 → 2.5)
2. Reduce percentile filter (e.g., 0.3 → 0.2)
3. Lower minimum reputation (e.g., 0.2 → 0.1)
4. Disable stake requirement

### Issue: No Contributors Filtered

**Symptom**: Filter rate = 0 with large network

**Solutions**:
1. Increase Z-score threshold (e.g., 3.0 → 2.5)
2. Increase percentile filter (e.g., 0.2 → 0.3)
3. Increase minimum reputation (e.g., 0.1 → 0.2)
4. Enable stake requirement

### Issue: Consensus Rate Seems Wrong

**Symptom**: Consensus FP rate doesn't match expectations

**Solutions**:
1. Check filter statistics: `filterResult.statistics.meanFpRate`
2. Compare pre/post filtering means
3. Examine filtered contributors: `filterResult.outlierFiltered`
4. Verify weight calculations are correct
5. Check for zero-weight contributors

## Performance

- **Time Complexity**: O(n log n) where n = number of contributors
  - O(n) for filtering stages
  - O(n log n) for sorting by weight
  - O(n) for consensus calculation

- **Space Complexity**: O(n)
  - Stores all contributors and their weights
  - Creates filtered result arrays

**Optimization Tips**:
- Cache reputation weights for multiple calibrations
- Batch process multiple rules
- Consider sampling for very large networks (>1000 orgs)

## License

Apache-2.0 - See LICENSE file for details.
