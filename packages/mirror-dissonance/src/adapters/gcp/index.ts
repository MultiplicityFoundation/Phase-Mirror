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
 * GCP False Positive Store
 */
class GcpFPStore implements FPStoreAdapter {
  private db: Firestore;
  private collection: string = 'fp_events';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  async recordEvent(event: FPEvent): Promise<void> {
    await this.db.collection(this.collection).doc(event.eventId).set({
      eventId: event.eventId,
      findingId: event.findingId,
      ruleId: event.ruleId,
      ruleVersion: event.ruleVersion,
      outcome: event.outcome,
      suppressionTicket: event.suppressionTicket,
      reviewedBy: event.reviewedBy,
      reviewedAt: event.reviewedAt,
      isFalsePositive: event.isFalsePositive,
      timestamp: event.timestamp,
      context: event.context,
    });
  }

  async markFalsePositive(findingId: string, reviewedBy: string, ticket: string): Promise<void> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('findingId', '==', findingId)
      .get();

    const batch = this.db.batch();
    snapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        isFalsePositive: true,
        reviewedBy,
        suppressionTicket: ticket,
        reviewedAt: new Date(),
      });
    });

    await batch.commit();
  }

  async getWindowByCount(ruleId: string, count: number): Promise<FPWindow> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('ruleId', '==', ruleId)
      .orderBy('timestamp', 'desc')
      .limit(count)
      .get();

    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
        reviewedAt: data.reviewedAt ? (data.reviewedAt instanceof Timestamp ? data.reviewedAt.toDate() : new Date(data.reviewedAt)) : undefined,
      } as FPEvent;
    });

    return this.buildWindow(ruleId, events);
  }

  async getWindowBySince(ruleId: string, since: Date): Promise<FPWindow> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('ruleId', '==', ruleId)
      .where('timestamp', '>=', since)
      .orderBy('timestamp', 'desc')
      .get();

    const events = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        ...data,
        timestamp: data.timestamp instanceof Timestamp ? data.timestamp.toDate() : new Date(data.timestamp),
        reviewedAt: data.reviewedAt ? (data.reviewedAt instanceof Timestamp ? data.reviewedAt.toDate() : new Date(data.reviewedAt)) : undefined,
      } as FPEvent;
    });

    return this.buildWindow(ruleId, events);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    const snapshot = await this.db
      .collection(this.collection)
      .where('findingId', '==', findingId)
      .where('isFalsePositive', '==', true)
      .limit(1)
      .get();

    return !snapshot.empty;
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
}

/**
 * GCP Consent Store
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

  async grantConsent(consent: CalibrationConsent): Promise<void> {
    const docRef = this.db.collection(this.collection).doc(consent.orgId);
    
    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      
      const now = new Date();
      const consentData = {
        orgId: consent.orgId,
        grantedBy: this.hashId(consent.grantedBy),
        grantedAt: consent.grantedAt,
        expiresAt: consent.expiresAt,
        resources: consent.resources,
        updatedAt: now,
        createdAt: doc.exists ? this.parseFirestoreDate(doc.data()!.createdAt) : now,
      };

      transaction.set(docRef, consentData);
    });
  }

  async revokeConsent(orgId: string, revokedBy: string): Promise<void> {
    const docRef = this.db.collection(this.collection).doc(orgId);

    await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      if (!doc.exists) {
        throw new Error(`No consent record found for organization: ${orgId}`);
      }

      const now = new Date();
      transaction.update(docRef, {
        revokedAt: now,
        revokedBy: this.hashId(revokedBy),
        updatedAt: now,
      });
    });
  }

  async hasConsent(query: ConsentQuery): Promise<boolean> {
    const doc = await this.db.collection(this.collection).doc(query.orgId).get();

    if (!doc.exists) {
      return false;
    }

    const data = doc.data()!;

    // Check if revoked
    if (data.revokedAt) {
      return false;
    }

    // Check if expired
    if (data.expiresAt) {
      const expiresAt = this.parseFirestoreDate(data.expiresAt);
      if (expiresAt < new Date()) {
        return false;
      }
    }

    // If checking for specific resource
    if (query.resource) {
      const resources = data.resources || [];
      return resources.includes(query.resource);
    }

    return true;
  }

  async getConsent(orgId: string): Promise<CalibrationConsent | null> {
    const doc = await this.db.collection(this.collection).doc(orgId).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data()!;

    return {
      orgId: data.orgId,
      grantedBy: data.grantedBy,
      grantedAt: this.parseFirestoreDate(data.grantedAt),
      expiresAt: data.expiresAt ? this.parseFirestoreDate(data.expiresAt) : undefined,
      resources: data.resources || [],
    };
  }
}

/**
 * GCP Block Counter
 */
class GcpBlockCounter implements BlockCounterAdapter {
  private db: Firestore;
  private collection: string = 'block_counter';

  constructor(projectId: string) {
    this.db = new Firestore({ projectId });
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const docRef = this.db.collection(this.collection).doc(key);

    const result = await this.db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);

      let count = 1;
      if (doc.exists) {
        count = (doc.data()!.count || 0) + 1;
      }

      transaction.set(docRef, {
        key,
        count,
        timestamp: Date.now(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      });

      return count;
    });

    return result;
  }

  async get(key: string): Promise<number> {
    const doc = await this.db.collection(this.collection).doc(key).get();

    if (!doc.exists) {
      return 0;
    }

    const data = doc.data()!;

    // Check if expired
    if (data.expiresAt) {
      const expiresAt = data.expiresAt instanceof Timestamp 
        ? data.expiresAt.toDate() 
        : new Date(data.expiresAt);
      
      if (expiresAt < new Date()) {
        return 0;
      }
    }

    return data.count || 0;
  }
}

/**
 * GCP Secret Store
 */
class GcpSecretStore implements SecretStoreAdapter {
  private client: SecretManagerServiceClient;
  private projectId: string;

  constructor(projectId: string) {
    this.client = new SecretManagerServiceClient();
    this.projectId = projectId;
  }

  async getNonce(paramName: string): Promise<string> {
    try {
      const name = `projects/${this.projectId}/secrets/${paramName}/versions/latest`;
      const [version] = await this.client.accessSecretVersion({ name });

      if (!version.payload?.data) {
        throw new Error(`Secret ${paramName} has no data`);
      }

      // Handle both Buffer and Uint8Array
      const payloadData = version.payload.data;
      const value = Buffer.isBuffer(payloadData) 
        ? payloadData.toString('utf-8')
        : Buffer.from(payloadData as Uint8Array).toString('utf-8');

      return value;
    } catch (error) {
      console.error('Failed to load nonce from Secret Manager:', error);
      throw error;
    }
  }

  async getNonceWithVersion(paramName: string): Promise<{ value: string; version: number }> {
    try {
      const name = `projects/${this.projectId}/secrets/${paramName}/versions/latest`;
      const [versionResponse] = await this.client.accessSecretVersion({ name });

      if (!versionResponse.payload?.data) {
        throw new Error(`Secret ${paramName} has no data`);
      }

      // Handle both Buffer and Uint8Array
      const payloadData = versionResponse.payload.data;
      const value = Buffer.isBuffer(payloadData) 
        ? payloadData.toString('utf-8')
        : Buffer.from(payloadData as Uint8Array).toString('utf-8');

      // Extract version number from the version name
      // Format: projects/{project}/secrets/{secret}/versions/{version}
      const versionParts = versionResponse.name?.split('/');
      const versionNum = versionParts && versionParts.length > 0 
        ? parseInt(versionParts[versionParts.length - 1], 10) 
        : 1;

      return { value, version: versionNum };
    } catch (error) {
      console.error('Failed to load nonce with version from Secret Manager:', error);
      throw error;
    }
  }

  async isReachable(): Promise<boolean> {
    try {
      const parent = `projects/${this.projectId}`;
      await this.client.listSecrets({ parent, pageSize: 1 });
      return true;
    } catch (error) {
      console.error('Secret Manager health check failed:', error);
      return false;
    }
  }
}

/**
 * GCP Baseline Storage
 */
class GcpBaselineStorage implements BaselineStoreAdapter {
  private storage: Storage;
  private bucketName: string;

  constructor(projectId: string, bucketName: string) {
    this.storage = new Storage({ projectId });
    this.bucketName = bucketName;
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

  async putBaseline(key: string, content: string): Promise<void> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(key);

    await file.save(content, {
      contentType: 'application/json',
      metadata: {
        contentType: 'application/json',
      },
    });
  }
}

/**
 * Create GCP adapters from configuration
 */
export function createGcpAdapters(config: CloudConfig): Adapters {
  if (!config.gcpProjectId) {
    throw new Error('GCP project ID is required');
  }

  const projectId = config.gcpProjectId;
  
  // Get resource names from environment or use defaults
  const baselineBucket = process.env.GCP_BASELINE_BUCKET || `${projectId}-phase-mirror-baselines-staging`;

  return {
    fpStore: new GcpFPStore(projectId),
    consentStore: new GcpConsentStore(projectId),
    blockCounter: new GcpBlockCounter(projectId),
    secretStore: new GcpSecretStore(projectId),
    baselineStore: new GcpBaselineStorage(projectId, baselineBucket),
    provider: 'gcp',
  };
}
