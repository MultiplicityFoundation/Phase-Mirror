#!/usr/bin/env node
/**
 * Generate coverage badge for README
 */

const fs = require('fs');
const path = require('path');

const COVERAGE_FILE = path.join(__dirname, '../coverage/coverage-summary.json');
const BADGE_FILE = path.join(__dirname, '../coverage-badge.json');

if (!fs.existsSync(COVERAGE_FILE)) {
  console.error('Coverage summary not found.');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(COVERAGE_FILE, 'utf8'));
const totalLines = summary.total.lines.pct;

const color = 
  totalLines >= 80 ? 'brightgreen' :
  totalLines >= 60 ? 'yellow' :
  totalLines >= 40 ? 'orange' : 'red';

const badge = {
  schemaVersion: 1,
  label: 'coverage',
  message: `${totalLines.toFixed(0)}%`,
  color: color
};

fs.writeFileSync(BADGE_FILE, JSON.stringify(badge, null, 2));
console.log(`✓ Badge generated: ${totalLines.toFixed(2)}% (${color})`);
