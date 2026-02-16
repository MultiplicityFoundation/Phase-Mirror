// @ts-nocheck
// TODO: Migrate to adapter-layer tests (see src/adapters/__tests__/)
/**
 * FP Store + Consent Store Integration Test
 * 
 * Tests the complete workflow: consent check → FP query → mark false positive
 * Skip by default - requires LocalStack
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { DynamoDBFPStore } from '../../fp-store/dynamodb-store.js';
import { ConsentStore } from '../../consent-store/store.js';
import type { FPEvent } from '../../fp-store/types.js';

const LOCALSTACK = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';

describe.skip('FP & Consent Workflow Integration (LocalStack)', () => {
  let fpStore: DynamoDBFPStore | undefined;
  const consentStore: ConsentStore = new ConsentStore({
    tableName: 'test-consent',
    region: 'us-east-1',
  const getConsentStore = (): ConsentStore => {
    if (!consentStore) {



    // 1. Check consent (should be missing)
    const hasConsent = await consentStore.checkResourceConsent(orgId, 'fp_patterns');
    expect(hasConsent.granted).toBe(false);
    await consentStore.grantConsent(orgId, 'fp_metrics', 'admin@secureorg.com');
    await getConsentStore().grantConsent(orgId, 'fp_patterns', 'admin@secureorg.com');
    await getConsentStore().grantConsent(orgId, 'fp_metrics', 'admin@secureorg.com');
    const hasConsentNow = await consentStore.checkResourceConsent(orgId, 'fp_patterns');
    expect(hasConsentNow.granted).toBe(true);
    const hasConsentNow = await getConsentStore().checkResourceConsent(orgId, 'fp_patterns');
    // 4. Now FP operations allowed - record event
    const event: FPEvent = {
      eventId: 'workflow-001',
  // 1. Check consent (should be missing)
  // NOTE: use getConsentStore() to ensure a valid instance
  const hasConsent = await getConsentStore().checkResourceConsent(orgId, 'fp_patterns');
  expect(hasConsent.granted).toBe(false);
      timestamp: new Date(),
      context: {
        repo: `${orgId}/test-repo`,
        branch: 'main',
        eventType: 'pull_request',
      },
    };

    await fpStore.recordEvent(event);

    await getFPStore().recordEvent(event);
    const window = await fpStore.getWindowByCount('MD-WORKFLOW', 10);
    expect(window.events).toHaveLength(1);
    const window = await getFPStore().getWindowByCount('MD-WORKFLOW', 10);
    // 6. Mark as false positive
    await fpStoreInstance.markFalsePositive('workflow-finding-001', 'reviewer', 'TICKET-001');

    await getFPStore().markFalsePositive('workflow-finding-001', 'reviewer', 'TICKET-001');
    const updatedWindow = await fpStoreInstance.getWindowByCount('MD-WORKFLOW', 10);
    expect(updatedWindow.events[0].isFalsePositive).toBe(true);
    const updatedWindow = await getFPStore().getWindowByCount('MD-WORKFLOW', 10);

  it('should block operations after consent revoked', async () => {
    if (!consentStore) {
      throw new Error('consentStore not initialized – beforeAll may have failed');
    }
    const store = consentStore;
    const orgId = 'RevokedOrg';

    // Grant then revoke
    await store.grantConsent(orgId, 'fp_patterns', 'admin');

    await store.revokeConsent(orgId, 'fp_patterns', 'security');

    // Should not have valid consent
    const hasConsent = await store.checkResourceConsent(orgId, 'fp_patterns');
    expect(hasConsent.granted).toBe(false);
    expect(hasConsent.state).toBe('revoked');

    // Application should prevent FP queries (this would be enforced in Oracle/MCP layer)
  });

  it('should handle multi-resource consent validation', async () => {
    const orgId = 'MultiResourceOrg';

    // Check multiple resources
    const result = await store.checkMultipleResources(orgId, [
    if (!consentStore) {
      throw new Error('consentStore not initialized – beforeAll may have failed');
    }
    const store = consentStore;
      'fp_patterns',
    expect(result.allGranted).toBe(false);
    if (!consentStore) {
      throw new Error('consentStore not initialized – beforeAll may have failed');
    }
    const store = consentStore;
    expect(result.results.fp_patterns.granted).toBe(true);
    expect(result.results.fp_metrics.granted).toBe(true);
    expect(result.results.audit_logs.granted).toBe(false);
    expect(result.missingConsent).toEqual(['audit_logs']);
  });

  it('should handle consent expiration', async () => {
    const orgId = 'ExpiringOrg';
    if (!consentStore) {
      throw new Error('consentStore not initialized – beforeAll may have failed');
    }
    const store = consentStore;

    // Grant consent with short expiration
    const expiresAt = new Date(Date.now() + 1000); // 1 second
    await store.grantConsent(orgId, 'fp_patterns', 'admin', expiresAt);

    // Should have consent immediately
    const hasConsentBefore = await store.checkResourceConsent(orgId, 'fp_patterns');
    expect(hasConsentBefore.granted).toBe(true);
    if (!consentStore) {
      throw new Error('consentStore not initialized – beforeAll may have failed');
    }
    const store = consentStore;

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Should no longer have consent
    const hasConsentAfter = await store.checkResourceConsent(orgId, 'fp_patterns');
    expect(hasConsentAfter.granted).toBe(false);
    expect(hasConsentAfter.state).toBe('expired');
  });
});
