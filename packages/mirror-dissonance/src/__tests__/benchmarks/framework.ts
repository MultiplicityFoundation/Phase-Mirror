/**
 * Performance Benchmark Framework
 * Provides utilities for measuring and reporting performance
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
}

export interface BenchmarkOptions {
  iterations?: number;
  warmupIterations?: number;
  timeout?: number;
  logProgress?: boolean;
}

/**
 * Run performance benchmark
 */
export async function benchmark(
  name: string,
  fn: () => Promise<void> | void,
  options: BenchmarkOptions = {}
): Promise<BenchmarkResult> {
  const {
    iterations = 1000,
    warmupIterations = 100,
    timeout = 60000,
    logProgress = false
  } = options;

  // Warmup
  if (logProgress) console.log(`[${name}] Warming up (${warmupIterations} iterations)...`);
  for (let i = 0; i < warmupIterations; i++) {
    await fn();
  }

  // Benchmark
  if (logProgress) console.log(`[${name}] Benchmarking (${iterations} iterations)...`);
  
  const durations: number[] = [];
  const startTime = Date.now();

  for (let i = 0; i < iterations; i++) {
    const iterStart = performance.now();
    await fn();
    const iterEnd = performance.now();
    durations.push(iterEnd - iterStart);

    if (Date.now() - startTime > timeout) {
      console.warn(`[${name}] Timeout reached after ${i + 1} iterations`);
      break;
    }

    if (logProgress && (i + 1) % 100 === 0) {
      console.log(`[${name}] Progress: ${i + 1}/${iterations}`);
    }
  }

  const endTime = Date.now();
  const totalMs = endTime - startTime;

  // Calculate statistics
  durations.sort((a, b) => a - b);
  const actualIterations = durations.length;

  const sum = durations.reduce((acc, d) => acc + d, 0);
  const avgMs = sum / actualIterations;
  const minMs = durations[0];
  const maxMs = durations[actualIterations - 1];
  const medianMs = durations[Math.floor(actualIterations / 2)];
  const p95Ms = durations[Math.floor(actualIterations * 0.95)];
  const p99Ms = durations[Math.floor(actualIterations * 0.99)];
  const opsPerSec = (actualIterations / totalMs) * 1000;

  const result: BenchmarkResult = {
    name,
    iterations: actualIterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    medianMs,
    p95Ms,
    p99Ms,
    opsPerSec
  };

  if (logProgress) {
    printBenchmarkResult(result);
  }

  return result;
}

/**
 * Print benchmark result
 */
export function printBenchmarkResult(result: BenchmarkResult): void {
  console.log('\n' + '─'.repeat(60));
  console.log(`Benchmark: ${result.name}`);
  console.log('─'.repeat(60));
  console.log(`Iterations:   ${result.iterations}`);
  console.log(`Total Time:   ${result.totalMs.toFixed(2)}ms`);
  console.log(`Throughput:   ${result.opsPerSec.toFixed(2)} ops/sec`);
  console.log('');
  console.log('Latency Distribution:');
  console.log(`  Average:    ${result.avgMs.toFixed(3)}ms`);
  console.log(`  Median:     ${result.medianMs.toFixed(3)}ms`);
  console.log(`  Min:        ${result.minMs.toFixed(3)}ms`);
  console.log(`  Max:        ${result.maxMs.toFixed(3)}ms`);
  console.log(`  p95:        ${result.p95Ms.toFixed(3)}ms`);
  console.log(`  p99:        ${result.p99Ms.toFixed(3)}ms`);
  console.log('─'.repeat(60) + '\n');
}

/**
 * Compare benchmark results
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): void {
  const avgDiff = ((current.avgMs - baseline.avgMs) / baseline.avgMs) * 100;
  const p95Diff = ((current.p95Ms - baseline.p95Ms) / baseline.p95Ms) * 100;
  const throughputDiff = ((current.opsPerSec - baseline.opsPerSec) / baseline.opsPerSec) * 100;

  console.log('\n' + '═'.repeat(60));
  console.log(`Comparison: ${baseline.name} vs ${current.name}`);
  console.log('═'.repeat(60));
  console.log(`Average Latency:  ${formatDiff(avgDiff)}`);
  console.log(`p95 Latency:      ${formatDiff(p95Diff)}`);
  console.log(`Throughput:       ${formatDiff(throughputDiff, true)}`);
  console.log('═'.repeat(60) + '\n');
}

function formatDiff(diff: number, inverse = false): string {
  const sign = diff > 0 ? '+' : '';
  const color = (inverse ? diff > 0 : diff < 0) ? '✓' : '✗';
  return `${color} ${sign}${diff.toFixed(2)}%`;
}

/**
 * Generate benchmark report
 */
export function generateReport(results: BenchmarkResult[]): string {
  let report = '\n# Performance Benchmark Report\n\n';
  report += `Generated: ${new Date().toISOString()}\n\n`;
  report += '## Results Summary\n\n';
  report += '| Benchmark | Iterations | Avg (ms) | p95 (ms) | p99 (ms) | Throughput (ops/sec) |\n';
  report += '|-----------|------------|----------|----------|----------|----------------------|\n';

  for (const result of results) {
    report += `| ${result.name} | ${result.iterations} | ${result.avgMs.toFixed(3)} | ${result.p95Ms.toFixed(3)} | ${result.p99Ms.toFixed(3)} | ${result.opsPerSec.toFixed(2)} |\n`;
  }

  report += '\n## Detailed Results\n\n';

  for (const result of results) {
    report += `### ${result.name}\n\n`;
    report += '```\n';
    report += `Iterations:   ${result.iterations}\n`;
    report += `Total Time:   ${result.totalMs.toFixed(2)}ms\n`;
    report += `Throughput:   ${result.opsPerSec.toFixed(2)} ops/sec\n`;
    report += '\n';
    report += 'Latency Distribution:\n';
    report += `  Average:    ${result.avgMs.toFixed(3)}ms\n`;
    report += `  Median:     ${result.medianMs.toFixed(3)}ms\n`;
    report += `  Min:        ${result.minMs.toFixed(3)}ms\n`;
    report += `  Max:        ${result.maxMs.toFixed(3)}ms\n`;
    report += `  p95:        ${result.p95Ms.toFixed(3)}ms\n`;
    report += `  p99:        ${result.p99Ms.toFixed(3)}ms\n`;
    report += '```\n\n';
  }

  return report;
}
