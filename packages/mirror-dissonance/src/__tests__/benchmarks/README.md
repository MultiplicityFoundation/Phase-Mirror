# Performance Benchmarks

This directory contains performance benchmarking tests for the Phase Mirror system.

## Quick Start

```bash
# Run all benchmarks
npm test -- src/__tests__/benchmarks/

# Run specific benchmark suite
npm test -- src/__tests__/benchmarks/crypto.bench.ts
npm test -- src/__tests__/benchmarks/dynamodb.bench.ts
npm test -- src/__tests__/benchmarks/e2e-workflow.bench.ts
```

## Benchmark Suites

### 1. Cryptographic Operations (`crypto.bench.ts`)
Tests the performance of cryptographic operations including nonce loading, redaction, and HMAC validation.

**Tests:**
- SSM Nonce Load
- Cached Nonce Retrieval
- Single Pattern Redaction
- Multi-Pattern Redaction
- Large Text Redaction (10KB)
- HMAC Validation
- Tamper Detection

### 2. DynamoDB Operations (`dynamodb.bench.ts`)
Tests the performance of DynamoDB operations including writes, queries, and concurrent operations.

**Tests:**
- Single Item Write
- Batch Write (25 items)
- Query by Partition Key
- Query with Limit
- Concurrent Writes (10 parallel)

### 3. End-to-End Workflows (`e2e-workflow.bench.ts`)
Tests the performance of complete workflows from start to finish.

**Tests:**
- Complete FP Submission (redaction + DynamoDB + S3)
- Component Latency Breakdown

## Framework

The `framework.ts` file provides utilities for running benchmarks:

- **benchmark()**: Run a function multiple times and collect performance metrics
- **printBenchmarkResult()**: Display formatted benchmark results
- **compareBenchmarks()**: Compare two benchmark results
- **generateReport()**: Generate markdown report of all results

## Configuration

Benchmarks use environment variables:

```bash
export AWS_REGION=us-east-1
export ENVIRONMENT=staging
```

## Prerequisites

- AWS credentials configured
- DynamoDB tables:
  - `mirror-dissonance-{ENVIRONMENT}-fp-events`
  - `mirror-dissonance-{ENVIRONMENT}-block-counter`
- S3 bucket:
  - `mirror-dissonance-{ENVIRONMENT}-baselines`
- SSM parameter:
  - `/guardian/{ENVIRONMENT}/redaction_nonce_v1`

## Performance Targets

| Operation | Target Avg | Target p95 |
|-----------|------------|------------|
| Nonce Load | <500ms | <750ms |
| Cached Nonce | <0.1ms | - |
| Single Redaction | <5ms | <10ms |
| Multi Redaction | <10ms | - |
| Large Text (10KB) | <50ms | - |
| HMAC Validation | <1ms | - |
| DynamoDB Write | <100ms | <200ms |
| DynamoDB Batch (25) | <500ms | - |
| DynamoDB Query | <50ms | - |
| Complete Workflow | <500ms | <750ms |

## Notes

- Benchmarks create actual AWS resources and will incur costs
- The benchmarks attempt to clean up test data but manual verification is recommended
- Run benchmarks on consistent hardware for reliable results
- Close unnecessary applications to reduce system load

For more details, see the main documentation at `/PERFORMANCE_BENCHMARKS_DAY21.md`.
