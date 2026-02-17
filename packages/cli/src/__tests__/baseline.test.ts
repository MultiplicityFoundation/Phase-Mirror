/**
 * Tests for the baseline command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock hash utils
const mockComputeFileHash = jest.fn<() => Promise<string>>();
const mockFileExists = jest.fn<() => boolean>();

jest.unstable_mockModule('../utils/hash.js', () => ({
  computeFileHash: mockComputeFileHash,
  fileExists: mockFileExists,
}));

// Mock fs for writeFileSync
const mockWriteFileSync = jest.fn();
jest.unstable_mockModule('fs', () => ({
  writeFileSync: mockWriteFileSync,
  default: { writeFileSync: mockWriteFileSync },
}));

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { baselineCommand } = await import('../commands/baseline.js');

describe('baseline command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists.mockReturnValue(false);
    mockComputeFileHash.mockResolvedValue('abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  });

  it('creates a baseline file at the specified output path', async () => {
    await baselineCommand({ output: 'baseline.json' });

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [path, content] = mockWriteFileSync.mock.calls[0];
    expect(path).toBe('baseline.json');
    const baseline = JSON.parse(content as string);
    expect(baseline.version).toBe('1.0.0');
    expect(baseline.files).toBeDefined();
    expect(baseline.metadata.generatedBy).toBe('mirror-dissonance-cli');
  });

  it('marks existing files with their hash', async () => {
    mockFileExists.mockReturnValue(true);
    mockComputeFileHash.mockResolvedValue('deadbeef'.repeat(8));

    await baselineCommand({ output: 'out.json' });

    const baseline = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    const found = baseline.files.filter((f: any) => f.exists);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].hash).toBeTruthy();
  });

  it('marks missing files with empty hash', async () => {
    mockFileExists.mockReturnValue(false);

    await baselineCommand({ output: 'out.json' });

    const baseline = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    const missing = baseline.files.filter((f: any) => !f.exists);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0].hash).toBe('');
  });

  it('includes createdAt timestamp', async () => {
    await baselineCommand({ output: 'out.json' });

    const baseline = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
    expect(new Date(baseline.createdAt).getTime()).not.toBeNaN();
  });
});
