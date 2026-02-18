/**
 * Tests for CLI error handling (ADR-030)
 *
 * Verifies exit code semantics:
 *   0 = pass
 *   1 = block (L0 violation or unrecoverable)
 *   2 = degraded (infrastructure unavailable, free tier proceeds)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Import directly — these are not mocked
import { CLIError, handleFatalError } from '../lib/errors.js';
import {
  OracleDegradedError,
  L0InvariantViolation,
} from '@mirror-dissonance/core';

describe('handleFatalError (ADR-030)', () => {
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exits 1 on L0InvariantViolation (all tiers)', () => {
    const error = new L0InvariantViolation('L0-001', { detail: 'schema drift' });

    handleFatalError(error);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 2 on OracleDegradedError with canProceed:true (free tier)', () => {
    const error = new OracleDegradedError(
      'FP_STORE_UNAVAILABLE',
      true,
      { table: 'fp-table', operation: 'query' },
      'community'
    );

    handleFatalError(error);

    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('exits 1 on OracleDegradedError with canProceed:false (paid tier)', () => {
    const error = new OracleDegradedError(
      'FP_STORE_UNAVAILABLE',
      false,
      { table: 'fp-table', operation: 'query' },
      'enterprise'
    );

    handleFatalError(error);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with CLIError exitCode', () => {
    const error = new CLIError('bad config', 'CONFIG_INVALID', 1);

    handleFatalError(error);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 on unknown Error (fail-closed)', () => {
    handleFatalError(new Error('Something unexpected'));

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits 1 on non-Error value (fail-closed)', () => {
    handleFatalError('string error');

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('includes invariant ID in L0 output', () => {
    const error = new L0InvariantViolation('L0-003', { nonce: 'expired' });

    handleFatalError(error);

    const output = errorSpy.mock.calls.map(c => c[0]).join(' ');
    expect(output).toContain('L0-003');
  });

  it('includes degradation reason in output', () => {
    const error = new OracleDegradedError(
      'DRIFT_BASELINE_MISSING',
      true,
      {},
      'community'
    );

    handleFatalError(error);

    const output = errorSpy.mock.calls.map(c => c[0]).join(' ');
    expect(output).toContain('DRIFT_BASELINE_MISSING');
  });
});
