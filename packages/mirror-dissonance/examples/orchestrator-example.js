/**
 * Example: Using the Analysis Orchestrator
 * 
 * This example demonstrates how to use the AnalysisOrchestrator
 * to analyze files in a repository.
 */

import { createOrchestrator } from '../dist/src/oracle.js';

async function analyzeRepository() {
  console.log('='.repeat(60));
  console.log('Analysis Orchestrator Example');
  console.log('='.repeat(60));
  console.log('');

  // Create and initialize the orchestrator
  console.log('Step 1: Initialize orchestrator...');
  const orchestrator = await createOrchestrator({
    // Optional: Configure AWS services for production use
    // awsRegion: 'us-east-1',
    // fpTableName: 'phase-mirror-fp-store',
    // consentTableName: 'phase-mirror-consent',
    // blockCounterTableName: 'phase-mirror-blocks',
    // nonceParameterName: '/phase-mirror/nonce',
    
    // Optional: Enable ADR extraction
    // adrPath: './docs/adr',
  });
  console.log('✓ Orchestrator initialized\n');

  // Define files to analyze
  const filesToAnalyze = [
    'package.json',
    'tsconfig.json',
    'src/oracle.ts',
  ];

  console.log('Step 2: Analyze files...');
  console.log(`Files: ${filesToAnalyze.join(', ')}`);
  console.log('');

  // Run analysis
  const result = await orchestrator.analyze({
    files: filesToAnalyze,
    repository: {
      owner: 'PhaseMirror',
      name: 'Phase-Mirror',
      branch: 'main',
    },
    mode: 'pull_request',
    context: 'Example analysis demonstrating orchestrator usage',
    commitSha: 'example-commit',
  });

  // Display results
  console.log('='.repeat(60));
  console.log('Analysis Results');
  console.log('='.repeat(60));
  console.log('');

  console.log('Artifacts Processed:');
  result.artifacts.forEach(artifact => {
    console.log(`  - ${artifact.path}`);
    console.log(`    Type: ${artifact.type}`);
    console.log(`    Hash: ${artifact.hash.substring(0, 12)}...`);
    console.log(`    Size: ${artifact.content.length} bytes`);
  });
  console.log('');

  console.log('Oracle Decision:');
  console.log(`  Outcome: ${result.machineDecision.outcome.toUpperCase()}`);
  console.log(`  Timestamp: ${result.machineDecision.metadata.timestamp}`);
  console.log(`  Mode: ${result.machineDecision.metadata.mode}`);
  console.log('');

  console.log('Report Summary:');
  console.log(`  Rules Checked: ${result.report.rulesChecked}`);
  console.log(`  Violations Found: ${result.report.violationsFound}`);
  console.log(`  Critical Issues: ${result.report.criticalIssues}`);
  console.log('');

  if (result.violations.length > 0) {
    console.log('Violations:');
    result.violations.forEach(violation => {
      console.log(`  [${violation.severity.toUpperCase()}] ${violation.ruleId}`);
      console.log(`    ${violation.message}`);
    });
    console.log('');
  }

  console.log('Reasons:');
  result.machineDecision.reasons.forEach(reason => {
    console.log(`  - ${reason}`);
  });
  console.log('');

  console.log('='.repeat(60));
  console.log('Full Summary:');
  console.log('='.repeat(60));
  console.log(result.summary);
}

// Run the example
analyzeRepository()
  .then(() => {
    console.log('\n✓ Example completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Example failed:', error);
    process.exit(1);
  });
