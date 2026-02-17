/**
 * Tests for the fp (false positive) command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock PhaseOracle
const mockInitialize = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockMarkFP = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockListFPs = jest.fn<() => Promise<any[]>>();
const mockExportFPs = jest.fn<() => Promise<any>>();
const mockImportFPs = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../lib/oracle.js', () => ({
  PhaseOracle: jest.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    markFalsePositive: mockMarkFP,
    listFalsePositives: mockListFPs,
    exportFalsePositives: mockExportFPs,
    importFalsePositives: mockImportFPs,
  })),
}));

// Mock output
jest.unstable_mockModule('../lib/output.js', () => ({
  OutputFormatter: jest.fn().mockImplementation(() => ({
    formatFPList: jest.fn().mockReturnValue('fp list output'),
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
const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockMkdir = jest.fn<() => Promise<string | undefined>>().mockResolvedValue(undefined);
const fsMod = {
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  access: jest.fn(), stat: jest.fn(), readdir: jest.fn(),
  unlink: jest.fn(), rmdir: jest.fn(), rename: jest.fn(), copyFile: jest.fn(),
  chmod: jest.fn(), chown: jest.fn(), lstat: jest.fn(), link: jest.fn(),
  symlink: jest.fn(), realpath: jest.fn(), mkdtemp: jest.fn(),
  truncate: jest.fn(), open: jest.fn(), appendFile: jest.fn(),
  watch: jest.fn(), cp: jest.fn(), constants: {},
};
jest.unstable_mockModule('fs/promises', () => ({ ...fsMod, default: fsMod }));

jest.spyOn(console, 'log').mockImplementation(() => {});

const { fpCommand } = await import('../commands/fp.js');

describe('fp command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('mark', () => {
    it('marks a finding as false positive', async () => {
      await fpCommand.mark('finding-123', { reason: 'Not relevant', pattern: false } as any);

      expect(mockMarkFP).toHaveBeenCalledWith({
        findingId: 'finding-123',
        reason: 'Not relevant',
        createPattern: false,
      });
    });

    it('creates pattern when --pattern flag set', async () => {
      await fpCommand.mark('finding-456', { reason: 'Template', pattern: true } as any);

      expect(mockMarkFP).toHaveBeenCalledWith(
        expect.objectContaining({ createPattern: true })
      );
    });

    it('throws CLIError on failure', async () => {
      mockMarkFP.mockRejectedValue(new Error('Store unavailable'));

      await expect(
        fpCommand.mark('bad', { reason: 'test', pattern: false } as any)
      ).rejects.toThrow('FP marking error');
    });
  });

  describe('list', () => {
    it('lists all false positives', async () => {
      mockListFPs.mockResolvedValue([
        { id: '1', ruleId: 'MD-001', reason: 'Expected' },
      ]);

      await fpCommand.list({ output: 'text' } as any);

      expect(mockListFPs).toHaveBeenCalled();
    });

    it('filters by rule ID', async () => {
      mockListFPs.mockResolvedValue([]);

      await fpCommand.list({ output: 'text', rule: 'MD-002' } as any);

      expect(mockListFPs).toHaveBeenCalledWith({ ruleId: 'MD-002' });
    });
  });

  describe('export', () => {
    it('exports anonymized FP data', async () => {
      mockExportFPs.mockResolvedValue({ count: 3, patterns: [] });

      await fpCommand.export({ output: 'fps.json' } as any);

      expect(mockExportFPs).toHaveBeenCalledWith({ anonymize: true });
      expect(mockWriteFile).toHaveBeenCalled();
    });
  });

  describe('import', () => {
    it('imports FP patterns from file', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ patterns: [{ ruleId: 'MD-001' }] }));

      await fpCommand.import('import.json');

      expect(mockImportFPs).toHaveBeenCalled();
    });

    it('throws CLIError on invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not json{');

      await expect(fpCommand.import('bad.json')).rejects.toThrow('FP import error');
    });
  });
});
