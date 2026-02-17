/**
 * Tests for the validate command
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock PhaseOracle
const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockValidateL0 = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../lib/oracle.js', () => ({
  PhaseOracle: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    validateL0: mockValidateL0,
  })),
}));

// Mock loadConfig
const mockLoadConfig = jest.fn<() => Promise<any>>();
jest.unstable_mockModule('../lib/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock output
jest.unstable_mockModule('../lib/output.js', () => ({
  OutputFormatter: jest.fn().mockImplementation(() => ({
    formatL0Result: jest.fn().mockReturnValue('L0 formatted output'),
  })),
}));

// Mock ora
jest.unstable_mockModule('ora', () => ({
  default: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    fail: jest.fn(),
    text: '',
  }),
}));

// Spies
const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { validateCommand } = await import('../commands/validate.js');

describe('validate command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({ version: '1', l0_invariants: { enabled: true } });
    mockValidateL0.mockResolvedValue({ valid: true, violations: [] });
  });

  it('succeeds when all L0 invariants pass', async () => {
    await validateCommand({ workflowsDir: '.github/workflows', strict: false } as any);

    expect(mockValidateL0).toHaveBeenCalledWith({
      workflowsDir: '.github/workflows',
      strict: false,
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 on L0 violation', async () => {
    mockValidateL0.mockResolvedValue({
      valid: false,
      violations: [{ id: 'L0-001', message: 'Schema drift' }],
    });

    await validateCommand({ workflowsDir: '.github/workflows', strict: true } as any);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes --strict flag through to oracle', async () => {
    await validateCommand({ workflowsDir: '.', strict: true } as any);

    expect(mockValidateL0).toHaveBeenCalledWith(
      expect.objectContaining({ strict: true })
    );
  });

  it('throws CLIError on oracle failure', async () => {
    mockValidateL0.mockRejectedValue(new Error('L0 engine crash'));

    await expect(
      validateCommand({ workflowsDir: '.', strict: false } as any)
    ).rejects.toThrow('Validation error: L0 engine crash');
  });
});
