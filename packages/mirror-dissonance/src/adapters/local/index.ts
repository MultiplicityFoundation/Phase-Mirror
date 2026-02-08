/**
 * Local File-Based Adapters
 *
 * Implements all 5 cloud adapters using local JSON file storage.
 * Perfect for testing, development, and CI without cloud credentials.
 *
 * Architecture:
 * - JsonFileStore<T>: Utility for atomic JSON file reads/writes
 * - All collections stored as JSON files in ${localDataDir}/<collection>.json
 * - UUID primary keys via crypto.randomUUID() (matches DynamoDB/Firestore)
 * - Hourly window keys for block counter (automatic TTL-like expiration)
 * - Nonce read from ${localDataDir}/nonce.json, null if missing (fail-closed)
 *
 * Known limitations:
 * - No concurrent-write safety across multiple processes
 * - No real TTL expiration (hourly bucket keys simulate it)
 * - No atomic increments (single-process read-modify-write only)
 * - Fine for single-process tests, NOT for parallel runs
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import type { NonceConfig, FalsePositiveEvent, CalibrationResult, KAnonymityError, ConsentType } from '../../schemas/types.js';
import {
  CloudConfig,
  CloudAdapters,
  FPStoreAdapter,
  FPEvent,
  FPWindow,
  ConsentStoreAdapter,
  BlockCounterAdapter,
  SecretStoreAdapter,
  ObjectStoreAdapter,
  BaselineStorageAdapter,
  CalibrationStoreAdapter,
} from '../types.js';
import { SecretStoreError, BlockCounterError } from '../errors.js';

// ---------------------------------------------------------------------------
// JsonFileStore<T> — atomic JSON file operations
// ---------------------------------------------------------------------------

class JsonFileStore<T> {
  private _lock: Promise<void> = Promise.resolve();

  constructor(
    private dataDir: string,
    private filename: string,
  ) {}

  /** Serialise concurrent read-modify-write cycles within the same process. */
  async withLock<R>(fn: () => Promise<R>): Promise<R> {
    let release!: () => void;
    const next = new Promise<void>((res) => {
      release = res;
    });
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
    const tempPath = `${filePath}.${randomUUID()}.tmp`;

    await fs.mkdir(this.dataDir, { recursive: true });
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
      const idx = items.findIndex((i) => idGetter(i) === id);
      if (idx >= 0) {
        items[idx] = item;
      } else {
        items.push(item);
      }
      await this.write(items);
    });
  }
}

// ---------------------------------------------------------------------------
// LocalFPStore
// ---------------------------------------------------------------------------

/** Stored FP event with serialisable timestamp. */
interface StoredFPEvent extends Omit<FPEvent, 'timestamp'> {
  timestamp: string;
}

class LocalFPStore implements FPStoreAdapter {
  private store: JsonFileStore<StoredFPEvent>;
  private fpEventStore: JsonFileStore<FalsePositiveEvent>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'fp-events.json');
    this.fpEventStore = new JsonFileStore(dataDir, 'fp-false-positives.json');
  }

  async recordEvent(event: FPEvent): Promise<void> {
    const stored: StoredFPEvent = {
      ...event,
      timestamp: event.timestamp.toISOString(),
    };
    await this.store.writeOne(stored, (e) => e.eventId);
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    const all = await this.store.read();
    const matching = all
      .filter((e) => e.ruleId === ruleId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, count);
    return this.computeWindow(ruleId, matching.map(this.toFPEvent));
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    const all = await this.store.read();
    const sinceMs = since.getTime();
    const matching = all
      .filter((e) => e.ruleId === ruleId && new Date(e.timestamp).getTime() >= sinceMs)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return this.computeWindow(ruleId, matching.map(this.toFPEvent));
  }

  async markFalsePositive(eventId: string, _reviewedBy: string): Promise<void> {
    await this.store.withLock(async () => {
      const items = await this.store.read();
      const idx = items.findIndex((e) => e.eventId === eventId);
      if (idx >= 0) {
        items[idx].isFalsePositive = true;
        await this.store.write(items);
      }
    });
  }

  async isFalsePositive(ruleIdOrFindingId: string, findingId?: string): Promise<boolean> {
    if (findingId !== undefined) {
      // 2-arg: search by ruleId AND findingId in windowed event store
      const event = await this.store.readOne(
        (e) => e.ruleId === ruleIdOrFindingId && e.findingId === findingId && e.isFalsePositive,
      );
      if (event) return true;
      // Also check simple FP store
      const fpEvent = await this.fpEventStore.readOne(
        (e) => e.ruleId === ruleIdOrFindingId && e.findingId === findingId,
      );
      return fpEvent !== null;
    } else {
      // 1-arg: search by findingId only
      const actualFindingId = ruleIdOrFindingId;
      const fpEvent = await this.fpEventStore.readOne(
        (e) => e.findingId === actualFindingId,
      );
      if (fpEvent) return true;
      const event = await this.store.readOne(
        (e) => e.findingId === actualFindingId && e.isFalsePositive,
      );
      return event !== null;
    }
  }

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    await this.fpEventStore.writeOne(event, (e) => e.id);
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    const all = await this.fpEventStore.read();
    return all.filter((e) => e.ruleId === ruleId);
  }

  computeWindow(ruleId: string, events: FPEvent[]): FPWindow {
    const falsePositives = events.filter((e) => e.isFalsePositive).length;
    const total = events.length;
    // Pending = not yet reviewed (not explicitly marked true or false)
    // For local store all events are either FP or TP, so pending = 0
    const pending = 0;
    const truePositives = total - falsePositives - pending;
    const denominator = total - pending;
    const observedFPR = denominator > 0 ? falsePositives / denominator : 0;

    const ruleVersion = events.length > 0 ? events[0].ruleVersion : 'unknown';

    return {
      ruleId,
      ruleVersion,
      windowSize: total,
      events,
      statistics: {
        total,
        falsePositives,
        truePositives,
        pending,
        observedFPR,
      },
    };
  }

  private toFPEvent(stored: StoredFPEvent): FPEvent {
    return {
      ...stored,
      timestamp: new Date(stored.timestamp),
    };
  }
}

// ---------------------------------------------------------------------------
// LocalConsentStore
// ---------------------------------------------------------------------------

interface ConsentRecord {
  id: string;
  orgId: string;
  repoId?: string;
  scope: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  revoked: boolean;
}

class LocalConsentStore implements ConsentStoreAdapter {
  private store: JsonFileStore<ConsentRecord>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'consent.json');
  }

  async recordConsent(consent: {
    orgId: string;
    repoId?: string;
    scope: string;
    grantedBy: string;
    expiresAt?: Date;
  }): Promise<void> {
    const record: ConsentRecord = {
      id: randomUUID(),
      orgId: consent.orgId,
      repoId: consent.repoId,
      scope: consent.scope,
      grantedBy: consent.grantedBy,
      grantedAt: new Date().toISOString(),
      expiresAt: consent.expiresAt?.toISOString(),
      revoked: false,
    };
    await this.store.writeOne(record, (r) => r.id);
  }

  async hasValidConsent(orgId: string, repoId?: string, scope?: string): Promise<boolean> {
    const all = await this.store.read();
    const now = Date.now();
    return all.some(
      (r) =>
        r.orgId === orgId &&
        (!repoId || r.repoId === repoId || !r.repoId) &&
        (!scope || r.scope === scope) &&
        !r.revoked &&
        (!r.expiresAt || new Date(r.expiresAt).getTime() > now),
    );
  }

  async revokeConsent(orgId: string, scope: string, _revokedBy?: string): Promise<void> {
    await this.store.withLock(async () => {
      const items = await this.store.read();
      let changed = false;
      for (const item of items) {
        if (item.orgId === orgId && item.scope === scope && !item.revoked) {
          item.revoked = true;
          changed = true;
        }
      }
      if (changed) {
        await this.store.write(items);
      }
    });
  }

  async getConsent(orgId: string): Promise<any> {
    const all = await this.store.read();
    return all.filter((r) => r.orgId === orgId);
  }

  async grantConsent(orgId: string, scope: string, grantedBy: string, expiresAt?: Date): Promise<void> {
    await this.recordConsent({ orgId, scope, grantedBy, expiresAt });
  }

  async checkResourceConsent(orgId: string, scope: string): Promise<{ granted: boolean; state: string }> {
    const all = await this.store.read();
    const matching = all.filter((r) => r.orgId === orgId && r.scope === scope);

    if (matching.length === 0) {
      return { granted: false, state: 'not_requested' };
    }

    const latest = matching[matching.length - 1];

    if (latest.revoked) {
      return { granted: false, state: 'revoked' };
    }

    if (latest.expiresAt && new Date(latest.expiresAt).getTime() <= Date.now()) {
      return { granted: false, state: 'expired' };
    }

    return { granted: true, state: 'granted' };
  }

  async checkMultipleResources(orgId: string, scopes: string[]): Promise<{
    allGranted: boolean;
    missingConsent: string[];
    results: Record<string, { granted: boolean }>;
  }> {
    const results: Record<string, { granted: boolean }> = {};
    const missingConsent: string[] = [];

    for (const scope of scopes) {
      const check = await this.checkResourceConsent(orgId, scope);
      results[scope] = { granted: check.granted };
      if (!check.granted) {
        missingConsent.push(scope);
      }
    }

    return { allGranted: missingConsent.length === 0, missingConsent, results };
  }

  async getConsentSummary(orgId: string): Promise<{
    orgId: string;
    resources: Record<string, { state: string }>;
  } | null> {
    const all = await this.store.read();
    const orgRecords = all.filter((r) => r.orgId === orgId);

    if (orgRecords.length === 0) return null;

    const resources: Record<string, { state: string }> = {};
    const scopes = [...new Set(orgRecords.map((r) => r.scope))];

    for (const scope of scopes) {
      const check = await this.checkResourceConsent(orgId, scope);
      resources[scope] = { state: check.state };
    }

    return { orgId, resources };
  }

  async checkConsent(orgId: string): Promise<ConsentType> {
    const all = await this.store.read();
    const now = Date.now();
    const valid = all.filter(
      (r) => r.orgId === orgId && !r.revoked &&
        (!r.expiresAt || new Date(r.expiresAt).getTime() > now),
    );
    return valid.length > 0 ? 'explicit' : 'none';
  }
}

// ---------------------------------------------------------------------------
// LocalBlockCounter
// ---------------------------------------------------------------------------

interface BlockCounterEntry {
  bucketKey: string; // "${ruleId}:${orgId}:${YYYY-MM-DD-HH}"
  count: number;
  updatedAt: string;
}

class LocalBlockCounter implements BlockCounterAdapter {
  private store: JsonFileStore<BlockCounterEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'block-counter.json');
  }

  private hourKey(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    return `${y}-${m}-${d}-${h}`;
  }

  private bucketKey(ruleId: string, orgId: string): string {
    return `${ruleId}:${orgId}:${this.hourKey()}`;
  }

  async increment(ruleId: string, orgId: string): Promise<number> {
    try {
      return await this.store.withLock(async () => {
        const key = this.bucketKey(ruleId, orgId);
        const items = await this.store.read();
        const idx = items.findIndex((e) => e.bucketKey === key);

        if (idx >= 0) {
          items[idx].count += 1;
          items[idx].updatedAt = new Date().toISOString();
          await this.store.write(items);
          return items[idx].count;
        }

        const entry: BlockCounterEntry = {
          bucketKey: key,
          count: 1,
          updatedAt: new Date().toISOString(),
        };
        items.push(entry);
        await this.store.write(items);
        return 1;
      });
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to increment counter in local store',
        'INCREMENT_FAILED',
        { source: 'local-file', ruleId, orgId, originalError: error },
      );
    }
  }

  async getCount(ruleId: string, orgId: string): Promise<number> {
    try {
      const key = this.bucketKey(ruleId, orgId);
      const entry = await this.store.readOne((e) => e.bucketKey === key);
      return entry?.count ?? 0;
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to read counter from local store',
        'READ_FAILED',
        { source: 'local-file', ruleId, orgId, originalError: error },
      );
    }
  }

  async isCircuitBroken(ruleId: string, orgId: string, threshold: number): Promise<boolean> {
    try {
      const count = await this.getCount(ruleId, orgId);
      return count >= threshold;
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to check circuit breaker in local store',
        'CIRCUIT_CHECK_FAILED',
        { source: 'local-file', ruleId, orgId, threshold, originalError: error },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// LocalSecretStore
// ---------------------------------------------------------------------------

interface NonceEntry {
  value: string;
  createdAt: string;
  version: number;
}

class LocalSecretStore implements SecretStoreAdapter {
  private store: JsonFileStore<NonceEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'nonce.json');
  }

  async getNonce(): Promise<NonceConfig> {
    try {
      const entries = await this.store.read();
      if (entries.length === 0) {
        throw new SecretStoreError(
          'No nonce found in local store',
          'NONCE_NOT_FOUND',
          { source: 'local-file' },
        );
      }
      // Return the latest version
      const latest = entries.sort((a, b) => b.version - a.version)[0];
      return {
        value: latest.value,
        loadedAt: new Date().toISOString(),
        source: 'local-file',
      };
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to load nonce from local store',
        'READ_FAILED',
        { source: 'local-file', originalError: error },
      );
    }
  }

  async getNonces(): Promise<string[]> {
    try {
      const entries = await this.store.read();
      if (entries.length === 0) {
        throw new SecretStoreError(
          'No nonces found in local store',
          'NONCE_NOT_FOUND',
          { source: 'local-file' },
        );
      }
      return entries
        .sort((a, b) => b.version - a.version)
        .map((e) => e.value);
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to load nonces from local store',
        'VERSIONS_FAILED',
        { source: 'local-file', originalError: error },
      );
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    try {
      await this.store.withLock(async () => {
        const entries = await this.store.read();
        const nextVersion = entries.length > 0
          ? Math.max(...entries.map((e) => e.version)) + 1
          : 1;
        entries.push({
          value: newValue,
          createdAt: new Date().toISOString(),
          version: nextVersion,
        });
        await this.store.write(entries);
      });
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to rotate nonce in local store',
        'ROTATION_FAILED',
        { source: 'local-file', originalError: error },
      );
    }
  }
}

// ---------------------------------------------------------------------------
// LocalObjectStore
// ---------------------------------------------------------------------------

interface ObjectEntry {
  repoId: string;
  content: string;
  updatedAt: string;
  versionId: string;
}

class LocalObjectStore implements ObjectStoreAdapter {
  private store: JsonFileStore<ObjectEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'baselines.json');
  }

  async getBaseline(repoId: string): Promise<any | null> {
    const entry = await this.store.readOne((e) => e.repoId === repoId);
    if (!entry) return null;
    try {
      return JSON.parse(entry.content);
    } catch {
      return entry.content;
    }
  }

  async putBaseline(repoId: string, baseline: any): Promise<void> {
    const entry: ObjectEntry = {
      repoId,
      content: JSON.stringify(baseline),
      updatedAt: new Date().toISOString(),
      versionId: randomUUID(),
    };
    await this.store.writeOne(entry, (e) => e.repoId);
  }

  async listBaselineVersions(
    repoId: string,
  ): Promise<Array<{ versionId: string; lastModified: Date }>> {
    const all = await this.store.read();
    return all
      .filter((e) => e.repoId === repoId)
      .map((e) => ({
        versionId: e.versionId,
        lastModified: new Date(e.updatedAt),
      }))
      .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }
}

// ---------------------------------------------------------------------------
// LocalBaselineStorage
// ---------------------------------------------------------------------------

interface BaselineEntry {
  name: string;
  content: string;
  updatedAt: string;
}

class LocalBaselineStorage implements BaselineStorageAdapter {
  private store: JsonFileStore<BaselineEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'baseline-storage.json');
  }

  async storeBaseline(name: string, content: string | Buffer): Promise<void> {
    const entry: BaselineEntry = {
      name,
      content: Buffer.isBuffer(content) ? content.toString('utf-8') : content,
      updatedAt: new Date().toISOString(),
    };
    await this.store.writeOne(entry, (e) => e.name);
  }

  async getBaseline(name: string): Promise<string | null> {
    const entry = await this.store.readOne((e) => e.name === name);
    return entry?.content ?? null;
  }

  async listBaselines(): Promise<Array<{ version: string }>> {
    const all = await this.store.read();
    return all.map((e) => ({ version: e.name }));
  }

  async deleteBaseline(name: string): Promise<void> {
    await this.store.withLock(async () => {
      const items = await this.store.read();
      const filtered = items.filter((e) => e.name !== name);
      await this.store.write(filtered);
    });
  }
}

// ---------------------------------------------------------------------------
// LocalCalibrationStore
// ---------------------------------------------------------------------------

class LocalCalibrationStore implements CalibrationStoreAdapter {
  private fpEventStore: JsonFileStore<FalsePositiveEvent>;
  private kThreshold = 5;

  constructor(dataDir: string) {
    // Reads from the same file as LocalFPStore.recordFalsePositive
    this.fpEventStore = new JsonFileStore(dataDir, 'fp-false-positives.json');
  }

  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    const events = await this.fpEventStore.read();
    const matching = events.filter((e) => e.ruleId === ruleId);
    const distinctOrgs = new Set(matching.map((e) => e.orgIdHash).filter(Boolean));

    if (distinctOrgs.size < this.kThreshold) {
      return {
        error: 'INSUFFICIENT_K_ANONYMITY',
        message: `Rule ${ruleId} has data from ${distinctOrgs.size} orgs, requires ${this.kThreshold}`,
        requiredK: this.kThreshold,
        actualK: distinctOrgs.size,
      };
    }

    return {
      ruleId,
      totalFPs: matching.length,
      orgCount: distinctOrgs.size,
      averageFPsPerOrg: matching.length / distinctOrgs.size,
      meetsKAnonymity: true,
    };
  }

  async getRuleFPRate(ruleId: string, since?: string): Promise<CalibrationResult | KAnonymityError> {
    const events = await this.fpEventStore.read();
    let matching = events.filter((e) => e.ruleId === ruleId);

    if (since) {
      const sinceMs = new Date(since).getTime();
      matching = matching.filter((e) => new Date(e.timestamp).getTime() >= sinceMs);
    }

    const distinctOrgs = new Set(matching.map((e) => e.orgIdHash).filter(Boolean));

    if (distinctOrgs.size < this.kThreshold) {
      return {
        error: 'INSUFFICIENT_K_ANONYMITY',
        message: `Rule ${ruleId} has data from ${distinctOrgs.size} orgs after filter, requires ${this.kThreshold}`,
        requiredK: this.kThreshold,
        actualK: distinctOrgs.size,
      };
    }

    return {
      ruleId,
      totalFPs: matching.length,
      orgCount: distinctOrgs.size,
      averageFPsPerOrg: matching.length / distinctOrgs.size,
      meetsKAnonymity: true,
    };
  }

  async getAllRuleFPRates(): Promise<Array<CalibrationResult | KAnonymityError>> {
    const events = await this.fpEventStore.read();
    const ruleIds = [...new Set(events.map((e) => e.ruleId))];
    return Promise.all(ruleIds.map((ruleId) => this.aggregateFPsByRule(ruleId)));
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalAdapters(config: CloudConfig): CloudAdapters {
  const dataDir = config.localDataDir || '.phase-mirror-data';
  return {
    fpStore: new LocalFPStore(dataDir),
    consentStore: new LocalConsentStore(dataDir),
    blockCounter: new LocalBlockCounter(dataDir),
    secretStore: new LocalSecretStore(dataDir),
    objectStore: new LocalObjectStore(dataDir),
    baselineStorage: new LocalBaselineStorage(dataDir),
    calibrationStore: new LocalCalibrationStore(dataDir),
  };
}
