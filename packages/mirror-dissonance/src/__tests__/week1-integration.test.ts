/**
 * Week 1 Integration Tests - Day 14
 * End-to-end testing of FP Calibration Service components
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import { randomUUID } from 'crypto';
import type { FPEvent } from '../fp-store/types.js';
import { InMemoryBlockCounter } from '../block-counter/dynamodb.js';
import { applyCircuitBreaker } from '../policy/circuit-breaker.js';
import { validateReportRedactions, isValidRedactedText } from '../redaction/validator.js';

describe('Week 1 Integration: FP Service', () => {
  test('RedactedText validation fails on missing brand', () => {
    const invalid = {
      __mac: 'abc123',
      value: 'redacted-value',
    };
    
    expect(isValidRedactedText(invalid)).toBe(false);
  });

  test('RedactedText validation passes on valid structure', () => {
    const valid = {
      __brand: 'RedactedText',
      __mac: 'valid-mac-hash',
      value: '[REDACTED]',
      originalLength: 32,
    };
    
    expect(isValidRedactedText(valid)).toBe(true);
  });

  test('Report validation in fail-open mode drops invalid snippets', () => {
    const report = {
      meta: {
        schema_version: '2.0.0',
        run_id: randomUUID(),
        timestamp: new Date(),
        rules_hash: 'test-hash',
      },
      items: [
        {
          id: 'finding-1',
          rule_id: 'MD-001',
          severity: 'high',
          title: 'Test finding',
          evidence: [
            {
              path: 'test.yml',
              line: 10,
              snippet: {
                // Invalid - missing __brand
                value: 'test',
                __mac: 'invalid',
              },
            },
          ],
        },
      ],
      summary: {},
      machine_decision: {},
    };

    const validated = validateReportRedactions(report as any, 'fail-open');
    expect(validated.items[0].evidence![0].snippet).toBeUndefined();
  });

  test('Report validation in fail-closed mode throws on invalid', () => {
    const report = {
      meta: {
        schema_version: '2.0.0',
        run_id: randomUUID(),
        timestamp: new Date(),
        rules_hash: 'test-hash',
      },
      items: [
        {
          id: 'finding-1',
          rule_id: 'MD-001',
          severity: 'high',
          title: 'Test finding',
          evidence: [
            {
              path: 'test.yml',
              snippet: {
                value: 'test',
                __mac: 'invalid',
              },
            },
          ],
        },
      ],
      summary: {},
      machine_decision: {},
    };

    expect(() => {
      validateReportRedactions(report as any, 'fail-closed');
    }).toThrow('Report validation failed');
  });
});

describe('Circuit Breaker', () => {
  test('Degrades to warn after threshold blocks', async () => {
    const counter = new InMemoryBlockCounter();
    const context = { owner: 'test', repo: 'repo' };
    const config = { maxBlocksPerHour: 10, bucketTTLSeconds: 3600 };

    // Increment counter 10 times
    const now = new Date();
    const hourBucket = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}`;
    const key = `blocks:${context.owner}/${context.repo}:${hourBucket}`;
    
    for (let i = 0; i < 10; i++) {
      await counter.increment(key, 3600);
    }

    const decision = await applyCircuitBreaker(
      { outcome: 'block', degraded: false },
      context,
      counter,
      config
    );

    expect(decision.outcome).toBe('warn');
    expect(decision.degraded).toBe(true);
    expect(decision.reason).toContain('Circuit breaker triggered');
  });

  test('Allows block when under threshold', async () => {
    const counter = new InMemoryBlockCounter();
    const context = { owner: 'test', repo: 'repo' };
    const config = { maxBlocksPerHour: 10, bucketTTLSeconds: 3600 };

    const decision = await applyCircuitBreaker(
      { outcome: 'block', degraded: false },
      context,
      counter,
      config
    );

    expect(decision.outcome).toBe('block');
    expect(decision.degraded).toBe(false);
  });
});
