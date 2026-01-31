/**
 * Unit tests for Anonymizer
 * Target coverage: 75%
 */
import { Anonymizer, NoOpAnonymizer, createAnonymizer } from '../index.js';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

jest.mock('@aws-sdk/client-ssm');

describe('Anonymizer', () => {
  let anonymizer: Anonymizer;
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    (SSMClient as jest.MockedClass<typeof SSMClient>).mockImplementation(() => ({
      send: mockSend,
    } as any));

    anonymizer = new Anonymizer({
      saltParameterName: '/test/salt',
      region: 'us-east-1',
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadSalt', () => {
    it('should load salt from SSM', async () => {
      const validSalt = 'a'.repeat(64); // 64 hex chars
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });

      await anonymizer.loadSalt();

      expect(mockSend).toHaveBeenCalledWith(expect.any(GetParameterCommand));
      expect(anonymizer.isSaltLoaded()).toBe(true);
    });

    it('should throw error when salt parameter not found', async () => {
      mockSend.mockResolvedValue({
        Parameter: {},
      });

      await expect(anonymizer.loadSalt()).rejects.toThrow('Salt parameter not found or empty');
    });

    it('should throw error for invalid salt format', async () => {
      mockSend.mockResolvedValue({
        Parameter: {
          Value: 'invalid-salt', // Not 64 hex chars
        },
      });

      await expect(anonymizer.loadSalt()).rejects.toThrow('Invalid salt format');
    });

    it('should store rotation month when loading salt', async () => {
      const validSalt = 'a'.repeat(64);
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });

      await anonymizer.loadSalt();

      const rotationMonth = anonymizer.getSaltRotationMonth();
      expect(rotationMonth).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should handle SSM errors', async () => {
      mockSend.mockRejectedValue(new Error('SSM unavailable'));

      await expect(anonymizer.loadSalt()).rejects.toThrow();
    });
  });

  describe('anonymizeOrgId', () => {
    beforeEach(async () => {
      const validSalt = 'a'.repeat(64);
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });
      await anonymizer.loadSalt();
    });

    it('should anonymize organization ID', async () => {
      const result = await anonymizer.anonymizeOrgId('test-org');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA256 hex digest
    });

    it('should produce consistent hash for same input', async () => {
      const hash1 = await anonymizer.anonymizeOrgId('test-org');
      const hash2 = await anonymizer.anonymizeOrgId('test-org');

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await anonymizer.anonymizeOrgId('org1');
      const hash2 = await anonymizer.anonymizeOrgId('org2');

      expect(hash1).not.toBe(hash2);
    });

    it('should throw error for empty orgId', async () => {
      await expect(anonymizer.anonymizeOrgId('')).rejects.toThrow('Organization ID cannot be empty');
    });

    it('should throw error for whitespace-only orgId', async () => {
      await expect(anonymizer.anonymizeOrgId('   ')).rejects.toThrow('Organization ID cannot be empty');
    });

    it('should throw error for orgId exceeding max length', async () => {
      const longOrgId = 'a'.repeat(256);
      await expect(anonymizer.anonymizeOrgId(longOrgId)).rejects.toThrow('exceeds maximum length');
    });

    it('should auto-load salt if not loaded', async () => {
      const newAnonymizer = new Anonymizer({
        saltParameterName: '/test/salt',
        region: 'us-east-1',
      });

      const validSalt = 'b'.repeat(64);
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });

      const result = await newAnonymizer.anonymizeOrgId('test-org');
      expect(result).toBeTruthy();
    });
  });

  describe('getSaltRotationMonth', () => {
    it('should return null when salt not loaded', () => {
      const result = anonymizer.getSaltRotationMonth();
      expect(result).toBeNull();
    });

    it('should return rotation month after loading salt', async () => {
      const validSalt = 'c'.repeat(64);
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });

      await anonymizer.loadSalt();
      const result = anonymizer.getSaltRotationMonth();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('isSaltLoaded', () => {
    it('should return false initially', () => {
      expect(anonymizer.isSaltLoaded()).toBe(false);
    });

    it('should return true after loading salt', async () => {
      const validSalt = 'd'.repeat(64);
      mockSend.mockResolvedValue({
        Parameter: {
          Value: validSalt,
        },
      });

      await anonymizer.loadSalt();
      expect(anonymizer.isSaltLoaded()).toBe(true);
    });
  });
});

describe('NoOpAnonymizer', () => {
  let anonymizer: NoOpAnonymizer;

  beforeEach(() => {
    anonymizer = new NoOpAnonymizer();
  });

  describe('loadSalt', () => {
    it('should not throw', async () => {
      await expect(anonymizer.loadSalt()).resolves.not.toThrow();
    });
  });

  describe('anonymizeOrgId', () => {
    it('should anonymize organization ID with test salt', async () => {
      const result = await anonymizer.anonymizeOrgId('test-org');

      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64);
    });

    it('should produce consistent hash', async () => {
      const hash1 = await anonymizer.anonymizeOrgId('test-org');
      const hash2 = await anonymizer.anonymizeOrgId('test-org');

      expect(hash1).toBe(hash2);
    });

    it('should throw error for empty orgId', async () => {
      await expect(anonymizer.anonymizeOrgId('')).rejects.toThrow('Organization ID cannot be empty');
    });
  });

  describe('getSaltRotationMonth', () => {
    it('should return current month', () => {
      const result = anonymizer.getSaltRotationMonth();
      expect(result).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('isSaltLoaded', () => {
    it('should always return true', () => {
      expect(anonymizer.isSaltLoaded()).toBe(true);
    });
  });
});

describe('createAnonymizer', () => {
  it('should create Anonymizer with config', () => {
    const anonymizer = createAnonymizer({
      saltParameterName: '/test/salt',
      region: 'us-east-1',
    });

    expect(anonymizer).toBeInstanceOf(Anonymizer);
  });

  it('should create NoOpAnonymizer without config', () => {
    const anonymizer = createAnonymizer();
    expect(anonymizer).toBeInstanceOf(NoOpAnonymizer);
  });

  it('should create NoOpAnonymizer with incomplete config', () => {
    const anonymizer = createAnonymizer({ saltParameterName: '' });
    expect(anonymizer).toBeInstanceOf(NoOpAnonymizer);
  });
});
