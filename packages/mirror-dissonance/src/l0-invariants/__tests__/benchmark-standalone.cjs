#!/usr/bin/env node
/**
 * L0 Invariants Benchmark (Standalone)
 * 
 * This benchmark measures the performance of L0 invariant checks to verify
 * that the p99 latency is < 100ns as specified in ADR-003.
 * 
 * Target: p99 < 100ns
 * 
 * Run with: node benchmark-standalone.js
 */

// Inline minimal implementation for benchmark
const EXPECTED_SCHEMA_VERSION = '1.0';
const EXPECTED_SCHEMA_HASH = 'f7a8b9c0';
const RESERVED_PERMISSION_BITS_MASK = 0b1111000000000000;
const DRIFT_THRESHOLD = 0.3;
const NONCE_LIFETIME_MS = 60 * 60 * 1000;
const CONTRACTION_WITNESS_THRESHOLD = 1.0;

function checkL0Invariants(state, nowMs) {
  const startNs = process.hrtime.bigint();
  
  let passed = true;
  
  // Check 1: Schema hash
  const [version, hash] = state.schemaVersion.split(':');
  if (version !== EXPECTED_SCHEMA_VERSION || hash !== EXPECTED_SCHEMA_HASH) {
    passed = false;
  }
  
  // Check 2: Permission bits
  if ((state.permissionBits & RESERVED_PERMISSION_BITS_MASK) !== 0) {
    passed = false;
  }
  
  // Check 3: Drift magnitude
  if (state.driftMagnitude < 0.0 || state.driftMagnitude >= DRIFT_THRESHOLD) {
    passed = false;
  }
  
  // Check 4: Nonce freshness
  const now = nowMs ?? Date.now();
  const age = now - state.nonce.issuedAt;
  if (age < 0 || age >= NONCE_LIFETIME_MS) {
    passed = false;
  }
  
  // Check 5: Contraction witness
  if (state.contractionWitnessScore !== CONTRACTION_WITNESS_THRESHOLD) {
    passed = false;
  }
  
  const endNs = process.hrtime.bigint();
  const latencyNs = Number(endNs - startNs);
  
  return { passed, latencyNs };
}

function createValidState() {
  return {
    schemaVersion: `${EXPECTED_SCHEMA_VERSION}:${EXPECTED_SCHEMA_HASH}`,
    permissionBits: 0b0000111111111111,
    driftMagnitude: 0.15,
    nonce: {
      value: 'test-nonce-' + Date.now(),
      issuedAt: Date.now(),
    },
    contractionWitnessScore: 1.0,
  };
}

const NUM_ITERATIONS = 100_000;

function percentile(sortedArray, p) {
  const index = Math.floor(sortedArray.length * p);
  return sortedArray[index];
}

function mean(array) {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

function runBenchmark() {
  console.log(`Running L0 invariants benchmark (${NUM_ITERATIONS} iterations)...`);
  console.log('');
  
  const latencies = [];
  
  // Warm-up
  console.log('Warm-up phase (100 iterations)...');
  for (let i = 0; i < 100; i++) {
    const state = createValidState();
    checkL0Invariants(state);
  }
  
  console.log('Benchmark phase...');
  const benchmarkStart = Date.now();
  
  // Main benchmark
  for (let i = 0; i < NUM_ITERATIONS; i++) {
    const state = createValidState();
    const result = checkL0Invariants(state);
    latencies.push(result.latencyNs);
    
    if ((i + 1) % 10_000 === 0) {
      const progress = ((i + 1) / NUM_ITERATIONS * 100).toFixed(0);
      process.stdout.write(`\r  Progress: ${progress}%`);
    }
  }
  
  const benchmarkEnd = Date.now();
  const durationMs = benchmarkEnd - benchmarkStart;
  
  console.log(`\r  Progress: 100%`);
  console.log(`  Duration: ${durationMs}ms`);
  console.log('');
  
  latencies.sort((a, b) => a - b);
  
  return {
    iterations: NUM_ITERATIONS,
    mean: mean(latencies),
    median: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    p999: percentile(latencies, 0.999),
    min: latencies[0],
    max: latencies[latencies.length - 1],
  };
}

function printResults(result) {
  console.log('='.repeat(60));
  console.log('L0 INVARIANTS BENCHMARK RESULTS');
  console.log('='.repeat(60));
  console.log('');
  console.log(`Iterations: ${result.iterations.toLocaleString()}`);
  console.log('');
  console.log('Latency (nanoseconds):');
  console.log(`  Min:    ${result.min.toFixed(2)}ns`);
  console.log(`  Mean:   ${result.mean.toFixed(2)}ns`);
  console.log(`  Median: ${result.median.toFixed(2)}ns`);
  console.log(`  P95:    ${result.p95.toFixed(2)}ns`);
  console.log(`  P99:    ${result.p99.toFixed(2)}ns`);
  console.log(`  P999:   ${result.p999.toFixed(2)}ns`);
  console.log(`  Max:    ${result.max.toFixed(2)}ns`);
  console.log('');
  console.log('Target: P99 < 100ns');
  
  if (result.p99 < 100) {
    console.log(`✅ PASSED: P99 latency (${result.p99.toFixed(2)}ns) is under 100ns target`);
  } else {
    console.log(`❌ FAILED: P99 latency (${result.p99.toFixed(2)}ns) exceeds 100ns target`);
  }
  
  console.log('');
  console.log('='.repeat(60));
}

function saveResults(result) {
  const fs = require('fs');
  const path = require('path');
  
  const output = {
    timestamp: new Date().toISOString(),
    target_p99_ns: 100,
    ...result,
  };
  
  const outputDir = path.join(__dirname, '../../../../../docs/benchmarks');
  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (e) {}
  
  const outputFile = path.join(outputDir, 'l0-invariants-benchmark.json');
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  
  console.log(`Results saved to: ${outputFile}`);
  console.log('');
}

// Run benchmark
const result = runBenchmark();
printResults(result);
saveResults(result);

// Exit with appropriate code
process.exit(result.p99 < 100 ? 0 : 1);
