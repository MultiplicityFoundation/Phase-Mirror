/**
 * Consent Store Implementation
 * 
 * DynamoDB-backed consent store with caching for production use
 */
import {
  OrganizationConsent,
  ConsentResource,
  ConsentState,
  ResourceConsentStatus,
  ConsentEvent,
  CURRENT_CONSENT_POLICY,
  ConsentCheckResult,
  MultiResourceConsentResult,
} from "./schema.js";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { createHash, randomUUID } from "crypto";
import { IEnhancedConsentStore } from "./enhanced-store.js";

/**
 * Consent store configuration
 */
export interface ConsentStoreConfig {
  tableName: string;
  region: string;
  cacheTTLSeconds?: number;
}

/**
 * Cache entry for consent data
 */
interface CacheEntry {
  data: OrganizationConsent;
  expiresAt: number;
}

/**
 * Consent Store - manages organization consent records with DynamoDB and caching
 */
export class ConsentStore implements IEnhancedConsentStore {
  private client: DynamoDBDocumentClient | null = null;
  private tableName: string;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTTL: number;

  constructor(config: ConsentStoreConfig) {
    const dynamoClient = new DynamoDBClient({ region: config.region });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
    this.cacheTTL = (config.cacheTTLSeconds || 300) * 1000; // Default 5 minutes
  }

  /**
   * Legacy checkConsent method for backwards compatibility
   */
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

  /**
   * Legacy recordConsent method for backwards compatibility
   */
  async recordConsent(record: any): Promise<void> {
    // This is a simplified implementation that doesn't match the new granular model
    // In production, you'd want to convert the old format to the new format
    console.log('Legacy recordConsent called - consider using grantConsent instead');
  }

  /**
   * Legacy hasValidConsent method for backwards compatibility
   */
  async hasValidConsent(orgId: string): Promise<boolean> {
    const consentType = await this.checkConsent(orgId);
    return consentType === 'explicit' || consentType === 'implicit';
  }

  /**
   * Check consent for a single resource
   */
  async checkResourceConsent(
    orgId: string,
    resource: ConsentResource
  ): Promise<ConsentCheckResult> {
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

  /**
   * Check consent for multiple resources
   */
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

  /**
   * Get full consent summary for an organization
   */
  async getConsentSummary(orgId: string): Promise<OrganizationConsent | null> {
    // Check cache first
    const cached = this.getCachedConsent(orgId);
    if (cached) {
      return cached;
    }

    // Fetch from DynamoDB
    if (!this.client) {
      throw new Error('DynamoDB client not initialized');
    }

    try {
      const command = new GetCommand({
        TableName: this.tableName,
        Key: { orgId: this.hashOrgId(orgId) },
      });

      const response = await this.client.send(command);

      if (!response.Item) {
        return null;
      }

      // Parse the DynamoDB item into OrganizationConsent
      const consent = this.parseConsentRecord(response.Item);

      // Cache the result
      this.cacheConsent(orgId, consent);

      return consent;
    } catch (error) {
      console.error('Failed to get consent summary:', error);
      throw error;
    }
  }

  /**
   * Grant consent for a resource
   */
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

    // Save to DynamoDB
    await this.saveConsentRecord(summary);

    // Invalidate cache
    this.invalidateCache(orgId);
  }

  /**
   * Revoke consent for a resource
   */
  async revokeConsent(
    orgId: string,
    resource: ConsentResource,
    revokedBy: string
  ): Promise<void> {
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

    // Save to DynamoDB
    await this.saveConsentRecord(summary);

    // Invalidate cache
    this.invalidateCache(orgId);
  }

  /**
   * Save consent record to DynamoDB
   */
  private async saveConsentRecord(consent: OrganizationConsent): Promise<void> {
    if (!this.client) {
      throw new Error('DynamoDB client not initialized');
    }

    try {
      const command = new PutCommand({
        TableName: this.tableName,
        Item: {
          orgId: this.hashOrgId(consent.orgId),
          orgName: consent.orgName,
          resources: consent.resources,
          grantedBy: consent.grantedBy,
          consentVersion: consent.consentVersion,
          history: consent.history,
          createdAt: consent.createdAt.toISOString(),
          updatedAt: consent.updatedAt.toISOString(),
        },
      });

      await this.client.send(command);
    } catch (error) {
      console.error('Failed to save consent record:', error);
      throw error;
    }
  }

  /**
   * Parse DynamoDB item into OrganizationConsent
   */
  private parseConsentRecord(item: any): OrganizationConsent {
    return {
      orgId: item.orgId,
      orgName: item.orgName,
      resources: item.resources || {},
      grantedBy: item.grantedBy,
      consentVersion: item.consentVersion,
      history: item.history || [],
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
    };
  }

  /**
   * Get cached consent if valid
   */
  private getCachedConsent(orgId: string): OrganizationConsent | null {
    const entry = this.cache.get(orgId);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(orgId);
      return null;
    }

    return entry.data;
  }

  /**
   * Cache consent data
   */
  private cacheConsent(orgId: string, consent: OrganizationConsent): void {
    this.cache.set(orgId, {
      data: consent,
      expiresAt: Date.now() + this.cacheTTL,
    });
  }

  /**
   * Invalidate cache for an organization
   */
  private invalidateCache(orgId: string): void {
    this.cache.delete(orgId);
  }

  /**
   * Hash organization ID for privacy
   */
  private hashOrgId(orgId: string): string {
    return createHash('sha256').update(orgId).digest('hex');
  }

  /**
   * Hash admin ID for privacy
   */
  private hashAdminId(adminId: string): string {
    return createHash('sha256').update(adminId).digest('hex');
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize?: number } {
    return {
      size: this.cache.size,
    };
  }
}
