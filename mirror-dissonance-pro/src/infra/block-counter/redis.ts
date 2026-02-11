/**
 * Redis Block Counter
 *
 * Production implementation of BlockCounterAdapter backed by Redis.
 */

export class RedisBlockCounter {
  private readonly url: string;

  constructor(config: { url: string }) {
    this.url = config.url;
  }

  // Placeholder — full implementation in Phase 6D
}
