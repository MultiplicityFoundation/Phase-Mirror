/**
 * Local In-Memory Block Counter Adapter
 */

import { BlockCounterAdapter } from '../types.js';

interface CounterEntry {
  count: number;
  expiresAt: number;
}

/**
 * Get current Unix timestamp in seconds
 */
function getCurrentUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

export class LocalBlockCounterAdapter implements BlockCounterAdapter {
  private counters: Map<string, CounterEntry> = new Map();

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const expiresAt = getCurrentUnixTimestamp() + ttlSeconds;
    const current = this.counters.get(key);

    if (current && current.expiresAt > getCurrentUnixTimestamp()) {
      current.count += 1;
      this.counters.set(key, current);
      return current.count;
    } else {
      this.counters.set(key, { count: 1, expiresAt });
      return 1;
    }
  }

  async get(key: string): Promise<number> {
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= getCurrentUnixTimestamp()) {
      return 0;
    }
    return current.count;
  }

  async reset(key: string): Promise<void> {
    this.counters.delete(key);
  }

  // Testing utility
  clear(): void {
    this.counters.clear();
  }
}
