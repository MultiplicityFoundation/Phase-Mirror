/**
 * GCP Cloud Adapters
 * 
 * Implements cloud adapter interfaces using Google Cloud Platform services:
 * - Firestore for FP events, consent, and block counter
 * - Secret Manager for nonce storage
 * - Cloud Storage for baseline files
 */

import { Firestore, DocumentReference, Timestamp } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Storage } from '@google-cloud/storage';
import { createHash, randomUUID } from 'crypto';

import {
  CloudConfig,
  CloudAdapters,
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
 * GCP False Positive Store
 */
class GcpFPStore implements IFPStoreAdapter {
  private db: Firestore;
  private collection: string = 'fp_events';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    await this.db.collection(this.collection).doc(event.id).set({
      id: event.id,
      findingId: event.findingId,
      ruleId: event.ruleId,
      timestamp: event.timestamp,
      resolvedBy: event.resolvedBy,
      context: event.context,
      orgIdHash: event.orgIdHash,
      consent: event.consent,
    });
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('findingId', '==', findingId)
      .limit(1)
      .get();

    return !snapshot.empty;
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('ruleId', '==', ruleId)
      .get();

    return snapshot.docs.map((doc) => doc.data() as FalsePositiveEvent);
  }
}

/**
 * GCP Consent Store
 */
class GcpConsentStore implements IConsentStoreAdapter {
  private db: Firestore;
  private collection: string = 'consent';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  private hashOrgId(orgId: string): string {
    return createHash('sha256').update(orgId).digest('hex');
  }

  private hashAdminId(adminId: string): string {
    return createHash('sha256').update(adminId).digest('hex');
  }

  private parseFirestoreDate(value: any): Date {
    if (value instanceof Timestamp) {
      return value.toDate();
    }
    if (value instanceof Date) {
      return value;
    }
    if (typeof value === 'string') {
      return new Date(value);
    }
    return new Date();
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
    const doc = await this.db.collection(this.collection).doc(orgId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;

    return {
      orgId: data.orgId,
      orgName: data.orgName,
      resources: data.resources || {},
      grantedBy: data.grantedBy,
      consentVersion: data.consentVersion,
      history: data.history || [],
      createdAt: this.parseFirestoreDate(data.createdAt),
      updatedAt: this.parseFirestoreDate(data.updatedAt),
    };
  }

  async grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    const docRef = this.db.collection(this.collection).doc(orgId);
    
    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      
      let summary: OrganizationConsent;
      const now = new Date();

      if (!doc.exists) {
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
      } else {
        const data = doc.data()!;
        summary = {
          orgId: data.orgId,
          orgName: data.orgName,
          resources: data.resources || {},
          grantedBy: data.grantedBy,
          consentVersion: data.consentVersion,
          history: data.history || [],
          createdAt: this.parseFirestoreDate(data.createdAt),
          updatedAt: this.parseFirestoreDate(data.updatedAt),
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

      // Save to Firestore
      transaction.set(docRef, summary);
    });
  }

  async revokeConsent(orgId: string, resource: ConsentResource, revokedBy: string): Promise<void> {
    const docRef = this.db.collection(this.collection).doc(orgId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error(`No consent record found for organization: ${orgId}`);
      }

      const data = doc.data()!;
      const summary: OrganizationConsent = {
        orgId: data.orgId,
        orgName: data.orgName,
        resources: data.resources || {},
        grantedBy: data.grantedBy,
        consentVersion: data.consentVersion,
        history: data.history || [],
        createdAt: this.parseFirestoreDate(data.createdAt),
        updatedAt: this.parseFirestoreDate(data.updatedAt),
      };

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

      // Save to Firestore
      transaction.set(docRef, summary);
    });
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
 * GCP Block Counter
 */
class GcpBlockCounter implements IBlockCounterAdapter {
  private db: Firestore;
  private collection: string = 'block_counter';
  private ttlHours: number;

  constructor(projectId: string, ttlHours: number = 24) {
    this.db = new Firestore({ projectId });
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

  async increment(ruleId: string): Promise<number> {
    const bucketKey = this.getBucketKey();
    const docId = `${bucketKey}:${ruleId}`;
    const docRef = this.db.collection(this.collection).doc(docId);

    const result = await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let count = 1;
      if (doc.exists) {
        count = (doc.data()!.count || 0) + 1;
      }

      transaction.set(docRef, {
        bucketKey,
        ruleId,
        count,
        timestamp: Date.now(),
        expiresAt: new Date(Date.now() + this.ttlHours * 3600 * 1000),
      });

      return count;
    });

    return result;
  }

  async getCount(ruleId: string): Promise<number> {
    const bucketKey = this.getBucketKey();
    const docId = `${bucketKey}:${ruleId}`;
    const doc = await this.db.collection(this.collection).doc(docId).get();

    if (!doc.exists) {
      return 0;
    }

    return doc.data()!.count || 0;
  }
}

/**
 * GCP Secret Store
 */
class GcpSecretStore implements ISecretStoreAdapter {
  private client: SecretManagerServiceClient;
  private projectId: string;
  private secretName: string;

  constructor(projectId: string, secretName: string = 'hmac-nonce') {
    this.client = new SecretManagerServiceClient();
    this.projectId = projectId;
    this.secretName = secretName;
  }

  async getNonce(): Promise<NonceConfig | null> {
    try {
      const name = `projects/${this.projectId}/secrets/${this.secretName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });

      if (!version.payload?.data) {
        return null;
      }

      const value = version.payload.data.toString('utf-8');

      return {
        value,
        loadedAt: new Date().toISOString(),
        source: name,
      };
    } catch (error) {
      console.error('Failed to load nonce from Secret Manager:', error);
      return null; // Fail-closed
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    const parent = `projects/${this.projectId}/secrets/${this.secretName}`;

    await this.client.addSecretVersion({
      parent,
      payload: {
        data: Buffer.from(newValue, 'utf-8'),
      },
    });
  }
}

/**
 * GCP Baseline Storage
 */
class GcpBaselineStorage implements IBaselineStorageAdapter {
  private storage: Storage;
  private bucketName: string;

  constructor(projectId: string, bucketName: string) {
    this.storage = new Storage({ projectId });
    this.bucketName = bucketName;
  }

  async storeBaseline(key: string, content: string | Buffer, contentType?: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);

    await file.save(content, {
      contentType: contentType || 'application/json',
      metadata: {
        contentType: contentType || 'application/json',
      },
    });
  }

  async getBaseline(key: string): Promise<string | null> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(key);

      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }

      const [contents] = await file.download();
      return contents.toString('utf-8');
    } catch (error) {
      console.error('Failed to get baseline:', error);
      return null;
    }
  }

  async listBaselines(): Promise<BaselineVersion[]> {
    const bucket = this.storage.bucket(this.bucketName);
    const [files] = await bucket.getFiles();

    return files
      .map((file) => ({
        version: file.name,
        uploadedAt: file.metadata.timeCreated ? new Date(file.metadata.timeCreated) : new Date(),
        size: parseInt(file.metadata.size || '0', 10),
        contentType: file.metadata.contentType,
      }))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async deleteBaseline(key: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);
    await file.delete();
  }
}

/**
 * GCP Calibration Store
 */
class GcpCalibrationStore implements ICalibrationStoreAdapter {
  private fpStore: GcpFPStore;
  private kThreshold: number;

  constructor(projectId: string, kThreshold: number = 10) {
    this.fpStore = new GcpFPStore(projectId);
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
    // For GCP, we'd need to scan all FP events
    // This is a simplified implementation
    throw new Error('getAllRuleFPRates not yet implemented for GCP');
  }
}

/**
 * Create GCP adapters from configuration
 */
export function createGcpAdapters(config: CloudConfig): CloudAdapters {
  if (!config.projectId) {
    throw new Error('GCP project ID is required');
  }

  const projectId = config.projectId;
  
  // Get resource names from environment or use defaults
  const baselineBucket = process.env.GCP_BASELINE_BUCKET || `${projectId}-phase-mirror-baselines-staging`;
  const secretName = process.env.GCP_SECRET_NAME || 'phase-mirror-hmac-nonce-staging';

  return {
    fpStore: new GcpFPStore(projectId),
    consentStore: new GcpConsentStore(projectId),
    blockCounter: new GcpBlockCounter(projectId),
    secretStore: new GcpSecretStore(projectId, secretName),
    baselineStorage: new GcpBaselineStorage(projectId, baselineBucket),
    calibrationStore: new GcpCalibrationStore(projectId),
  };
}
