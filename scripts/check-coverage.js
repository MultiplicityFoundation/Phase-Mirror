#!/usr/bin/env node
/**
 * Enforce coverage thresholds
 */

const fs = require('fs');
const path = require('path');

const THRESHOLD = 80;
const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-summary.json');

if (!fs.existsSync(COVERAGE_FILE)) {
  console.error('❌ Coverage summary not found. Run tests with --coverage first.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
const totals = summary.total;

const metrics = ['lines', 'statements', 'functions', 'branches'];
const failures = [];

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Coverage Threshold Enforcement');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

metrics.forEach(metric => {
  const pct = totals[metric].pct;
  const status = pct >= THRESHOLD ? '✓' : '✗';
  const statusColor = pct >= THRESHOLD ? '\x1b[32m' : '\x1b[31m';
  
  console.log(
    `${statusColor}${status}\x1b[0m ${metric.padEnd(12)} ${pct.toFixed(2)}% (threshold: ${THRESHOLD}%)`
  );
  
  if (pct < THRESHOLD) {
    failures.push({ metric, actual: pct, threshold: THRESHOLD });
  }
});

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (failures.length > 0) {
  console.error('❌ Coverage below threshold:\n');
  failures.forEach(({ metric, actual, threshold }) => {
    const gap = (threshold - actual).toFixed(2);
    console.error(`   ${metric}: ${actual.toFixed(2)}% (need +${gap}%)`);
  });
  console.error('\nRun `pnpm test:coverage:report` to see detailed coverage report.\n');
  process.exit(1);
}

console.log('✅ All coverage thresholds met!\n');
process.exit(0);
