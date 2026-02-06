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
  IFPStoreAdapter,
  IConsentStoreAdapter,
  IBlockCounterAdapter,
  ISecretStoreAdapter,
  IBaselineStorageAdapter,
  ICalibrationStoreAdapter,
  NonceConfig,
  BaselineVersion,
  CalibrationResult,
  KAnonymityError,
} from '../types.js';
import { FalsePositiveEvent } from '../../../schemas/types.js';
import {
  OrganizationConsent,
  ConsentResource,
  ConsentCheckResult,
  MultiResourceConsentResult,
  CURRENT_CONSENT_POLICY,
  ConsentEvent,
} from '../../consent-store/schema.js';

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
class LocalFPStore implements IFPStoreAdapter {
  private store: JsonFileStore<FalsePositiveEvent>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'fp-events.json');
  }

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    await this.store.writeOne(event, (e) => e.id);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    const event = await this.store.readOne((e) => e.findingId === findingId);
    return event !== null;
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    const events = await this.store.read();
    return events.filter((e) => e.ruleId === ruleId);
  }
}

/**
 * Local Consent Store
 */
class LocalConsentStore implements IConsentStoreAdapter {
  private store: JsonFileStore<OrganizationConsent>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'consent.json');
  }

  private hashOrgId(orgId: string): string {
    return createHash('sha256').update(orgId).digest('hex');
  }

  private hashAdminId(adminId: string): string {
    return createHash('sha256').update(adminId).digest('hex');
  }

  async checkResourceConsent(orgId: string, resource: ConsentResource): Promise<ConsentCheckResult> {
    const summary = await this.getConsentSummary(orgId);

    if (!summary) {
      return {
        granted: false,
        state: 'not_requested',
        resource,
        reason: 'No consent record found',
      };
    }

    const resourceStatus = summary.resources[resource];

    if (!resourceStatus) {
      return {
        granted: false,
        state: 'not_requested',
        resource,
        reason: 'Resource not in consent record',
      };
    }

    // Check if consent is expired
    if (resourceStatus.expiresAt && new Date(resourceStatus.expiresAt) < new Date()) {
      return {
        granted: false,
        state: 'expired',
        resource,
        grantedAt: resourceStatus.grantedAt,
        expiresAt: resourceStatus.expiresAt,
        version: resourceStatus.version,
        reason: 'Consent has expired',
      };
    }

    // Check consent version mismatch
    if (
      resourceStatus.version &&
      resourceStatus.version !== CURRENT_CONSENT_POLICY.version
    ) {
      return {
        granted: false,
        state: resourceStatus.state,
        resource,
        grantedAt: resourceStatus.grantedAt,
        expiresAt: resourceStatus.expiresAt,
        version: resourceStatus.version,
        reason: `Policy version mismatch (granted: ${resourceStatus.version}, current: ${CURRENT_CONSENT_POLICY.version})`,
      };
    }

    const granted = resourceStatus.state === 'granted';

    return {
      granted,
      state: resourceStatus.state,
      resource,
      grantedAt: resourceStatus.grantedAt,
      expiresAt: resourceStatus.expiresAt,
      version: resourceStatus.version,
      reason: granted ? undefined : `Consent state is ${resourceStatus.state}`,
    };
  }

  async checkMultipleResources(
    orgId: string,
    resources: ConsentResource[]
  ): Promise<MultiResourceConsentResult> {
    const results: Record<ConsentResource, ConsentCheckResult> = {} as any;
    const missingConsent: ConsentResource[] = [];

    for (const resource of resources) {
      const result = await this.checkResourceConsent(orgId, resource);
      results[resource] = result;

      if (!result.granted) {
        missingConsent.push(resource);
      }
    }

    return {
      allGranted: missingConsent.length === 0,
      results,
      missingConsent,
    };
  }

  async getConsentSummary(orgId: string): Promise<OrganizationConsent | null> {
    const consent = await this.store.readOne((c) => c.orgId === orgId);
    
    if (!consent) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...consent,
      createdAt: new Date(consent.createdAt),
      updatedAt: new Date(consent.updatedAt),
    };
  }

  async grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    let summary = await this.getConsentSummary(orgId);

    const now = new Date();

    if (!summary) {
      // Create new consent record
      summary = {
        orgId,
        resources: {} as any,
        grantedBy: this.hashAdminId(grantedBy),
        consentVersion: CURRENT_CONSENT_POLICY.version,
        history: [],
        createdAt: now,
        updatedAt: now,
      };
    }

    // Update or create resource status
    const previousState = summary.resources[resource]?.state;

    summary.resources[resource] = {
      resource,
      state: 'granted',
      grantedAt: now,
      expiresAt,
      version: CURRENT_CONSENT_POLICY.version,
    };

    // Add to history
    const event: ConsentEvent = {
      eventId: randomUUID(),
      eventType: previousState ? 'renewed' : 'granted',
      resource,
      timestamp: now,
      actor: this.hashAdminId(grantedBy),
      previousState,
      newState: 'granted',
    };

    summary.history.push(event);
    summary.updatedAt = now;

    // Save to store
    await this.store.writeOne(summary, (s) => s.orgId);
  }

  async revokeConsent(orgId: string, resource: ConsentResource, revokedBy: string): Promise<void> {
    const summary = await this.getConsentSummary(orgId);

    if (!summary) {
      throw new Error(`No consent record found for organization: ${orgId}`);
    }

    const previousState = summary.resources[resource]?.state;

    if (!previousState || previousState === 'revoked') {
      // Already revoked or never granted
      return;
    }

    const now = new Date();

    summary.resources[resource] = {
      ...summary.resources[resource],
      state: 'revoked',
      revokedAt: now,
    };

    // Add to history
    const event: ConsentEvent = {
      eventId: randomUUID(),
      eventType: 'revoked',
      resource,
      timestamp: now,
      actor: this.hashAdminId(revokedBy),
      previousState,
      newState: 'revoked',
    };

    summary.history.push(event);
    summary.updatedAt = now;

    // Save to store
    await this.store.writeOne(summary, (s) => s.orgId);
  }

  async checkConsent(orgId: string): Promise<'explicit' | 'implicit' | 'none'> {
    const summary = await this.getConsentSummary(orgId);
    if (!summary) {
      return 'none';
    }

    // Check if any resource has granted consent
    const hasAnyConsent = Object.values(summary.resources).some(
      (status) => status.state === 'granted'
    );

    return hasAnyConsent ? 'explicit' : 'none';
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    const consentType = await this.checkConsent(orgId);
    return consentType === 'explicit' || consentType === 'implicit';
  }
}

/**
 * Block counter entry
 */
interface BlockCounterEntry {
  bucketKey: string;
  ruleId: string;
  count: number;
  timestamp: number;
}

/**
 * Local Block Counter
 */
class LocalBlockCounter implements IBlockCounterAdapter {
  private store: JsonFileStore<BlockCounterEntry>;
  private ttlHours: number;

  constructor(dataDir: string, ttlHours: number = 24) {
    this.store = new JsonFileStore(dataDir, 'block-counter.json');
    this.ttlHours = ttlHours;
  }

  private getBucketKey(): string {
    // Create hourly bucket key
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

  /**
   * Remove expired entries. Acquires the store lock.
   * Use _cleanExpiredUnsafe when already holding the lock.
   */
  private async cleanExpired(): Promise<void> {
    await this.store.withLock(async () => {
      await this._cleanExpiredUnsafe();
    });
  }

  /** Remove expired entries without acquiring the lock (caller must hold it). */
  private async _cleanExpiredUnsafe(): Promise<void> {
    const entries = await this.store.read();
    const now = Date.now();
    const ttlMs = this.ttlHours * 3600 * 1000;

    const validEntries = entries.filter((entry) => now - entry.timestamp < ttlMs);

    if (validEntries.length < entries.length) {
      await this.store.write(validEntries);
    }
  }

  async increment(ruleId: string): Promise<number> {
    return this.store.withLock(async () => {
      await this._cleanExpiredUnsafe();

      const bucketKey = this.getBucketKey();
      const entries = await this.store.read();
      const entryIndex = entries.findIndex(
        (e) => e.bucketKey === bucketKey && e.ruleId === ruleId
      );

      if (entryIndex >= 0) {
        entries[entryIndex].count += 1;
        entries[entryIndex].timestamp = Date.now();
      } else {
        entries.push({
          bucketKey,
          ruleId,
          count: 1,
          timestamp: Date.now(),
        });
      }

      await this.store.write(entries);

      return entries[entryIndex >= 0 ? entryIndex : entries.length - 1].count;
    });
  }

  async getCount(ruleId: string): Promise<number> {
    await this.cleanExpired();

    const bucketKey = this.getBucketKey();
    const entry = await this.store.readOne(
      (e) => e.bucketKey === bucketKey && e.ruleId === ruleId
    );

    return entry?.count || 0;
  }
}

/**
 * Nonce storage entry
 */
interface NonceEntry {
  value: string;
  createdAt: string;
  version: number;
}

/**
 * Local Secret Store
 */
class LocalSecretStore implements ISecretStoreAdapter {
  private store: JsonFileStore<NonceEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'nonce.json');
  }

  async getNonce(): Promise<NonceConfig | null> {
    try {
      const entries = await this.store.read();
      
      if (entries.length === 0) {
        return null;
      }

      // Get the latest version
      const latest = entries.sort((a, b) => b.version - a.version)[0];

      return {
        value: latest.value,
        loadedAt: new Date().toISOString(),
        source: 'local-file',
      };
    } catch (error) {
      console.error('Failed to load nonce:', error);
      return null; // Fail-closed
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    await this.store.withLock(async () => {
      const entries = await this.store.read();
      const maxVersion = entries.length > 0 ? Math.max(...entries.map((e) => e.version)) : 0;

      entries.push({
        value: newValue,
        createdAt: new Date().toISOString(),
        version: maxVersion + 1,
      });

      await this.store.write(entries);
    });
  }
}

/**
 * Baseline file entry
 */
interface BaselineEntry {
  key: string;
  content: string;
  uploadedAt: string;
  size: number;
  contentType?: string;
}

/**
 * Local Baseline Storage
 */
class LocalBaselineStorage implements IBaselineStorageAdapter {
  private store: JsonFileStore<BaselineEntry>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'baselines.json');
  }

  async storeBaseline(key: string, content: string | Buffer, contentType?: string): Promise<void> {
    const contentStr = Buffer.isBuffer(content) ? content.toString('utf-8') : content;
    
    const entry: BaselineEntry = {
      key,
      content: contentStr,
      uploadedAt: new Date().toISOString(),
      size: Buffer.byteLength(contentStr, 'utf-8'),
      contentType,
    };

    await this.store.writeOne(entry, (e) => e.key);
  }

  async getBaseline(key: string): Promise<string | null> {
    const entry = await this.store.readOne((e) => e.key === key);
    return entry?.content || null;
  }

  async listBaselines(): Promise<BaselineVersion[]> {
    const entries = await this.store.read();
    
    return entries
      .map((e) => ({
        version: e.key,
        uploadedAt: new Date(e.uploadedAt),
        size: e.size,
        contentType: e.contentType,
      }))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async deleteBaseline(key: string): Promise<void> {
    await this.store.withLock(async () => {
      const entries = await this.store.read();
      const filtered = entries.filter((e) => e.key !== key);
      await this.store.write(filtered);
    });
  }
}

/**
 * Local Calibration Store
 */
class LocalCalibrationStore implements ICalibrationStoreAdapter {
  private fpStore: LocalFPStore;
  private kThreshold: number;

  constructor(dataDir: string, kThreshold: number = 10) {
    this.fpStore = new LocalFPStore(dataDir);
    this.kThreshold = kThreshold;
  }

  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    const events = await this.fpStore.getFalsePositivesByRule(ruleId);
    
    const uniqueOrgs = new Set(events.map((e) => e.orgIdHash || 'unknown'));
    const orgCount = uniqueOrgs.size;

    if (orgCount < this.kThreshold) {
      return {
        error: 'INSUFFICIENT_K_ANONYMITY',
        message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
        requiredK: this.kThreshold,
        actualK: orgCount,
      };
    }

    const totalFPs = events.filter((e) => e.context?.isFalsePositive === true).length;

    return {
      ruleId,
      totalFPs,
      orgCount,
      averageFPsPerOrg: orgCount > 0 ? totalFPs / orgCount : 0,
      meetsKAnonymity: true,
    };
  }

  async getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError> {
    let events = await this.fpStore.getFalsePositivesByRule(ruleId);

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() >= start);
    }

    if (endDate) {
      const end = new Date(endDate).getTime();
      events = events.filter((e) => new Date(e.timestamp).getTime() <= end);
    }

    const uniqueOrgs = new Set(events.map((e) => e.orgIdHash || 'unknown'));
    const orgCount = uniqueOrgs.size;

    if (orgCount < this.kThreshold) {
      return {
        error: 'INSUFFICIENT_K_ANONYMITY',
        message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
        requiredK: this.kThreshold,
        actualK: orgCount,
      };
    }

    const totalFPs = events.filter((e) => e.context?.isFalsePositive === true).length;

    return {
      ruleId,
      totalFPs,
      orgCount,
      averageFPsPerOrg: orgCount > 0 ? totalFPs / orgCount : 0,
      meetsKAnonymity: true,
    };
  }

  async getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError> {
    // Access the store's read method via the calibration store
    const allEvents = await (this.fpStore as any)['store'].read() as FalsePositiveEvent[];
    
    const uniqueOrgs = new Set(allEvents.map((e: FalsePositiveEvent) => e.orgIdHash || 'unknown'));
    const orgCount = uniqueOrgs.size;

    if (orgCount < this.kThreshold) {
      return {
        error: 'INSUFFICIENT_K_ANONYMITY',
        message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
        requiredK: this.kThreshold,
        actualK: orgCount,
      };
    }

    const ruleMap = new Map<string, { totalFPs: number; orgs: Set<string> }>();

    for (const event of allEvents) {
      if (!ruleMap.has(event.ruleId)) {
        ruleMap.set(event.ruleId, { totalFPs: 0, orgs: new Set() });
      }

      const ruleData = ruleMap.get(event.ruleId)!;
      if (event.context?.isFalsePositive === true) {
        ruleData.totalFPs++;
      }
      ruleData.orgs.add(event.orgIdHash || 'unknown');
    }

    const results: CalibrationResult[] = [];

    for (const [ruleId, data] of ruleMap.entries()) {
      if (data.orgs.size >= this.kThreshold) {
        results.push({
          ruleId,
          totalFPs: data.totalFPs,
          orgCount: data.orgs.size,
          averageFPsPerOrg: data.totalFPs / data.orgs.size,
          meetsKAnonymity: true,
        });
      }
    }

    return results;
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
    baselineStorage: new LocalBaselineStorage(dataDir),
    calibrationStore: new LocalCalibrationStore(dataDir),
  };
}
