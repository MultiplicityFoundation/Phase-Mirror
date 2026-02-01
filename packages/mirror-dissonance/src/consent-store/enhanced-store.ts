/**
 * Enhanced Consent Store
 * 
 * Provides granular resource-level consent checking per ADR-004
 */
import {
  ConsentResource,
  ConsentCheckResult,
  MultiResourceConsentResult,
  OrganizationConsent,
  ConsentState,
  CURRENT_CONSENT_POLICY,
} from './schema.js';
import { IConsentStore } from './index.js';

/**
 * Interface for enhanced consent store with granular resource checking
 */
export interface IEnhancedConsentStore extends IConsentStore {
  /**
   * Check consent for a single resource
   */
  checkResourceConsent(orgId: string, resource: ConsentResource): Promise<ConsentCheckResult>;
  
  /**
   * Check consent for multiple resources
   */
  checkMultipleResources(
    orgId: string, 
    resources: ConsentResource[]
  ): Promise<MultiResourceConsentResult>;
  
  /**
   * Get full consent summary for an organization
   */
  getConsentSummary(orgId: string): Promise<OrganizationConsent | null>;
}

/**
 * Enhanced NoOp Consent Store for testing/development
 * Grants consent for all resources by default
 */
export class EnhancedNoOpConsentStore implements IEnhancedConsentStore {
  private mockConsent: Map<string, OrganizationConsent> = new Map();

  async checkConsent(orgId: string): Promise<'explicit' | 'implicit' | 'none'> {
    return 'implicit';
  }

  async recordConsent(record: any): Promise<void> {
    console.log('NoOp: Would record consent for org:', record.orgId);
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    return true;
  }

  async checkResourceConsent(
    orgId: string, 
    resource: ConsentResource
  ): Promise<ConsentCheckResult> {
    // NoOp grants consent to all resources
    return {
      granted: true,
      state: 'granted',
      resource,
      grantedAt: new Date(),
      version: CURRENT_CONSENT_POLICY.version,
    };
  }

  async checkMultipleResources(
    orgId: string, 
    resources: ConsentResource[]
  ): Promise<MultiResourceConsentResult> {
    const results: Record<ConsentResource, ConsentCheckResult> = {} as any;
    
    for (const resource of resources) {
      results[resource] = await this.checkResourceConsent(orgId, resource);
    }

    return {
      allGranted: true,
      results,
      missingConsent: [],
    };
  }

  async getConsentSummary(orgId: string): Promise<OrganizationConsent | null> {
    // Return mock consent record
    const now = new Date();
    const resourceStatuses: any = {};
    
    for (const resource of Object.keys(CURRENT_CONSENT_POLICY.resources)) {
      resourceStatuses[resource] = {
        resource,
        state: 'granted' as ConsentState,
        grantedAt: now,
        version: CURRENT_CONSENT_POLICY.version,
      };
    }

    return {
      orgId,
      orgName: 'Test Organization',
      resources: resourceStatuses,
      grantedBy: 'test-admin',
      consentVersion: CURRENT_CONSENT_POLICY.version,
      history: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Set mock consent for testing
   */
  setMockConsent(orgId: string, consent: OrganizationConsent): void {
    this.mockConsent.set(orgId, consent);
  }
}

/**
 * Helper to create an enhanced consent store
 */
export function createEnhancedConsentStore(baseStore?: IConsentStore): IEnhancedConsentStore {
  // For now, return NoOp store. In production, this would wrap the DynamoDB store
  // with enhanced functionality
  return new EnhancedNoOpConsentStore();
}
