# Consistency Score Algorithms Implementation

## Overview

This implementation provides production-ready consistency score algorithms for Phase Mirror's Trust Module, enabling Byzantine fault tolerance through consensus-based reputation scoring.

## Components

### 1. Type Definitions (`types.ts`)

Added comprehensive type definitions for consistency scoring:

- **ContributionRecord**: Tracks an organization's FP rate contribution for a specific rule
- **ConsistencyMetrics**: Aggregated consistency data for an organization
- **ConsistencyScoreConfig**: Configuration for algorithm parameters
- **ConsistencyScoreResult**: Result of consistency score calculation
- **ConsensusFpRate**: Rule-level consensus tracking

### 2. Consistency Score Calculator (`consistency-calculator.ts`)

Core implementation with the following features:

#### Algorithm
1. Filter contributions by age and event count
2. Calculate deviation from consensus for each contribution
3. Apply exponential time decay weighting (recent contributions matter more)
4. Compute weighted average consistency score
5. Detect outliers and compute variance metrics

#### Key Methods

- `calculateScore(orgId, contributions)`: Main scoring method
- `calculateSingleContributionScore(contributed, consensus)`: Per-contribution scoring
- Private helpers for filtering, outlier detection, time weighting, and metrics

#### Configuration Options

```typescript
{
  decayRate: 0.01,              // ~70-day half-life for time decay
  maxContributionAge: 180,      // 6 months maximum age
  minContributionsRequired: 3,  // Minimum data points needed
  outlierThreshold: 0.3,        // 30% deviation = outlier
  minEventCount: 1,             // Minimum events per contribution
  excludeOutliersFromScore: false, // Whether to exclude outliers
  maxConsistencyBonus: 0.2,     // Maximum reputation bonus
}
```

### 3. Comprehensive Test Suite (`consistency-calculator.test.ts`)

16 comprehensive unit tests covering:
- Perfect matches and various deviation scenarios
- Time decay weighting
- Outlier detection and filtering
- Contribution filtering by age and event count
- Edge cases (zero/maximum deviation)
- Insufficient data handling

## Mathematical Foundation

### Consistency Score Formula

```
ConsistencyScore(org) = Σ(weight_i × consistency_i) / Σ(weight_i)

where:
  consistency_i = 1 - min(|org_fp_rate_i - consensus_fp_rate_i|, 1.0)
  weight_i = e^(-λ × age_days_i)  [exponential decay]
  λ = decay rate (default: 0.01 for ~70-day half-life)
```

### Properties

- **Range**: [0.0, 1.0] where 1.0 = perfect consistency
- **Recency bias**: Recent contributions weighted more heavily
- **Bounded deviation**: Maximum penalty for extreme outliers
- **Rule-level granularity**: Measured per rule, aggregated across org

## Security Properties

### Byzantine Fault Tolerance
- Outliers automatically downweighted in consensus calculations
- No single organization can dominate through false data
- Feedback loop rewards consistent contributors

### K-Anonymity Preservation
- Uses aggregated consensus rates (no identity linking)
- Contributions remain anonymous while enabling reputation

### Sybil Resistance
- New organizations start with neutral score (0.5)
- Requires multiple contributions over time to build reputation
- Time decay prevents gaming through old accounts

## Usage Example

```typescript
import { ConsistencyScoreCalculator } from './reputation/consistency-calculator';

// Create calculator with default config
const calculator = new ConsistencyScoreCalculator();

// Calculate score for an organization
const result = await calculator.calculateScore('org-123', contributions);

if (result.hasMinimumData) {
  console.log('Score:', result.score);
  console.log('Outliers:', result.metrics.outlierCount);
  
  // Use score to weight contributions
  const weight = baseWeight * result.score;
}
```

## Integration with Reputation Engine

The consistency score integrates with the existing `ReputationEngine`:

```typescript
const engine = new ReputationEngine(store, config);

// Update organization's consistency score
await engine.updateReputation('org-123', {
  consistencyScore: result.score
});

// Calculate contribution weight (includes consistency bonus)
const weight = await engine.calculateContributionWeight('org-123');
```

## Demo

Run the included demo to see Byzantine fault tolerance in action:

```bash
npx tsx src/trust/examples/consistency-scoring-demo.ts
```

Expected output:
- Good contributor: ~97% consistency score
- Problematic contributor (with outlier): ~77% score
- New contributor: 50% neutral score

## Test Coverage

All 73 tests passing:
- 16 tests for ConsistencyScoreCalculator
- 17 tests for ReputationEngine
- 14 tests for LocalAdapters
- 26 tests for NonceBinding

## Performance Considerations

- **Time Complexity**: O(n) where n is number of contributions
- **Space Complexity**: O(n) for storing contribution records
- **Typical Usage**: Calculated periodically (not per-request)
- **Scale**: Handles thousands of contributions per organization

## Future Enhancements

Potential improvements for future iterations:

1. **Adaptive Thresholds**: Adjust outlier threshold based on rule variance
2. **Multi-Metric Scoring**: Incorporate volume and recency into weighting
3. **Consensus Confidence**: Weight by number of contributors to consensus
4. **Historical Trending**: Track consistency score changes over time
5. **Anomaly Detection**: Advanced ML-based outlier detection

## References

- Blueprint: "Consistency Score Algorithms Blueprint for Phase Mirror Trust Module"
- Integration: `ReputationEngine.calculateContributionWeight()`
- Security: Byzantine Fault Tolerance through consensus-based scoring
