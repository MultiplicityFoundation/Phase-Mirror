/**
 * Local File-Based Adapters
 * 
 * Implements all cloud adapters using local JSON file storage.
 * Perfect for testing, development, and CI without cloud credentials.
 * 
 * Architecture:
 * - JsonFileStore<T>: Utility for atomic file writes
 * - All collections stored as JSON files in localDataDir
 * - UUID primary keys for consistency with cloud providers
 * - Hourly window keys for circuit breaker (automatic expiration)
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import {
  CloudConfig,
  Adapters,
  FPStoreAdapter,
  ConsentStoreAdapter,
  BlockCounterAdapter,
  SecretStoreAdapter,
  BaselineStoreAdapter,
} from '../types.js';
import { FPEvent, FPWindow } from '../../fp-store/types.js';
import { CalibrationConsent, ConsentQuery } from '../../consent-store/types.js';

/**
 * Utility class for atomic JSON file operations.
 * Uses an in-process mutex so concurrent read-modify-write cycles
 * within the same Node.js process are serialised correctly.
 */
class JsonFileStore<T> {
  private _lock: Promise<void> = Promise.resolve();

  constructor(
    private dataDir: string,
    private filename: string
  ) {}

  /**
   * Run `fn` while holding a per-store mutex.
   * Guarantees that concurrent callers are serialised.
   */
  async withLock<R>(fn: () => Promise<R>): Promise<R> {
    let release!: () => void;
    const next = new Promise<void>((res) => { release = res; });
    const prev = this._lock;
    this._lock = next;
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async read(): Promise<T[]> {
    const filePath = join(this.dataDir, this.filename);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async write(data: T[]): Promise<void> {
    const filePath = join(this.dataDir, this.filename);
    // Use a unique temp file per call to avoid races under concurrency
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    // Ensure directory exists
    await fs.mkdir(this.dataDir, { recursive: true });

    // Write to temp file
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');

    // Atomic rename (POSIX guarantee)
    await fs.rename(tempPath, filePath);
  }

  async readOne(predicate: (item: T) => boolean): Promise<T | null> {
    const items = await this.read();
    return items.find(predicate) || null;
  }

  async writeOne(item: T, idGetter: (item: T) => string): Promise<void> {
    await this.withLock(async () => {
      const items = await this.read();
      const id = idGetter(item);
      const index = items.findIndex((i) => idGetter(i) === id);

      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }

      await this.write(items);
    });
  }
}

/**
 * Local False Positive Store
 */
class LocalFPStore implements FPStoreAdapter {
  private store: JsonFileStore<FPEvent>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'fp-events.json');
  }

  async recordEvent(event: FPEvent): Promise<void> {
    await this.store.writeOne(event, (e) => e.eventId);
  }

  async markFalsePositive(findingId: string, reviewedBy: string, ticket: string): Promise<void> {
    await this.store.withLock(async () => {
      const events = await this.store.read();
      const updated = events.map((e) => {
        if (e.findingId === findingId) {
          return {
            ...e,
            isFalsePositive: true,
            reviewedBy,
            suppressionTicket: ticket,
            reviewedAt: new Date(),
          };
        }
        return e;
      });
      await this.store.write(updated);
    });
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    const events = await this.store.read();
    const ruleEvents = events
      .filter((e) => e.ruleId === ruleId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);

    return this.buildWindow(ruleId, ruleEvents);
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    const events = await this.store.read();
    const ruleEvents = events
      .filter((e) => e.ruleId === ruleId && new Date(e.timestamp) >= since)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return this.buildWindow(ruleId, ruleEvents);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    const event = await this.store.readOne((e) => e.findingId === findingId && e.isFalsePositive === true);
    return event !== null;
  }

  private buildWindow(ruleId: string, events: FPEvent[]): FPWindow {
    const total = events.length;
    const falsePositives = events.filter(e => e.isFalsePositive).length;
    const pending = events.filter(e => !e.reviewedBy).length;
    const truePositives = total - falsePositives - pending;
    const reviewed = total - pending;
    const observedFPR = reviewed > 0 ? falsePositives / reviewed : 0;

    // Get the most recent rule version
    const ruleVersion = events.length > 0 ? events[0].ruleVersion : '0.0.0';

    return {
      ruleId,
      ruleVersion,
      windowSize: total,
      events: events.map(e => ({
        ...e,
        timestamp: new Date(e.timestamp),
        reviewedAt: e.reviewedAt ? new Date(e.reviewedAt) : undefined,
      })),
      statistics: {
        total,
        falsePositives,
        truePositives,
        pending,
        observedFPR,
      },
    };
  }
}

/**
 * Local Consent Store
 */
class LocalConsentStore implements ConsentStoreAdapter {
  private store: JsonFileStore<CalibrationConsent>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'consent.json');
  }

  private hashId(id: string): string {
    return createHash('sha256').update(id).digest('hex');
  }

  async grantConsent(consent: CalibrationConsent): Promise<void> {
    const consentData = {
      ...consent,
      grantedBy: this.hashId(consent.grantedBy),
    };
    
    await this.store.writeOne(consentData, (c) => c.orgId);
  }

  async revokeConsent(orgId: string, revokedBy: string): Promise<void> {
    await this.store.withLock(async () => {
      const consents = await this.store.read();
      const updated = consents.map((c) => {
        if (c.orgId === orgId) {
          return {
            ...c,
            revokedAt: new Date(),
            revokedBy: this.hashId(revokedBy),
          } as any;
        }
        return c;
      });
      await this.store.write(updated);
    });
  }

  async hasConsent(query: ConsentQuery): Promise<boolean> {
    const consent = await this.getConsent(query.orgId);
    
    if (!consent) {
      return false;
    }

    // Check if revoked
    if ((consent as any).revokedAt) {
      return false;
    }

    // Check if expired
    if (consent.expiresAt && new Date(consent.expiresAt) < new Date()) {
      return false;
    }

    // If checking for specific resource
    if (query.resource) {
      return consent.resources.includes(query.resource);
    }

    return true;
  }

  async getConsent(orgId: string): Promise<CalibrationConsent | null> {
    const consent = await this.store.readOne((c) => c.orgId === orgId);
    
    if (!consent) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...consent,
      grantedAt: new Date(consent.grantedAt),
      expiresAt: consent.expiresAt ? new Date(consent.expiresAt) : undefined,
    };
  }
}

/**
 * Block counter entry
 */
interface BlockCounterEntry {
  key: string;
  count: number;
  timestamp: number;
  expiresAt: number;
}

/**
 * Local Block Counter
 */
class LocalBlockCounter implements BlockCounterAdapter {
  private store: JsonFileStore<BlockCounterEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'block-counter.json');
  }

  private async cleanExpiredUnsafe(): Promise<void> {
    const entries = await this.store.read();
    const now = Date.now();

    const validEntries = entries.filter((entry) => now < entry.expiresAt);

    if (validEntries.length < entries.length) {
      await this.store.write(validEntries);
    }
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    return this.store.withLock(async () => {
      await this.cleanExpiredUnsafe();

      const entries = await this.store.read();
      const entryIndex = entries.findIndex((e) => e.key === key);

      if (entryIndex >= 0) {
        entries[entryIndex].count += 1;
        entries[entryIndex].timestamp = Date.now();
        entries[entryIndex].expiresAt = Date.now() + ttlSeconds * 1000;
      } else {
        entries.push({
          key,
          count: 1,
          timestamp: Date.now(),
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
      }

      await this.store.write(entries);

      return entries[entryIndex >= 0 ? entryIndex : entries.length - 1].count;
    });
  }

  async get(key: string): Promise<number> {
    return this.store.withLock(async () => {
      await this.cleanExpiredUnsafe();

      const entry = await this.store.readOne((e) => e.key === key);

      if (!entry) {
        return 0;
      }

      // Double-check expiration
      if (Date.now() >= entry.expiresAt) {
        return 0;
      }

      return entry.count;
    });
  }
}

/**
 * Nonce storage entry
 */
interface NonceEntry {
  paramName: string;
  value: string;
  createdAt: string;
  version: number;
}

/**
 * Local Secret Store
 */
class LocalSecretStore implements SecretStoreAdapter {
  private store: JsonFileStore<NonceEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'secrets.json');
  }

  async getNonce(paramName: string): Promise<string> {
    const entries = await this.store.read();
    
    const nonces = entries.filter(e => e.paramName === paramName);
    
    if (nonces.length === 0) {
      throw new Error(`Nonce ${paramName} not found`);
    }

    // Get the latest version
    const latest = nonces.sort((a, b) => b.version - a.version)[0];
    return latest.value;
  }

  async getNonceWithVersion(paramName: string): Promise<{ value: string; version: number }> {
    const entries = await this.store.read();
    
    const nonces = entries.filter(e => e.paramName === paramName);
    
    if (nonces.length === 0) {
      throw new Error(`Nonce ${paramName} not found`);
    }

    // Get the latest version
    const latest = nonces.sort((a, b) => b.version - a.version)[0];
    return {
      value: latest.value,
      version: latest.version,
    };
  }

  async isReachable(): Promise<boolean> {
    try {
      await this.store.read();
      return true;
    } catch (error) {
      console.error('Secret store health check failed:', error);
      return false;
    }
  }
}

/**
 * Baseline file entry
 */
interface BaselineEntry {
  key: string;
  content: string;
  uploadedAt: string;
}

/**
 * Local Baseline Storage
 */
class LocalBaselineStorage implements BaselineStoreAdapter {
  private store: JsonFileStore<BaselineEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'baselines.json');
  }

  async getBaseline(key: string): Promise<string | null> {
    const entry = await this.store.readOne((e) => e.key === key);
    return entry?.content || null;
  }

  async putBaseline(key: string, content: string): Promise<void> {
    const entry: BaselineEntry = {
      key,
      content,
      uploadedAt: new Date().toISOString(),
    };

    await this.store.writeOne(entry, (e) => e.key);
  }
}

/**
 * Create local adapters
 */
export function createLocalAdapters(config: CloudConfig): Adapters {
  const dataDir = config.localDataDir || '.test-data';

  return {
    fpStore: new LocalFPStore(dataDir),
    consentStore: new LocalConsentStore(dataDir),
    blockCounter: new LocalBlockCounter(dataDir),
    secretStore: new LocalSecretStore(dataDir),
    baselineStore: new LocalBaselineStorage(dataDir),
    provider: 'local',
  };
}
