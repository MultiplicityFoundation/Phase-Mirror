/**
 * Block Counter Interface and In-Memory Implementation
 *
 * @deprecated The DynamoDBBlockCounter class has moved to
 *   `src/adapters/aws/block-counter.ts`. Use the adapter factory instead.
 *
 * Cloud-agnostic exports (BlockCounter interface, InMemoryBlockCounter) remain here.
 */

/**
 * Convert current time to Unix timestamp (seconds since epoch)
 */
function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export interface BlockCounter {
  increment(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<number>;
}

/**
 * In-memory block counter for testing
 */
export class InMemoryBlockCounter implements BlockCounter {
  private counts: Map<string, { count: number; expiresAt: number }> = new Map();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = getCurrentUnixTimestamp() + ttlSeconds;
    const current = this.counts.get(key);
    
    if (current && current.expiresAt > getCurrentUnixTimestamp()) {
      current.count += 1;
      this.counts.set(key, current);
      return current.count;
    } else {
      this.counts.set(key, { count: 1, expiresAt });
      return 1;
    }
  }

  async get(key: string): Promise<number> {
    const current = this.counts.get(key);
    if (!current || current.expiresAt <= getCurrentUnixTimestamp()) {
      return 0;
    }
    return current.count;
  }
}
