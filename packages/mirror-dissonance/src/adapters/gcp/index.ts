/**
 * GCP Cloud Adapters
 *
 * Implements cloud adapter interfaces using Google Cloud Platform services:
 * - Firestore for FP events, consent, and block counter
 * - Secret Manager for nonce storage
 * - Cloud Storage for baseline files
 *
 * Aligned with adapter interface contracts from types.ts.
 * No behavior change — existing Firestore/Secret Manager/GCS code preserved.
 */

import { Firestore, Timestamp } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { createHash, randomUUID } from 'crypto';

import type { NonceConfig, FalsePositiveEvent, ConsentType } from '../../schemas/types.js';
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

/**
 * GCP False Positive Store
 *
 * Uses Firestore to store FP events, keyed by ruleId collection.
 * Preserves existing Firestore query patterns.
 */
class GcpFPStore implements FPStoreAdapter {
  private db: Firestore;
  private collection: string = 'fp_events';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  async recordEvent(event: FPEvent): Promise<void> {
    const docId = `${event.ruleId}_${event.eventId}`;
    await this.db.collection(this.collection).doc(docId).set({
      eventId: event.eventId,
      ruleId: event.ruleId,
      ruleVersion: event.ruleVersion,
      findingId: event.findingId,
      outcome: event.outcome,
      isFalsePositive: event.isFalsePositive,
      timestamp: event.timestamp.toISOString(),
      context: event.context,
      recordedAt: Date.now(),
    });
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('ruleId', '==', ruleId)
      .orderBy('timestamp', 'desc')
      .limit(count)
      .get();

    const events = snapshot.docs.map((doc) => this.toFPEvent(doc.data()));
    return this.computeWindow(ruleId, events);
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('ruleId', '==', ruleId)
      .where('timestamp', '>=', since.toISOString())
      .orderBy('timestamp', 'desc')
      .get();

    const events = snapshot.docs.map((doc) => this.toFPEvent(doc.data()));
    return this.computeWindow(ruleId, events);
  }

  async markFalsePositive(eventId: string, reviewedBy: string): Promise<void> {
    // Find the event by eventId
    const snapshot = await this.db
      .collection(this.collection)
      .where('eventId', '==', eventId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      throw new Error(`Event ${eventId} not found in FP store`);
    }

    const docRef = snapshot.docs[0].ref;
    await docRef.update({
      isFalsePositive: true,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    });
  }

  async isFalsePositive(ruleIdOrFindingId: string, findingId?: string): Promise<boolean> {
    if (findingId !== undefined) {
      const snapshot = await this.db
        .collection(this.collection)
        .where('ruleId', '==', ruleIdOrFindingId)
        .where('findingId', '==', findingId)
        .where('isFalsePositive', '==', true)
        .limit(1)
        .get();
      return !snapshot.empty;
    } else {
      const snapshot = await this.db
        .collection(this.collection)
        .where('findingId', '==', ruleIdOrFindingId)
        .where('isFalsePositive', '==', true)
        .limit(1)
        .get();
      return !snapshot.empty;
    }
  }

  async recordFalsePositive(_event: FalsePositiveEvent): Promise<void> {
    throw new Error('recordFalsePositive not yet implemented for GCP adapter');
  }

  async getFalsePositivesByRule(_ruleId: string): Promise<FalsePositiveEvent[]> {
    throw new Error('getFalsePositivesByRule not yet implemented for GCP adapter');
  }

  computeWindow(ruleId: string, events: FPEvent[]): FPWindow {
    const versionCounts = new Map<string, number>();
    events.forEach((e) => {
      versionCounts.set(
        e.ruleVersion,
        (versionCounts.get(e.ruleVersion) || 0) + 1,
      );
    });

    let mostCommonVersion = '';
    let maxCount = 0;
    versionCounts.forEach((count, version) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonVersion = version;
      }
    });

    const total = events.length;
    const falsePositives = events.filter((e) => e.isFalsePositive).length;
    const pending = events.filter((e) => !(e as any).reviewedBy).length;
    const reviewed = total - pending;
    const truePositives = reviewed - falsePositives;
    const observedFPR = reviewed > 0 ? falsePositives / reviewed : 0;

    return {
      ruleId,
      ruleVersion: mostCommonVersion,
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

  private toFPEvent(data: any): FPEvent {
    return {
      eventId: data.eventId,
      ruleId: data.ruleId,
      ruleVersion: data.ruleVersion,
      findingId: data.findingId,
      outcome: data.outcome,
      isFalsePositive: data.isFalsePositive,
      timestamp: data.timestamp instanceof Timestamp
        ? data.timestamp.toDate()
        : new Date(data.timestamp),
      context: data.context,
    };
  }
}

/**
 * GCP Consent Store
 *
 * Uses Firestore for consent management.
 * Preserves existing Firestore transaction patterns and hashing.
 */
class GcpConsentStore implements ConsentStoreAdapter {
  private db: Firestore;
  private collection: string = 'consent';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  private hashId(id: string): string {
    return createHash('sha256').update(id).digest('hex');
  }

  async recordConsent(consent: {
    orgId: string;
    repoId?: string;
    scope: string;
    grantedBy: string;
    expiresAt?: Date;
  }): Promise<void> {
    const now = new Date();
    const hashedOrgId = this.hashId(consent.orgId);
    const docRef = this.db.collection(this.collection).doc(hashedOrgId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      const existing = doc.exists ? doc.data()! : { records: [] };
      const records = existing.records || [];

      records.push({
        orgId: hashedOrgId,
        repoId: consent.repoId,
        scope: consent.scope,
        grantedBy: this.hashId(consent.grantedBy),
        grantedAt: now.toISOString(),
        expiresAt: consent.expiresAt?.toISOString(),
        revoked: false,
        updatedAt: now.toISOString(),
      });

      transaction.set(docRef, { records, updatedAt: now.toISOString() });
    });
  }

  async hasValidConsent(
    orgId: string,
    repoId?: string,
    scope?: string,
  ): Promise<boolean> {
    const records = await this.getConsentRecords(orgId);
    const now = Date.now();
    return records.some(
      (r: any) =>
        (!repoId || r.repoId === repoId || !r.repoId) &&
        (!scope || r.scope === scope) &&
        !r.revoked &&
        (!r.expiresAt || new Date(r.expiresAt).getTime() > now),
    );
  }

  async revokeConsent(orgId: string, scope: string, _revokedBy?: string): Promise<void> {
    const hashedOrgId = this.hashId(orgId);
    const docRef = this.db.collection(this.collection).doc(hashedOrgId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) return;

      const data = doc.data()!;
      const records = (data.records || []).map((r: any) => {
        if (r.scope === scope && !r.revoked) {
          return { ...r, revoked: true, updatedAt: new Date().toISOString() };
        }
        return r;
      });

      transaction.set(docRef, { records, updatedAt: new Date().toISOString() });
    });
  }

  async getConsent(orgId: string): Promise<any> {
    return this.getConsentRecords(orgId);
  }

  async grantConsent(orgId: string, scope: string, grantedBy: string, expiresAt?: Date): Promise<void> {
    await this.recordConsent({ orgId, scope, grantedBy, expiresAt });
  }

  async checkResourceConsent(_orgId: string, _scope: string): Promise<{ granted: boolean; state: string }> {
    throw new Error('checkResourceConsent not yet implemented for GCP adapter');
  }

  async checkMultipleResources(_orgId: string, _scopes: string[]): Promise<{
    allGranted: boolean;
    missingConsent: string[];
    results: Record<string, { granted: boolean }>;
  }> {
    throw new Error('checkMultipleResources not yet implemented for GCP adapter');
  }

  async getConsentSummary(_orgId: string): Promise<{
    orgId: string;
    resources: Record<string, { state: string }>;
  } | null> {
    throw new Error('getConsentSummary not yet implemented for GCP adapter');
  }

  async checkConsent(_orgId: string): Promise<ConsentType> {
    throw new Error('checkConsent not yet implemented for GCP adapter');
  }

  private async getConsentRecords(orgId: string): Promise<any[]> {
    const hashedOrgId = this.hashId(orgId);
    const doc = await this.db.collection(this.collection).doc(hashedOrgId).get();

    if (!doc.exists) {
      return [];
    }

    return doc.data()!.records || [];
  }
}

/**
 * GCP Block Counter
 *
 * Uses Firestore for atomic counter increments with hourly buckets.
 * Preserves existing Firestore transaction pattern.
 */
class GcpBlockCounter implements BlockCounterAdapter {
  private db: Firestore;
  private collection: string = 'block_counter';
  private ttlHours: number;

  constructor(projectId: string, ttlHours: number = 24) {
    this.db = new Firestore({ projectId });
    this.ttlHours = ttlHours;
  }

  private getBucketKey(ruleId: string, orgId: string): string {
    const now = new Date();
    const bucketHour = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0,
    );
    return `${ruleId}:${orgId}:${bucketHour.toISOString()}`;
  }

  async increment(ruleId: string, orgId: string): Promise<number> {
    try {
      const bucketKey = this.getBucketKey(ruleId, orgId);
      const docRef = this.db.collection(this.collection).doc(bucketKey);

      const result = await this.db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);

        let count = 1;
        if (doc.exists) {
          count = (doc.data()!.count || 0) + 1;
        }

        transaction.set(docRef, {
          bucketKey,
          ruleId,
          orgId,
          count,
          timestamp: Date.now(),
          expiresAt: new Date(Date.now() + this.ttlHours * 3600 * 1000),
        });

        return count;
      });

      return result;
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to increment counter in Firestore',
        'INCREMENT_FAILED',
        { source: 'gcp-firestore', ruleId, orgId, originalError: error },
      );
    }
  }

  async getCount(ruleId: string, orgId: string): Promise<number> {
    try {
      const bucketKey = this.getBucketKey(ruleId, orgId);
      const doc = await this.db.collection(this.collection).doc(bucketKey).get();

      if (!doc.exists) {
        return 0;
      }

      return doc.data()!.count || 0;
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to read counter from Firestore',
        'READ_FAILED',
        { source: 'gcp-firestore', ruleId, orgId, originalError: error },
      );
    }
  }

  async isCircuitBroken(
    ruleId: string,
    orgId: string,
    threshold: number,
  ): Promise<boolean> {
    try {
      const count = await this.getCount(ruleId, orgId);
      return count >= threshold;
    } catch (error) {
      if (error instanceof BlockCounterError) throw error;
      throw new BlockCounterError(
        'Failed to check circuit breaker in Firestore',
        'CIRCUIT_CHECK_FAILED',
        { source: 'gcp-firestore', ruleId, orgId, threshold, originalError: error },
      );
    }
  }
}

/**
 * GCP Secret Store
 *
 * Uses Secret Manager for nonce retrieval.
 * Phase 0: Throws SecretStoreError on failure instead of returning null.
 * Callers at L0 (business logic) implement fail-closed behavior.
 */
class GcpSecretStore implements SecretStoreAdapter {
  private client: SecretManagerServiceClient;
  private projectId: string;
  private secretName: string;

  constructor(projectId: string, secretName: string = 'hmac-nonce') {
    this.client = new SecretManagerServiceClient();
    this.projectId = projectId;
    this.secretName = secretName;
  }

  async getNonce(): Promise<NonceConfig> {
    try {
      const name = `projects/${this.projectId}/secrets/${this.secretName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });

      if (!version.payload?.data) {
        throw new SecretStoreError(
          'Secret version exists but has no payload data',
          'MALFORMED_SECRET',
          { source: 'gcp-secret-manager', projectId: this.projectId, secretName: this.secretName },
        );
      }

      // Handle both Buffer and Uint8Array
      const payloadData = version.payload.data;
      const value = Buffer.isBuffer(payloadData)
        ? payloadData.toString('utf-8')
        : Buffer.from(payloadData as Uint8Array).toString('utf-8');

      return {
        value,
        loadedAt: new Date().toISOString(),
        source: 'gcp-secret-manager',
      };
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to load nonce from Secret Manager',
        'READ_FAILED',
        { source: 'gcp-secret-manager', projectId: this.projectId, secretName: this.secretName, originalError: error },
      );
    }
  }

  async getNonces(): Promise<string[]> {
    try {
      // List recent secret versions for grace-period rotation
      const parent = `projects/${this.projectId}/secrets/${this.secretName}`;
      const [versions] = await this.client.listSecretVersions({
        parent,
        filter: 'state:ENABLED',
      });

      const nonces: string[] = [];
      // Take the 2 most recent enabled versions
      const recentVersions = versions
        .sort((a, b) => {
          const aTime = a.createTime?.seconds ?? 0;
          const bTime = b.createTime?.seconds ?? 0;
          return Number(bTime) - Number(aTime);
        })
        .slice(0, 2);

      for (const ver of recentVersions) {
        if (ver.name) {
          try {
            const [accessed] = await this.client.accessSecretVersion({
              name: ver.name,
            });
            if (accessed.payload?.data) {
              const payloadData = accessed.payload.data;
              const value = Buffer.isBuffer(payloadData)
                ? payloadData.toString('utf-8')
                : Buffer.from(payloadData as Uint8Array).toString('utf-8');
              nonces.push(value);
            }
          } catch {
            // Skip inaccessible versions — will throw below if none succeed
          }
        }
      }

      if (nonces.length === 0) {
        // Fall back to single nonce (will throw if that also fails)
        const single = await this.getNonce();
        return [single.value];
      }

      return nonces;
    } catch (error) {
      if (error instanceof SecretStoreError) throw error;
      throw new SecretStoreError(
        'Failed to retrieve nonce versions from Secret Manager',
        'VERSIONS_FAILED',
        { source: 'gcp-secret-manager', projectId: this.projectId, secretName: this.secretName, originalError: error },
      );
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    try {
      const parent = `projects/${this.projectId}/secrets/${this.secretName}`;
      await this.client.addSecretVersion({
        parent,
        payload: {
          data: Buffer.from(newValue, 'utf-8'),
        },
      });
    } catch (error) {
      throw new SecretStoreError(
        'Failed to rotate nonce in Secret Manager',
        'ROTATION_FAILED',
        { source: 'gcp-secret-manager', projectId: this.projectId, secretName: this.secretName, originalError: error },
      );
    }
  }
}

/**
 * GCP Object Store (Cloud Storage)
 *
 * Uses Cloud Storage for baseline file storage.
 * Preserves existing GCS file operations.
 */
class GcpObjectStore implements ObjectStoreAdapter {
  private storage: Storage;
  private bucketName: string;

  constructor(projectId: string, bucketName: string) {
    this.storage = new Storage({ projectId });
    this.bucketName = bucketName;
  }

  async getBaseline(repoId: string): Promise<any | null> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(`baselines/${repoId}.json`);

      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }

      const [contents] = await file.download();
      return JSON.parse(contents.toString('utf-8'));
    } catch (error) {
      console.error('Failed to get baseline:', error);
      return null;
    }
  }

  async putBaseline(repoId: string, baseline: any): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(`baselines/${repoId}.json`);

    await file.save(JSON.stringify(baseline), {
      contentType: 'application/json',
    });
  }

  async listBaselineVersions(
    repoId: string,
  ): Promise<Array<{ versionId: string; lastModified: Date }>> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [files] = await bucket.getFiles({
        prefix: `baselines/${repoId}.json`,
        versions: true,
      });

      return files
        .filter((file) => file.metadata.generation)
        .map((file) => ({
          versionId: String(file.metadata.generation),
          lastModified: file.metadata.timeCreated
            ? new Date(file.metadata.timeCreated)
            : new Date(),
        }))
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    } catch (error) {
      console.error('Failed to list baseline versions:', error);
      return [];
    }
  }
}

/**
 * Create GCP adapters from configuration
 */
export function createGcpAdapters(config: CloudConfig): CloudAdapters {
  if (!config.gcpProjectId) {
    throw new Error('GCP project ID is required (set gcpProjectId in config or GCP_PROJECT_ID env var)');
  }

  const projectId = config.gcpProjectId;

  // Get resource names from environment or use defaults
  const baselineBucket =
    process.env.GCP_BASELINE_BUCKET ||
    `${projectId}-phase-mirror-baselines-staging`;
  const secretName =
    process.env.GCP_SECRET_NAME || 'phase-mirror-hmac-nonce-staging';

  const notImplemented = (name: string) => () => {
    throw new Error(`${name} not yet implemented for GCP adapter`);
  };

  return {
    fpStore: new GcpFPStore(projectId),
    consentStore: new GcpConsentStore(projectId),
    blockCounter: new GcpBlockCounter(projectId),
    secretStore: new GcpSecretStore(projectId, secretName),
    objectStore: new GcpObjectStore(projectId, baselineBucket),
    baselineStorage: {
      storeBaseline: notImplemented('BaselineStorage.storeBaseline'),
      getBaseline: notImplemented('BaselineStorage.getBaseline'),
      listBaselines: notImplemented('BaselineStorage.listBaselines'),
      deleteBaseline: notImplemented('BaselineStorage.deleteBaseline'),
    } as BaselineStorageAdapter,
    calibrationStore: {
      aggregateFPsByRule: notImplemented('CalibrationStore.aggregateFPsByRule'),
      getRuleFPRate: notImplemented('CalibrationStore.getRuleFPRate'),
      getAllRuleFPRates: notImplemented('CalibrationStore.getAllRuleFPRates'),
    } as CalibrationStoreAdapter,
  };
}
