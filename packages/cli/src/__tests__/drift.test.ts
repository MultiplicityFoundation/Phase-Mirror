/**
 * Tests for the drift command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock PhaseOracle
const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCheckDrift = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../lib/oracle.js', () => ({
  PhaseOracle: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    checkDrift: mockCheckDrift,
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
    formatDriftResult: jest.fn().mockReturnValue('drift output'),
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

// Mock fs/promises — must export all named exports used transitively
const mockReadFile = jest.fn<() => Promise<string>>();
const fsMod = {
  readFile: mockReadFile,
  writeFile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  access: jest.fn(), mkdir: jest.fn(), stat: jest.fn(), readdir: jest.fn(),
  unlink: jest.fn(), rmdir: jest.fn(), rename: jest.fn(), copyFile: jest.fn(),
  chmod: jest.fn(), chown: jest.fn(), lstat: jest.fn(), link: jest.fn(),
  symlink: jest.fn(), realpath: jest.fn(), mkdtemp: jest.fn(),
  truncate: jest.fn(), open: jest.fn(), appendFile: jest.fn(),
  watch: jest.fn(), cp: jest.fn(), constants: {},
};
jest.unstable_mockModule('fs/promises', () => ({ ...fsMod, default: fsMod }));

const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);
jest.spyOn(console, 'log').mockImplementation(() => {});

const { driftCommand } = await import('../commands/drift.js');

describe('drift command', () => {
  const validBaseline = JSON.stringify({
    version: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    files: [{ path: 'ci.yml', hash: 'abc123', exists: true }],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue({
      version: '1',
      drift: { enabled: true, threshold: 0.15 },
    });
    mockReadFile.mockResolvedValue(validBaseline);
    mockCheckDrift.mockResolvedValue({
      driftDetected: false,
      magnitude: 0,
      changes: [],
    });
  });

  it('passes when no drift detected', async () => {
    await driftCommand({ baseline: 'baseline.json' } as any);

    expect(mockCheckDrift).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('exits 1 when drift detected', async () => {
    mockCheckDrift.mockResolvedValue({
      driftDetected: true,
      magnitude: 0.3,
      changes: [{ file: 'ci.yml', type: 'modified' }],
    });

    await driftCommand({ baseline: 'baseline.json' } as any);

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('uses config threshold when not specified', async () => {
    await driftCommand({ baseline: 'baseline.json' } as any);

    expect(mockCheckDrift).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 0.15 })
    );
  });

  it('uses explicit threshold over config', async () => {
    await driftCommand({ baseline: 'baseline.json', threshold: 0.5 } as any);

    expect(mockCheckDrift).toHaveBeenCalledWith(
      expect.objectContaining({ threshold: 0.5 })
    );
  });

  it('throws CLIError on baseline read failure', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'));

    await expect(
      driftCommand({ baseline: 'missing.json' } as any)
    ).rejects.toThrow('Drift check error');
  });
});
