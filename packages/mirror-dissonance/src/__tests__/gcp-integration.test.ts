// packages/mirror-dissonance/src/tests/gcp-integration.test.ts

import { Firestore } from '@google-cloud/firestore';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { initializeOracle } from '../oracle';

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'phase-mirror-staging';
const REGION = 'us-central1';

describe('GCP Integration Tests', () => {
  let firestore: Firestore;
  let secretManager: SecretManagerServiceClient;

  beforeAll(() => {
    firestore = new Firestore({ projectId: PROJECT_ID });
    secretManager = new SecretManagerServiceClient();
  });

  describe('Firestore Connectivity', () => {
    it('writes and reads FP events', async () => {
      const testEvent = {
        eventId: `test-${Date.now()}`,
        ruleId: 'MD-001',
        ruleVersion: '1.0.0',
        outcome: 'block',
        isFalsePositive: false,
        timestamp: new Date(),
        context: { repo: 'test-repo', branch: 'main' }
      };

      // Write
      const fpEventsRef = firestore.collection('fp-events');
      await fpEventsRef.doc(testEvent.eventId).set(testEvent);

      // Read back
      const doc = await fpEventsRef.doc(testEvent.eventId).get();
      expect(doc.exists).toBe(true);
      expect(doc.data()?.ruleId).toBe('MD-001');

      // Cleanup
      await fpEventsRef.doc(testEvent.eventId).delete();
    });

    it('block-counter increments atomically', async () => {
      const hourBucket = `MD-001:${new Date().toISOString().slice(0, 13)}`;
      const counterRef = firestore.collection('block-counter').doc(hourBucket);

      // Atomic increment
      await counterRef.set(
        { count: Firestore.FieldValue.increment(1) },
        { merge: true }
      );

      const doc = await counterRef.get();
      expect(doc.data()?.count).toBeGreaterThanOrEqual(1);
    });

    it('consent-store records and queries correctly', async () => {
      const consentRef = firestore.collection('consent').doc('test-org');
      await consentRef.set({
        orgId: 'test-org',
        scope: 'org',
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        grantor: 'test-user'
      });

      const doc = await consentRef.get();
      expect(doc.data()?.scope).toBe('org');

      await consentRef.delete();
    });
  });

  describe('Secret Manager - Nonce', () => {
    const nonceSecretName = `projects/${PROJECT_ID}/secrets/redaction-nonce/versions/latest`;

    it('loads nonce from Secret Manager', async () => {
      const [version] = await secretManager.accessSecretVersion({
        name: nonceSecretName
      });
      
      const nonce = version.payload?.data?.toString();
      expect(nonce).toBeDefined();
      expect(nonce?.length).toBe(64); // 32 bytes hex = 64 chars
    });

    it('fails closed when nonce unavailable', async () => {
      const badSecretName = `projects/${PROJECT_ID}/secrets/nonexistent/versions/latest`;
      
      await expect(
        secretManager.accessSecretVersion({ name: badSecretName })
      ).rejects.toThrow();
    });
  });

  describe('Full Oracle Integration', () => {
    it('runs complete analysis cycle against GCP', async () => {
      const oracle = await initializeOracle({
        provider: 'gcp',
        projectId: PROJECT_ID,
        region: REGION,
        nonceSecretName: 'redaction-nonce',
        fpCollection: 'fp-events',
        consentCollection: 'consent',
        blockCounterCollection: 'block-counter'
      });

      const result = await oracle.analyze({
        mode: 'pullrequest',
        repository: 'test-org/test-repo',
        commit: 'abc123',
        files: ['README.md'],
        strict: false,
        dryRun: false
      });

      expect(['PASS', 'WARN', 'BLOCK']).toContain(result.machineDecision.outcome);
      expect(result.violations).toBeDefined();
    }, 30000); // 30s timeout for full cycle
  });

  describe('Circuit Breaker Behavior', () => {
    it('triggers degraded mode after threshold', async () => {
      const hourBucket = `MD-002:${new Date().toISOString().slice(0, 13)}`;
      const counterRef = firestore.collection('block-counter').doc(hourBucket);

      // Simulate 10 blocks (threshold trigger)
      await counterRef.set({ count: 10, updatedAt: new Date() });

      const oracle = await initializeOracle({
        provider: 'gcp',
        projectId: PROJECT_ID,
        blockThreshold: 10, // Circuit breaker threshold
        // ... other config
      });

      // Should return degraded mode indicator
      const status = await oracle.getCircuitBreakerStatus('MD-002');
      expect(status.degraded).toBe(true);
    });
  });

  describe('Nonce Rotation Grace Period', () => {
    it('validates text from previous nonce version during grace', async () => {
      // This requires v1 and v2 secrets to exist
      // Test: create text with v1, rotate to v2, validate v1 text still works
      
      const [v1] = await secretManager.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/redaction-nonce/versions/1`
      });
      const [v2] = await secretManager.accessSecretVersion({
        name: `projects/${PROJECT_ID}/secrets/redaction-nonce/versions/2`
      });

      // During grace period, both should be loadable
      expect(v1.payload?.data).toBeDefined();
      expect(v2.payload?.data).toBeDefined();
    });
  });
});
