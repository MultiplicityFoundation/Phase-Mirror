/**
 * Tests for the analyze command
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock PhaseOracle
const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockAnalyze = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../lib/oracle.js', () => ({
  PhaseOracle: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    analyze: mockAnalyze,
  })),
}));

// Mock loadConfig
const mockLoadConfig = jest.fn<() => Promise<any>>();
jest.unstable_mockModule('../lib/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock findFiles
const mockFindFiles = jest.fn<() => Promise<string[]>>();
jest.unstable_mockModule('../utils/files.js', () => ({
  findFiles: mockFindFiles,
}));

// Mock output
jest.unstable_mockModule('../lib/output.js', () => ({
  OutputFormatter: jest.fn().mockImplementation(() => ({
    formatReport: jest.fn().mockReturnValue('formatted output'),
  })),
}));

// Mock ora
jest.unstable_mockModule('ora', () => ({
  default: jest.fn().mockReturnValue({
    start: jest.fn().mockReturnThis(),
    succeed: jest.fn(),
    fail: jest.fn(),
    warn: jest.fn(),
    text: '',
  }),
}));

// Spies
const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { analyzeCommand } = await import('../commands/analyze.js');

describe('analyze command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({ version: '1', rules: { enabled: ['MD-001'] } });
    mockFindFiles.mockResolvedValue(['workflow.yml']);
    mockAnalyze.mockResolvedValue({
      decision: 'PASS',
      findings: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    });
  });

  afterEach(() => {
    exitSpy.mockClear();
  });

  it('runs analysis and succeeds with PASS decision', async () => {
    await analyzeCommand([], { mode: 'full' } as any);

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockInitialize).toHaveBeenCalled();
    expect(mockAnalyze).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 on BLOCK decision', async () => {
    mockAnalyze.mockResolvedValue({ decision: 'BLOCK', findings: [{ id: '1' }] });

    await analyzeCommand([], { mode: 'full' } as any);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('warns and returns when no files found', async () => {
    mockFindFiles.mockResolvedValue([]);

    await analyzeCommand([], { mode: 'full' } as any);

    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('throws CLIError on oracle failure', async () => {
    mockAnalyze.mockRejectedValue(new Error('Oracle exploded'));

    await expect(analyzeCommand([], { mode: 'full' } as any)).rejects.toThrow('Analysis error: Oracle exploded');
  });

  it('passes explicit file list to findFiles', async () => {
    await analyzeCommand(['a.yml', 'b.yml'], { mode: 'full' } as any);

    expect(mockFindFiles).toHaveBeenCalledWith(['a.yml', 'b.yml']);
  });
});
