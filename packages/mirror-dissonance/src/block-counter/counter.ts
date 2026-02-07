/**
 * Block counter with TTL-based hourly buckets
 *
 * @deprecated The DynamoDB-backed BlockCounter class has moved to
 *   `src/adapters/aws/block-counter.ts`. Use the adapter factory instead.
 *
 * Cloud-agnostic exports (BlockCounterConfig, MemoryBlockCounter) remain here.
 */

export interface BlockCounterConfig {
  tableName: string;
  region?: string;
  ttlHours?: number;
}

export class MemoryBlockCounter {
  private counts: Map<string, { count: number; timestamp: number }> = new Map();
  private ttlMs: number;

  constructor(ttlHours: number = 24) {
    this.ttlMs = ttlHours * 3600 * 1000;
  }

  private getBucketKey(): string {
    const now = new Date();
    const bucketHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );
    return bucketHour.toISOString();
  }

  private cleanExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.counts.entries()) {
      if (now - value.timestamp > this.ttlMs) {
        this.counts.delete(key);
      }
    }
  }

  async increment(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    const current = this.counts.get(key) || { count: 0, timestamp: Date.now() };
    current.count += 1;
    current.timestamp = Date.now();
    this.counts.set(key, current);
    return current.count;
  }

  async getCount(ruleId: string): Promise<number> {
    this.cleanExpired();
    const key = `${this.getBucketKey()}-${ruleId}`;
    return this.counts.get(key)?.count || 0;
  }
}
