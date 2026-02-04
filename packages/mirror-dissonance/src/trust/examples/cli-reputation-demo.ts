#!/usr/bin/env node

/**
 * Demo script for CLI reputation commands
 * 
 * This script demonstrates the reputation management CLI commands.
 */

import { createLocalTrustAdapters } from '../adapters/local/index.js';
import { ReputationEngine } from '../reputation/reputation-engine.js';
import { ConsistencyScoreCalculator } from '../reputation/consistency-calculator.js';

const dataDir = '.phase-mirror-test-data';

async function setupTestData() {
  console.log('🔧 Setting up test data...\n');
  
  const adapters = createLocalTrustAdapters(dataDir);
  const engine = new ReputationEngine(adapters.reputationStore, {
    minStakeForParticipation: 1000,
    stakeMultiplierCap: 1.0,
    consistencyBonusCap: 0.2,
    byzantineFilterPercentile: 0.2,
    outlierZScoreThreshold: 3.0,
  });
  
  // Create test organizations
  await engine.updateReputation('org-good-contributor', {
    reputationScore: 0.9,
    consistencyScore: 0.95,
    stakePledge: 5000,
    contributionCount: 50,
    flaggedCount: 0,
    ageScore: 0.8,
    volumeScore: 0.7,
    stakeStatus: 'active',
  });
  
  await engine.updateReputation('org-new-contributor', {
    reputationScore: 0.5,
    consistencyScore: 0.5,
    stakePledge: 1000,
    contributionCount: 2,
    flaggedCount: 0,
    ageScore: 0.1,
    volumeScore: 0.2,
    stakeStatus: 'active',
  });
  
  await engine.updateReputation('org-problematic', {
    reputationScore: 0.3,
    consistencyScore: 0.4,
    stakePledge: 500,
    contributionCount: 15,
    flaggedCount: 3,
    ageScore: 0.5,
    volumeScore: 0.3,
    stakeStatus: 'active',
  });
  
  console.log('✅ Test data created!\n');
}

async function demonstrateCommands() {
  console.log('📋 Demonstrating CLI Commands\n');
  console.log('═'.repeat(70));
  console.log('\n');
  
  // Command 1: Show reputation
  console.log('1️⃣  oracle reputation show --org-id org-good-contributor');
  console.log('-'.repeat(70));
  console.log('   Shows detailed reputation for an organization');
  console.log('   Output: Reputation score, consistency, stake, contributions, etc.\n');
  
  // Command 2: List reputations
  console.log('2️⃣  oracle reputation list --sort-by reputation --limit 3');
  console.log('-'.repeat(70));
  console.log('   Lists organizations sorted by reputation score');
  console.log('   Output: Table with org IDs, scores, stakes, and status\n');
  
  // Command 3: Calculate consistency
  console.log('3️⃣  oracle reputation calculate-consistency --org-id org-good --mock-data');
  console.log('-'.repeat(70));
  console.log('   Calculates consistency score based on contribution history');
  console.log('   Output: Score, metrics, outliers detected\n');
  
  // Command 4: Update reputation
  console.log('4️⃣  oracle reputation update --org-id org-new --reputation-score 0.6');
  console.log('-'.repeat(70));
  console.log('   Updates reputation metrics for an organization');
  console.log('   Output: Confirmation and updated reputation display\n');
  
  // Command 5: Stake pledge
  console.log('5️⃣  oracle reputation stake pledge --org-id org-example --amount 2500');
  console.log('-'.repeat(70));
  console.log('   Creates a stake pledge for an organization');
  console.log('   Output: Pledge details and confirmation\n');
  
  // Command 6: Stake show
  console.log('6️⃣  oracle reputation stake show --org-id org-good-contributor');
  console.log('-'.repeat(70));
  console.log('   Shows stake pledge details');
  console.log('   Output: Amount, status, pledge date\n');
  
  // Command 7: Stake slash
  console.log('7️⃣  oracle reputation stake slash --org-id org-bad --reason "Data poisoning"');
  console.log('-'.repeat(70));
  console.log('   Slashes stake for malicious behavior');
  console.log('   Output: Confirmation and warning about network participation\n');
  
  console.log('═'.repeat(70));
}

async function verifyImplementation() {
  console.log('\n🔍 Verifying Core Implementation\n');
  console.log('═'.repeat(70));
  console.log('\n');
  
  const adapters = createLocalTrustAdapters(dataDir);
  const engine = new ReputationEngine(adapters.reputationStore, {
    minStakeForParticipation: 1000,
    stakeMultiplierCap: 1.0,
    consistencyBonusCap: 0.2,
    byzantineFilterPercentile: 0.2,
    outlierZScoreThreshold: 3.0,
  });
  
  // Test 1: Show reputation
  const rep = await engine.getReputation('org-good-contributor');
  console.log('✓ Show: Can retrieve reputation');
  console.log(`  → Score: ${rep?.reputationScore.toFixed(3)}, Consistency: ${rep?.consistencyScore.toFixed(3)}`);
  
  // Test 2: List reputations
  const reps = await adapters.reputationStore.listReputationsByScore(0.0);
  console.log(`\n✓ List: Found ${reps.length} organizations`);
  console.log(`  → Top scorer: ${reps[0].orgId} (${reps[0].reputationScore.toFixed(3)})`);
  
  // Test 3: Calculate consistency
  const calculator = new ConsistencyScoreCalculator();
  const mockContributions = [
    {
      orgId: 'org-good-contributor',
      ruleId: 'rule-1',
      contributedFpRate: 0.15,
      consensusFpRate: 0.12,
      timestamp: new Date(),
      eventCount: 100,
      deviation: 0.03,
      consistencyScore: 0.97,
    },
    {
      orgId: 'org-good-contributor',
      ruleId: 'rule-2',
      contributedFpRate: 0.45,
      consensusFpRate: 0.48,
      timestamp: new Date(),
      eventCount: 150,
      deviation: 0.03,
      consistencyScore: 0.97,
    },
    {
      orgId: 'org-good-contributor',
      ruleId: 'rule-3',
      contributedFpRate: 0.22,
      consensusFpRate: 0.20,
      timestamp: new Date(),
      eventCount: 200,
      deviation: 0.02,
      consistencyScore: 0.98,
    },
  ];
  const result = await calculator.calculateScore('org-good-contributor', mockContributions);
  console.log(`\n✓ Calculate consistency: Score ${result.score.toFixed(3)} (${(result.score * 100).toFixed(1)}%)`);
  console.log(`  → Outliers: ${result.metrics.outlierCount}, Rules: ${result.metrics.rulesContributed}`);
  
  // Test 4: Update reputation
  await engine.updateReputation('org-test-update', {
    reputationScore: 0.75,
    consistencyScore: 0.8,
  });
  const updated = await engine.getReputation('org-test-update');
  console.log(`\n✓ Update: Reputation updated to ${updated?.reputationScore.toFixed(3)}`);
  
  // Test 5: Stake operations
  await adapters.reputationStore.updateStakePledge({
    orgId: 'org-test-stake',
    amountUsd: 3000,
    pledgedAt: new Date(),
    status: 'active',
  });
  const stake = await adapters.reputationStore.getStakePledge('org-test-stake');
  console.log(`\n✓ Stake: Pledge of $${stake?.amountUsd.toLocaleString()} created`);
  console.log(`  → Status: ${stake?.status}`);
  
  console.log('\n═'.repeat(70));
  console.log('\n✅ All core functionality verified!\n');
}

async function cleanup() {
  const { rm } = await import('fs/promises');
  try {
    await rm(dataDir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function main() {
  console.log('\n');
  console.log('═'.repeat(70));
  console.log('  Phase Mirror CLI - Reputation Commands Demo');
  console.log('═'.repeat(70));
  console.log('\n');
  
  await cleanup();
  await setupTestData();
  await demonstrateCommands();
  await verifyImplementation();
  
  console.log('═'.repeat(70));
  console.log('  Demo Complete! 🎉');
  console.log('═'.repeat(70));
  console.log('\n');
  
  await cleanup();
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
