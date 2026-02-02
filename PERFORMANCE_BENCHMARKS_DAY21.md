# Performance Benchmarking - Day 21

This document describes the comprehensive performance benchmarking infrastructure for the Phase Mirror project.

## Overview

The performance benchmarking suite provides comprehensive testing of cryptographic operations, database operations, S3 operations, circuit breaker performance, and end-to-end workflows.

## Pre-flight Setup

```bash
cd Phase-Mirror
git checkout test/performance-benchmarking
cd packages/mirror-dissonance
```

## Performance Benchmark Architecture

### Benchmark Categories

```
┌────────────────────────────────────────────────────┐
│ Performance Benchmark Suite                        │
├────────────────────────────────────────────────────┤
│ 1. Cryptographic Operations                       │
│    - Nonce loading (SSM)                           │
│    - HMAC computation                              │
│    - Redaction throughput                          │
│    - Validation speed                              │
│                                                    │
│ 2. DynamoDB Operations                            │
│    - Write throughput (single/batch)               │
│    - Query performance (PK/GSI)                    │
│    - Concurrent operations                         │
│    - Conditional writes                            │
│                                                    │
│ 3. S3 Operations                                  │
│    - Object write/read latency                     │
│    - Multipart upload                              │
│    - Versioning overhead                           │
│                                                    │
│ 4. Circuit Breaker                                │
│    - Threshold check speed                         │
│    - Counter update latency                        │
│    - Concurrent increment performance              │
│                                                    │
│ 5. End-to-End Workflows                           │
│    - Complete FP submission                        │
│    - Multi-component latency                       │
│    - 95th/99th percentile                          │
│                                                    │
│ 6. Load Testing                                   │
│    - Sustained throughput                          │
│    - Burst handling                                │
│    - Resource utilization                          │
└────────────────────────────────────────────────────┘
```

## Benchmark Infrastructure

### Framework Components

The benchmark framework is located at `src/__tests__/benchmarks/framework.ts` and provides:

- **BenchmarkResult Interface**: Captures comprehensive performance metrics including:
  - Iterations, total time, and throughput
  - Average, min, max, and median latency
  - p95 and p99 percentile measurements

- **benchmark() Function**: Core benchmarking utility with:
  - Configurable warmup iterations
  - Timeout protection
  - Progress logging
  - Statistical analysis

- **Reporting Utilities**:
  - `printBenchmarkResult()`: Console output with formatted metrics
  - `compareBenchmarks()`: Side-by-side comparison of results
  - `generateReport()`: Markdown report generation

## Benchmark Suites

### 1. Cryptographic Operations (`crypto.bench.ts`)

Tests the performance of cryptographic operations:

**Nonce Operations:**
- SSM nonce loading (Target: <500ms avg, <750ms p95)
- Cached nonce retrieval (Target: <0.1ms)

**Redaction Operations:**
- Single pattern redaction (Target: <5ms avg, <10ms p95)
- Multi-pattern redaction (Target: <10ms avg)
- Large text redaction 10KB (Target: <50ms avg)

**Validation Operations:**
- HMAC validation (Target: <1ms)
- Tamper detection (Target: <1ms)

**Running:**
```bash
npm test -- src/__tests__/benchmarks/crypto.bench.ts
```

### 2. DynamoDB Operations (`dynamodb.bench.ts`)

Tests database operation performance:

**Write Operations:**
- Single item write (Target: <100ms avg, <200ms p95)
- Batch write 25 items (Target: <500ms avg)

**Query Operations:**
- Query by partition key (Target: <50ms avg)
- Query with limit (Target: <30ms avg)

**Concurrent Operations:**
- 10 parallel writes (Target: <300ms avg)

**Running:**
```bash
npm test -- src/__tests__/benchmarks/dynamodb.bench.ts
```

### 3. End-to-End Workflows (`e2e-workflow.bench.ts`)

Tests complete workflow performance:

**Complete FP Submission:**
- Full workflow including redaction + DynamoDB + S3
- Target: <500ms avg, <750ms p95, <1000ms p99

**Component Latency Breakdown:**
- Redaction: <10ms
- Circuit breaker: <100ms
- FP storage: <100ms
- Baseline update: <250ms
- Total: <500ms

**Running:**
```bash
npm test -- src/__tests__/benchmarks/e2e-workflow.bench.ts
```

### 4. Load Testing (`load.bench.ts`)

Tests sustained throughput and burst handling:

**Sustained Throughput (5 minutes):**
- Target: >10 ops/sec sustained
- Target: p99 latency <500ms
- Measures: operations count, throughput, latency distribution

**Burst Throughput (100 concurrent):**
- Target: >20 ops/sec burst
- Target: 100 ops in <5 seconds
- Tests: concurrent write handling

**Running:**
```bash
# Load tests take 5+ minutes
npm test -- src/__tests__/benchmarks/load.bench.ts --testTimeout=600000
```

**Note:** Load tests are resource-intensive and should be run separately from quick benchmarks.

## Running All Benchmarks

To run the complete benchmark suite:

```bash
cd packages/mirror-dissonance

# Quick benchmarks (excludes load tests)
npm test -- src/__tests__/benchmarks/

# Or use the benchmark runner script
./../../scripts/test/run-benchmarks.sh

# Full suite including load tests (5+ minutes)
RUN_LOAD_TESTS=true ./../../scripts/test/run-benchmarks.sh
```

## Configuration

Benchmarks use environment variables for configuration:

- `AWS_REGION`: AWS region (default: us-east-1)
- `ENVIRONMENT`: Environment name (default: staging)

Example:
```bash
export AWS_REGION=us-east-1
export ENVIRONMENT=staging
npm test -- src/__tests__/benchmarks/
```

## Performance Targets

| Operation | Target Avg | Target p95 | Target p99 |
|-----------|------------|------------|------------|
| Nonce Load (SSM) | <500ms | <750ms | - |
| Cached Nonce | <0.1ms | - | - |
| Single Pattern Redaction | <5ms | <10ms | - |
| Multi-Pattern Redaction | <10ms | - | - |
| Large Text Redaction (10KB) | <50ms | - | - |
| HMAC Validation | <1ms | - | - |
| DynamoDB Single Write | <100ms | <200ms | - |
| DynamoDB Batch Write (25) | <500ms | - | - |
| DynamoDB Query | <50ms | - | - |
| Complete FP Workflow | <500ms | <750ms | <1000ms |
| Sustained Throughput | >10 ops/sec | - | - |
| Burst Throughput | >20 ops/sec | - | - |
| Load Test p99 Latency | - | - | <500ms |

## Interpreting Results

### Benchmark Output

Each benchmark generates detailed output including:

```
──────────────────────────────────────────────────────────
Benchmark: Single Pattern Redaction
──────────────────────────────────────────────────────────
Iterations:   10000
Total Time:   1234.56ms
Throughput:   8100.00 ops/sec

Latency Distribution:
  Average:    0.123ms
  Median:     0.120ms
  Min:        0.100ms
  Max:        1.500ms
  p95:        0.150ms
  p99:        0.200ms
──────────────────────────────────────────────────────────
```

### Final Report

After all benchmarks complete, a markdown report is generated with:
- Summary table of all results
- Detailed statistics for each benchmark
- Timestamp for tracking performance over time

## Best Practices

1. **Run benchmarks on consistent hardware**: Performance can vary significantly between machines
2. **Close unnecessary applications**: Reduce system load for accurate measurements
3. **Run multiple times**: Look for consistency in results
4. **Monitor AWS costs**: Benchmarks create actual AWS resources
5. **Clean up test data**: The benchmarks attempt cleanup but verify manually

## Troubleshooting

### AWS Credential Issues
```bash
# Ensure AWS credentials are configured
aws configure list
```

### DynamoDB Table Not Found
Verify the table names match your environment:
- `mirror-dissonance-{ENVIRONMENT}-fp-events`
- `mirror-dissonance-{ENVIRONMENT}-block-counter`

### S3 Bucket Not Found
Verify the bucket exists:
- `mirror-dissonance-{ENVIRONMENT}-baselines`

### SSM Parameter Not Found
Verify the nonce parameter exists:
- `/guardian/{ENVIRONMENT}/redaction_nonce_v1`

## Future Enhancements

Potential additions to the benchmark suite:

1. **Load Testing**: Sustained throughput testing with gradual ramp-up
2. **Stress Testing**: Find breaking points under extreme load
3. **Memory Profiling**: Track memory usage during operations
4. **Network Latency**: Measure impact of network conditions
5. **Concurrent User Simulation**: Simulate multiple users
6. **Regression Detection**: Automated comparison with baseline results

## References

- [Jest Performance Testing](https://jestjs.io/docs/timer-mocks)
- [AWS SDK Performance](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-js-considerations.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
