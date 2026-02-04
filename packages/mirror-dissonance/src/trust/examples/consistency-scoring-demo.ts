/**
 * Example demonstrating the Consistency Score Calculator
 * 
 * This example shows how to use the ConsistencyScoreCalculator to measure
 * how well an organization's false positive contributions align with network consensus.
 */

import { ConsistencyScoreCalculator } from '../reputation/consistency-calculator.js';
import { ContributionRecord } from '../reputation/types.js';

async function demonstrateConsistencyScoring() {
  console.log('='.repeat(70));
  console.log('Consistency Score Calculator Demo');
  console.log('='.repeat(70));
  console.log();

  // Create a calculator with default configuration
  const calculator = new ConsistencyScoreCalculator({
    decayRate: 0.01,              // ~70-day half-life
    maxContributionAge: 180,      // 6 months
    minContributionsRequired: 3,  // Need at least 3 data points
    outlierThreshold: 0.3,        // 30% deviation = outlier
    minEventCount: 1,             // At least 1 event per contribution
    excludeOutliersFromScore: false,
  });

  // Scenario 1: Good contributor with high consistency
  console.log('Scenario 1: Good Contributor (High Consistency)');
  console.log('-'.repeat(70));
  
  const now = Date.now();
  const goodContributions: ContributionRecord[] = [
    {
      orgId: 'org-good',
      ruleId: 'rule-1',
      contributedFpRate: 0.15,
      consensusFpRate: 0.12,     // Close match (3% deviation)
      timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      eventCount: 100,
      deviation: 0,
      consistencyScore: 0,
    },
    {
      orgId: 'org-good',
      ruleId: 'rule-2',
      contributedFpRate: 0.45,
      consensusFpRate: 0.48,     // Close match (3% deviation)
      timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      eventCount: 150,
      deviation: 0,
      consistencyScore: 0,
    },
    {
      orgId: 'org-good',
      ruleId: 'rule-3',
      contributedFpRate: 0.22,
      consensusFpRate: 0.20,     // Close match (2% deviation)
      timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),  // 5 days ago
      eventCount: 200,
      deviation: 0,
      consistencyScore: 0,
    },
  ];

  const goodResult = await calculator.calculateScore('org-good', goodContributions);
  
  console.log(`Organization: org-good`);
  console.log(`Consistency Score: ${goodResult.score.toFixed(3)} (${(goodResult.score * 100).toFixed(1)}%)`);
  console.log(`Has Minimum Data: ${goodResult.hasMinimumData}`);
  console.log(`\nMetrics:`);
  console.log(`  - Rules Contributed: ${goodResult.metrics.rulesContributed}`);
  console.log(`  - Contributions Considered: ${goodResult.metrics.contributionsConsidered}`);
  console.log(`  - Average Deviation: ${(goodResult.metrics.averageDeviation * 100).toFixed(1)}%`);
  console.log(`  - Outliers Detected: ${goodResult.metrics.outlierCount}`);
  console.log();

  // Scenario 2: Bad contributor with one outlier
  console.log('Scenario 2: Problematic Contributor (One Outlier)');
  console.log('-'.repeat(70));
  
  const badContributions: ContributionRecord[] = [
    {
      orgId: 'org-bad',
      ruleId: 'rule-1',
      contributedFpRate: 0.15,
      consensusFpRate: 0.12,     // Close match
      timestamp: new Date(now - 30 * 24 * 60 * 60 * 1000),
      eventCount: 100,
      deviation: 0,
      consistencyScore: 0,
    },
    {
      orgId: 'org-bad',
      ruleId: 'rule-2',
      contributedFpRate: 0.45,
      consensusFpRate: 0.50,     // Close match
      timestamp: new Date(now - 15 * 24 * 60 * 60 * 1000),
      eventCount: 150,
      deviation: 0,
      consistencyScore: 0,
    },
    {
      orgId: 'org-bad',
      ruleId: 'rule-3',
      contributedFpRate: 0.85,
      consensusFpRate: 0.30,     // OUTLIER! 55% deviation
      timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
      eventCount: 200,
      deviation: 0,
      consistencyScore: 0,
    },
  ];

  const badResult = await calculator.calculateScore('org-bad', badContributions);
  
  console.log(`Organization: org-bad`);
  console.log(`Consistency Score: ${badResult.score.toFixed(3)} (${(badResult.score * 100).toFixed(1)}%)`);
  console.log(`Has Minimum Data: ${badResult.hasMinimumData}`);
  console.log(`\nMetrics:`);
  console.log(`  - Rules Contributed: ${badResult.metrics.rulesContributed}`);
  console.log(`  - Contributions Considered: ${badResult.metrics.contributionsConsidered}`);
  console.log(`  - Average Deviation: ${(badResult.metrics.averageDeviation * 100).toFixed(1)}%`);
  console.log(`  - Outliers Detected: ${badResult.metrics.outlierCount}`);
  console.log();

  // Scenario 3: New contributor with insufficient data
  console.log('Scenario 3: New Contributor (Insufficient Data)');
  console.log('-'.repeat(70));
  
  const newContributions: ContributionRecord[] = [
    {
      orgId: 'org-new',
      ruleId: 'rule-1',
      contributedFpRate: 0.15,
      consensusFpRate: 0.12,
      timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000),
      eventCount: 50,
      deviation: 0,
      consistencyScore: 0,
    },
  ];

  const newResult = await calculator.calculateScore('org-new', newContributions);
  
  console.log(`Organization: org-new`);
  console.log(`Consistency Score: ${newResult.score.toFixed(3)} (${(newResult.score * 100).toFixed(1)}%)`);
  console.log(`Has Minimum Data: ${newResult.hasMinimumData}`);
  console.log(`Unreliable Reason: ${newResult.unreliableReason}`);
  console.log();

  // Comparison
  console.log('='.repeat(70));
  console.log('Summary & Byzantine Fault Tolerance Impact');
  console.log('='.repeat(70));
  console.log();
  console.log(`Good Contributor Score:    ${goodResult.score.toFixed(3)} → High weight in aggregation`);
  console.log(`Problematic Contributor:   ${badResult.score.toFixed(3)} → Reduced weight due to outlier`);
  console.log(`New Contributor:           ${newResult.score.toFixed(3)} → Neutral (needs more data)`);
  console.log();
  console.log('The consistency scoring system automatically:');
  console.log('✓ Upweights reliable contributors (good actor)');
  console.log('✓ Downweights outliers (potential attack)');
  console.log('✓ Assigns neutral score to new participants (Sybil resistance)');
  console.log('✓ Maintains k-anonymity (no identity linking)');
  console.log();
}

// Run the demo
demonstrateConsistencyScoring().catch(console.error);
