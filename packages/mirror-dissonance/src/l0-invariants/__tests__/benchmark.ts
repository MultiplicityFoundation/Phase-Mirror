/**
 * L0 Invariants Benchmark
 * 
 * This benchmark measures the performance of L0 invariant checks to verify
 * that the p99 latency is < 100ns as specified in ADR-003.
 * 
 * Target: p99 < 100ns
 * 
 * Run with: node --loader ts-node/esm benchmark.ts
 */

import { checkL0Invariants, createValidState } from '../index.js';

const NUM_ITERATIONS = 100_000;

interface BenchmarkResult {
  iterations: number;
  latencies: number[];
  mean: number;
  median: number;
  p95: number;
  p99: number;
  p999: number;
  min: number;
  max: number;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sortedArray: number[], p: number): number {
  const index = Math.floor(sortedArray.length * p);
  return sortedArray[index];
}

/**
 * Calculate mean from array
 */
function mean(array: number[]): number {
  return array.reduce((a, b) => a + b, 0) / array.length;
}

/**
 * Run benchmark and collect latencies
 */
function runBenchmark(): BenchmarkResult {
  console.log(`Running L0 invariants benchmark (${NUM_ITERATIONS} iterations)...`);
  console.log('');
  
  const latencies: number[] = [];
  
  // Warm-up (100 iterations)
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
    
    // Progress indicator every 10k iterations
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
  
  // Sort latencies for percentile calculation
  latencies.sort((a, b) => a - b);
  
  return {
    iterations: NUM_ITERATIONS,
    latencies,
    mean: mean(latencies),
    median: percentile(latencies, 0.5),
    p95: percentile(latencies, 0.95),
    p99: percentile(latencies, 0.99),
    p999: percentile(latencies, 0.999),
    min: latencies[0],
    max: latencies[latencies.length - 1],
  };
}

/**
 * Print benchmark results
 */
function printResults(result: BenchmarkResult): void {
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

/**
 * Save results to file for historical tracking
 */
function saveResults(result: BenchmarkResult): void {
  const output = {
    timestamp: new Date().toISOString(),
    target_p99_ns: 100,
    ...result,
    // Don't save full latencies array (too large)
    latencies: undefined,
  };
  
  const fs = require('fs');
  const path = require('path');
  
  const outputDir = path.join(__dirname, '../../../..', 'docs', 'benchmarks');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
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
