/**
 * Tests for RuleEvaluationError and structured error handling
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { RuleEvaluationError, EvaluationResult } from '../rule-error.js';
import { evaluateAllRules, RULES } from '../index.js';
import type { OracleInput, RuleViolation } from '../../../schemas/types.js';

describe('RuleEvaluationError', () => {
  describe('constructor', () => {
    it('creates error with all properties', () => {
      const error = new RuleEvaluationError({
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        phase: 'evaluate',
        message: 'Test error',
        cause: new Error('Original error'),
      });

      expect(error.name).toBe('RuleEvaluationError');
      expect(error.ruleId).toBe('MD-001');
      expect(error.ruleVersion).toBe('1.0.0');
      expect(error.phase).toBe('evaluate');
      expect(error.message).toBe('Test error');
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('uses default version when not provided', () => {
      const error = new RuleEvaluationError({
        ruleId: 'MD-002',
        phase: 'init',
        message: 'Init failed',
      });

      expect(error.ruleVersion).toBe('unknown');
    });
  });

  describe('toViolation', () => {
    it('converts to critical severity violation', () => {
      const error = new RuleEvaluationError({
        ruleId: 'MD-003',
        ruleVersion: '2.0.0',
        phase: 'evidence',
        message: 'Evidence collection failed',
        cause: new Error('Timeout'),
      });

      const violation = error.toViolation();

      expect(violation.ruleId).toBe('MD-003');
      expect(violation.severity).toBe('critical');
      expect(violation.message).toContain('MD-003');
      expect(violation.message).toContain('evidence');
      expect(violation.message).toContain('Evidence collection failed');
      expect(violation.context).toBeDefined();
      expect(violation.context?.ruleVersion).toBe('2.0.0');
      expect(violation.context?.phase).toBe('evidence');
      expect(violation.context?.isEvaluationError).toBe(true);
    });

    it('includes error type in context', () => {
      const originalError = new TypeError('Invalid type');
      const error = new RuleEvaluationError({
        ruleId: 'MD-004',
        phase: 'evaluate',
        message: 'Type error occurred',
        cause: originalError,
      });

      const violation = error.toViolation();

      expect(violation.context?.errorType).toBe('TypeError');
    });

    it('handles unknown error type', () => {
      const error = new RuleEvaluationError({
        ruleId: 'MD-005',
        phase: 'post',
        message: 'Unknown error',
        cause: 'string error',
      });

      const violation = error.toViolation();

      expect(violation.context?.errorType).toBe('UnknownError');
    });
  });
});
