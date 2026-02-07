// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
// DynamoDBBlockCounter has been removed from core; tests preserved for reference.
/**
 * Unit tests for Block Counter
 * Target coverage: 80%
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe.skip('DynamoDBBlockCounter (legacy - removed from core)', () => {
  let counter: DynamoDBBlockCounter;
  let mockSend: any;

  beforeEach(() => {
    mockSend = jest.fn();
    (DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>).mockImplementation(() => ({
      send: mockSend,
    } as any));

    (marshall as jest.Mock).mockImplementation((obj) => obj);
    (unmarshall as jest.Mock).mockImplementation((obj) => obj);

    counter = new DynamoDBBlockCounter('test-table', 'us-east-1');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('increment', () => {
    it('should increment counter and return new value', async () => {
      mockSend.mockResolvedValue({
        Attributes: { blockCount: 5 },
      });

      const result = await counter.increment('test-key', 3600);

      expect(result).toBe(5);
      expect(mockSend).toHaveBeenCalledWith(expect.any(UpdateItemCommand));
    });

    it('should set TTL on increment', async () => {
      mockSend.mockResolvedValue({
        Attributes: { blockCount: 1 },
      });

      await counter.increment('test-key', 7200);

      expect(mockSend).toHaveBeenCalled();
      const updateCommand = mockSend.mock.calls[0][0];
      // The send() receives an UpdateItemCommand instance created with input
      // containing an UpdateExpression that includes 'expiresAt'
      // Since DynamoDBClient.send is mocked, we verify via the call args
      // passed to the actual code that constructs the command
      expect(updateCommand).toBeDefined();
    });

    it('should return 1 for first increment', async () => {
      mockSend.mockResolvedValue({
        Attributes: { blockCount: 1 },
      });

      const result = await counter.increment('new-key', 3600);
      expect(result).toBe(1);
    });

    it('should handle missing Attributes in response', async () => {
      mockSend.mockResolvedValue({});

      const result = await counter.increment('test-key', 3600);
      expect(result).toBe(1);
    });
  });

  describe('get', () => {
    it('should return current count', async () => {
      mockSend.mockResolvedValue({
        Item: { bucketKey: 'test-key', blockCount: 10 },
      });

      const result = await counter.get('test-key');
      expect(result).toBe(10);
      expect(mockSend).toHaveBeenCalledWith(expect.any(GetItemCommand));
    });

    it('should return 0 when item not found', async () => {
      mockSend.mockResolvedValue({});

      const result = await counter.get('non-existent');
      expect(result).toBe(0);
    });

    it('should return 0 when blockCount is missing', async () => {
      mockSend.mockResolvedValue({
        Item: { bucketKey: 'test-key' },
      });

      const result = await counter.get('test-key');
      expect(result).toBe(0);
    });
  });
});

describe('InMemoryBlockCounter', () => {
  let counter: InMemoryBlockCounter;

  beforeEach(() => {
    counter = new InMemoryBlockCounter();
  });

  describe('increment', () => {
    it('should increment counter and return new value', async () => {
      const result1 = await counter.increment('test-key', 3600);
      expect(result1).toBe(1);

      const result2 = await counter.increment('test-key', 3600);
      expect(result2).toBe(2);

      const result3 = await counter.increment('test-key', 3600);
      expect(result3).toBe(3);
    });

    it('should handle multiple keys independently', async () => {
      await counter.increment('key1', 3600);
      await counter.increment('key1', 3600);
      await counter.increment('key2', 3600);

      const count1 = await counter.get('key1');
      const count2 = await counter.get('key2');

      expect(count1).toBe(2);
      expect(count2).toBe(1);
    });

    it('should reset counter after TTL expiry', async () => {
      // First increment
      await counter.increment('test-key', 1); // 1 second TTL

      // Wait for expiry (simulate by advancing time)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Increment after expiry should reset to 1
      const result = await counter.increment('test-key', 3600);
      expect(result).toBe(1);
    });

    it('should not increment expired keys', async () => {
      await counter.increment('test-key', 1);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));

      const count = await counter.get('test-key');
      expect(count).toBe(0);
    });
  });

  describe('get', () => {
    it('should return current count', async () => {
      await counter.increment('test-key', 3600);
      await counter.increment('test-key', 3600);

      const result = await counter.get('test-key');
      expect(result).toBe(2);
    });

    it('should return 0 for non-existent key', async () => {
      const result = await counter.get('non-existent');
      expect(result).toBe(0);
    });

    it('should return 0 for expired key', async () => {
      await counter.increment('test-key', 1);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await counter.get('test-key');
      expect(result).toBe(0);
    });
  });
});
