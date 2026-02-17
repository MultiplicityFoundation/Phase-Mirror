/**
 * Tests for the config command
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock loadConfig
const mockLoadConfig = jest.fn<() => Promise<any>>();
jest.unstable_mockModule('../lib/config.js', () => ({
  loadConfig: mockLoadConfig,
}));

// Mock fs/promises (ESM-compatible) — must export all named exports used transitively
const mockWriteFile = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockReadFile = jest.fn<() => Promise<string>>().mockResolvedValue('{}');
const fsMod = {
  writeFile: mockWriteFile,
  readFile: mockReadFile,
  access: jest.fn(),
  mkdir: jest.fn(),
  stat: jest.fn(),
  readdir: jest.fn(),
  unlink: jest.fn(),
  rmdir: jest.fn(),
  rename: jest.fn(),
  copyFile: jest.fn(),
  chmod: jest.fn(),
  chown: jest.fn(),
  lstat: jest.fn(),
  link: jest.fn(),
  symlink: jest.fn(),
  realpath: jest.fn(),
  mkdtemp: jest.fn(),
  truncate: jest.fn(),
  open: jest.fn(),
  appendFile: jest.fn(),
  watch: jest.fn(),
  cp: jest.fn(),
  constants: {},
};
jest.unstable_mockModule('fs/promises', () => ({
  ...fsMod,
  default: fsMod,
}));

// Mock js-yaml
const mockDump = jest.fn((o: any) => JSON.stringify(o));
jest.unstable_mockModule('js-yaml', () => {
  const mod = {
    load: jest.fn((s: string) => JSON.parse(s)),
    dump: mockDump,
  };
  return { ...mod, default: mod };
});

const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

const { configCommand } = await import('../commands/config.js');

const defaultConfig = {
  version: '1',
  rules: { enabled: ['MD-001', 'MD-002'] },
  l0_invariants: { enabled: true, strict: false },
  drift: { enabled: true, threshold: 0.15 },
};

describe('config command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadConfig.mockResolvedValue(structuredClone(defaultConfig));
  });

  describe('show', () => {
    it('loads and displays the configuration', async () => {
      await configCommand.show();

      expect(mockLoadConfig).toHaveBeenCalled();
    });

    it('throws CLIError when config missing', async () => {
      mockLoadConfig.mockRejectedValue(new Error('ENOENT'));

      await expect(configCommand.show()).rejects.toThrow('Failed to load configuration');
    });
  });

  describe('get', () => {
    it('returns a top-level key', async () => {
      await configCommand.get('version');

      expect(logSpy).toHaveBeenCalledWith('1');
    });

    it('returns a nested key', async () => {
      await configCommand.get('drift.threshold');

      expect(logSpy).toHaveBeenCalledWith(0.15);
    });

    it('throws on missing key', async () => {
      await expect(configCommand.get('nonexistent.key')).rejects.toThrow('Configuration key not found');
    });

    it('blocks prototype pollution attempts', async () => {
      await expect(configCommand.get('__proto__')).rejects.toThrow('potential security risk');
    });
  });

  describe('set', () => {
    it('sets a top-level value', async () => {
      await configCommand.set('version', '2');

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
    });

    it('parses boolean values', async () => {
      await configCommand.set('drift.enabled', 'false');

      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('blocks prototype pollution on set', async () => {
      await expect(configCommand.set('__proto__.polluted', 'true')).rejects.toThrow(
        'potential security risk'
      );
    });
  });

  describe('validate', () => {
    it('validates a valid config', async () => {
      await configCommand.validate({ config: '.phase-mirror.yml' });

      expect(mockLoadConfig).toHaveBeenCalledWith('.phase-mirror.yml');
    });

    it('throws on invalid config', async () => {
      mockLoadConfig.mockRejectedValue(new Error('bad version'));

      await expect(
        configCommand.validate({ config: 'bad.yml' })
      ).rejects.toThrow('Configuration validation failed');
    });
  });
});
