/**
 * AWS DynamoDB Consent Store Adapter
 *
 * Wraps DynamoDB GetItem and PutItem operations for consent management
 * behind the ConsentStoreAdapter interface.
 *
 * Preserves existing DynamoDB schema and caching from
 * src/consent-store/store.ts — no behavior change.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createHash, randomUUID } from 'crypto';
import { ConsentStoreAdapter, CloudConfig } from '../types.js';
import type { ConsentType } from '../../../schemas/types.js';

interface ConsentRecord {
  orgId: string;
  repoId?: string;
  scope: string;
  grantedBy: string;
  grantedAt: string;
  expiresAt?: string;
  revoked: boolean;
  updatedAt: string;
}

interface CacheEntry {
  data: ConsentRecord[];
  expiresAt: number;
}

export class AwsConsentStore implements ConsentStoreAdapter {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;

  constructor(config: CloudConfig) {
    const dynamoClient = new DynamoDBClient({
      region: config.region || 'us-east-1',
    });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.consentTableName || 'phase-mirror-consent';
    this.cacheTTL = 300_000; // 5 minutes
  }

  async recordConsent(consent: {
    orgId: string;
    repoId?: string;
    scope: string;
    grantedBy: string;
    expiresAt?: Date;
  }): Promise<void> {
    const now = new Date().toISOString();
    const record: ConsentRecord = {
      orgId: this.hashId(consent.orgId),
      repoId: consent.repoId,
      scope: consent.scope,
      grantedBy: this.hashId(consent.grantedBy),
      grantedAt: now,
      expiresAt: consent.expiresAt?.toISOString(),
      revoked: false,
      updatedAt: now,
    };

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: `org#${record.orgId}`,
            sk: `consent#${consent.scope}#${randomUUID()}`,
            ...record,
          },
        }),
      );
    } catch (error) {
      console.error('Failed to record consent:', error);
      throw error;
    }

    // Invalidate cache
    this.cache.delete(consent.orgId);
  }

  async hasValidConsent(
    orgId: string,
    repoId?: string,
    scope?: string,
  ): Promise<boolean> {
    const records = await this.getConsentRecords(orgId);
    const now = Date.now();
    return records.some(
      (r) =>
        (!repoId || r.repoId === repoId || !r.repoId) &&
        (!scope || r.scope === scope) &&
        !r.revoked &&
        (!r.expiresAt || new Date(r.expiresAt).getTime() > now),
    );
  }

  async revokeConsent(orgId: string, scope: string, _revokedBy?: string): Promise<void> {
    const records = await this.getConsentRecords(orgId);
    const toRevoke = records.filter(
      (r) => r.scope === scope && !r.revoked,
    );

    for (const record of toRevoke) {
      try {
        await this.client.send(
          new PutCommand({
            TableName: this.tableName,
            Item: {
              pk: `org#${this.hashId(orgId)}`,
              sk: `consent#${scope}#revoked`,
              ...record,
              revoked: true,
              updatedAt: new Date().toISOString(),
            },
          }),
        );
      } catch (error) {
        console.error('Failed to revoke consent:', error);
        throw error;
      }
    }

    this.cache.delete(orgId);
  }

  async getConsent(orgId: string): Promise<any> {
    return this.getConsentRecords(orgId);
  }

  async grantConsent(orgId: string, scope: string, grantedBy: string, expiresAt?: Date): Promise<void> {
    await this.recordConsent({ orgId, scope, grantedBy, expiresAt });
  }

  async checkResourceConsent(_orgId: string, _scope: string): Promise<{ granted: boolean; state: string }> {
    throw new Error('checkResourceConsent not yet implemented for AWS adapter');
  }

  async checkMultipleResources(_orgId: string, _scopes: string[]): Promise<{
    allGranted: boolean;
    missingConsent: string[];
    results: Record<string, { granted: boolean }>;
  }> {
    throw new Error('checkMultipleResources not yet implemented for AWS adapter');
  }

  async getConsentSummary(_orgId: string): Promise<{
    orgId: string;
    resources: Record<string, { state: string }>;
  } | null> {
    throw new Error('getConsentSummary not yet implemented for AWS adapter');
  }

  async checkConsent(_orgId: string): Promise<ConsentType> {
    throw new Error('checkConsent not yet implemented for AWS adapter');
  }

  private async getConsentRecords(orgId: string): Promise<ConsentRecord[]> {
    // Check cache
    const cached = this.cache.get(orgId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }

    try {
      const result = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { pk: `org#${this.hashId(orgId)}`, sk: 'consent#summary' },
        }),
      );

      const records: ConsentRecord[] = result.Item?.records || [];

      this.cache.set(orgId, {
        data: records,
        expiresAt: Date.now() + this.cacheTTL,
      });

      return records;
    } catch (error) {
      console.error('Failed to get consent records:', error);
      throw error;
    }
  }

  private hashId(id: string): string {
    return createHash('sha256').update(id).digest('hex');
  }
}
