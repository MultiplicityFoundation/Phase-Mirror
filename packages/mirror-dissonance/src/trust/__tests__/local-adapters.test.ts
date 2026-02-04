/**
 * Unit tests for local trust adapters
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createLocalTrustAdapters } from '../adapters/local/index.js';
import { OrganizationIdentity } from '../identity/types.js';
import { OrganizationReputation, StakePledge } from '../reputation/types.js';

describe('Local Trust Adapters', () => {
  const testDataDir = '.test-data-trust';

  beforeEach(async () => {
    // Clean up test data directory
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Directory doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(testDataDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('LocalIdentityStore', () => {
    it('should store and retrieve identity', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01T00:00:00Z'),
        uniqueNonce: 'nonce-abc',
        githubOrgId: 12345,
      };

      await adapters.identityStore.storeIdentity(identity);

      const retrieved = await adapters.identityStore.getIdentity('org-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.orgId).toBe('org-1');
      expect(retrieved!.publicKey).toBe('pubkey-123');
      expect(retrieved!.verificationMethod).toBe('github_org');
      expect(retrieved!.githubOrgId).toBe(12345);
      expect(retrieved!.uniqueNonce).toBe('nonce-abc');
      expect(retrieved!.verifiedAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    });

    it('should return null for non-existent identity', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const identity = await adapters.identityStore.getIdentity('non-existent');
      expect(identity).toBeNull();
    });

    it('should update existing identity', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: 'nonce-abc',
      };

      await adapters.identityStore.storeIdentity(identity);

      // Update with stripe verification
      const updated: OrganizationIdentity = {
        ...identity,
        verificationMethod: 'stripe_customer',
        stripeCustomerId: 'cus_123',
        verifiedAt: new Date('2024-01-02'),
      };

      await adapters.identityStore.storeIdentity(updated);

      const retrieved = await adapters.identityStore.getIdentity('org-1');
      expect(retrieved!.verificationMethod).toBe('stripe_customer');
      expect(retrieved!.stripeCustomerId).toBe('cus_123');
    });

    it('should revoke identity', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: 'nonce-abc',
      };

      await adapters.identityStore.storeIdentity(identity);
      await adapters.identityStore.revokeIdentity('org-1', 'Security violation');

      const retrieved = await adapters.identityStore.getIdentity('org-1');
      expect(retrieved).toBeNull();
    });

    it('should count nonce usage', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const identity1: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-1',
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: 'nonce-abc',
      };

      const identity2: OrganizationIdentity = {
        orgId: 'org-2',
        publicKey: 'pubkey-2',
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: 'nonce-abc', // Same nonce (should not happen in production)
      };

      const identity3: OrganizationIdentity = {
        orgId: 'org-3',
        publicKey: 'pubkey-3',
        verificationMethod: 'github_org',
        verifiedAt: new Date(),
        uniqueNonce: 'nonce-xyz',
      };

      await adapters.identityStore.storeIdentity(identity1);
      await adapters.identityStore.storeIdentity(identity2);
      await adapters.identityStore.storeIdentity(identity3);

      const count1 = await adapters.identityStore.getNonceUsageCount('nonce-abc');
      expect(count1).toBe(2);

      const count2 = await adapters.identityStore.getNonceUsageCount('nonce-xyz');
      expect(count2).toBe(1);

      const count3 = await adapters.identityStore.getNonceUsageCount('nonce-none');
      expect(count3).toBe(0);
    });

    it('should persist data across adapter instances', async () => {
      const adapters1 = createLocalTrustAdapters(testDataDir);
      
      const identity: OrganizationIdentity = {
        orgId: 'org-1',
        publicKey: 'pubkey-123',
        verificationMethod: 'github_org',
        verifiedAt: new Date('2024-01-01'),
        uniqueNonce: 'nonce-abc',
      };

      await adapters1.identityStore.storeIdentity(identity);

      // Create new adapter instance
      const adapters2 = createLocalTrustAdapters(testDataDir);
      const retrieved = await adapters2.identityStore.getIdentity('org-1');
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.orgId).toBe('org-1');
    });
  });

  describe('LocalReputationStore', () => {
    it('should store and retrieve reputation', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const reputation: OrganizationReputation = {
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 1000,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.7,
        ageScore: 0.5,
        volumeScore: 0.4,
        lastUpdated: new Date('2024-01-01T00:00:00Z'),
        stakeStatus: 'active',
      };

      await adapters.reputationStore.updateReputation(reputation);

      const retrieved = await adapters.reputationStore.getReputation('org-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.orgId).toBe('org-1');
      expect(retrieved!.reputationScore).toBe(0.8);
      expect(retrieved!.stakePledge).toBe(1000);
      expect(retrieved!.contributionCount).toBe(10);
      expect(retrieved!.lastUpdated).toEqual(new Date('2024-01-01T00:00:00Z'));
    });

    it('should return null for non-existent reputation', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const reputation = await adapters.reputationStore.getReputation('non-existent');
      expect(reputation).toBeNull();
    });

    it('should update existing reputation', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const reputation: OrganizationReputation = {
        orgId: 'org-1',
        reputationScore: 0.5,
        stakePledge: 500,
        contributionCount: 5,
        flaggedCount: 0,
        consistencyScore: 0.5,
        ageScore: 0.3,
        volumeScore: 0.2,
        lastUpdated: new Date('2024-01-01'),
        stakeStatus: 'active',
      };

      await adapters.reputationStore.updateReputation(reputation);

      const updated: OrganizationReputation = {
        ...reputation,
        reputationScore: 0.8,
        contributionCount: 10,
        lastUpdated: new Date('2024-01-02'),
      };

      await adapters.reputationStore.updateReputation(updated);

      const retrieved = await adapters.reputationStore.getReputation('org-1');
      expect(retrieved!.reputationScore).toBe(0.8);
      expect(retrieved!.contributionCount).toBe(10);
    });

    it('should store and retrieve stake pledge', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const pledge: StakePledge = {
        orgId: 'org-1',
        amountUsd: 1000,
        pledgedAt: new Date('2024-01-01T00:00:00Z'),
        status: 'active',
      };

      await adapters.reputationStore.updateStakePledge(pledge);

      const retrieved = await adapters.reputationStore.getStakePledge('org-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.orgId).toBe('org-1');
      expect(retrieved!.amountUsd).toBe(1000);
      expect(retrieved!.status).toBe('active');
      expect(retrieved!.pledgedAt).toEqual(new Date('2024-01-01T00:00:00Z'));
    });

    it('should update pledge status (slash)', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const pledge: StakePledge = {
        orgId: 'org-1',
        amountUsd: 1000,
        pledgedAt: new Date('2024-01-01'),
        status: 'active',
      };

      await adapters.reputationStore.updateStakePledge(pledge);

      const slashed: StakePledge = {
        ...pledge,
        status: 'slashed',
        slashReason: 'Malicious behavior',
      };

      await adapters.reputationStore.updateStakePledge(slashed);

      const retrieved = await adapters.reputationStore.getStakePledge('org-1');
      expect(retrieved!.status).toBe('slashed');
      expect(retrieved!.slashReason).toBe('Malicious behavior');
    });

    it('should list reputations by score', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      const reputations: OrganizationReputation[] = [
        {
          orgId: 'org-1',
          reputationScore: 0.9,
          stakePledge: 1000,
          contributionCount: 20,
          flaggedCount: 0,
          consistencyScore: 0.9,
          ageScore: 0.8,
          volumeScore: 0.7,
          lastUpdated: new Date(),
        stakeStatus: 'active' as const,
        },
        {
          orgId: 'org-2',
          reputationScore: 0.5,
          stakePledge: 500,
          contributionCount: 5,
          flaggedCount: 1,
          consistencyScore: 0.5,
          ageScore: 0.3,
          volumeScore: 0.2,
          lastUpdated: new Date(),
        stakeStatus: 'active' as const,
        },
        {
          orgId: 'org-3',
          reputationScore: 0.7,
          stakePledge: 750,
          contributionCount: 10,
          flaggedCount: 0,
          consistencyScore: 0.7,
          ageScore: 0.6,
          volumeScore: 0.5,
          lastUpdated: new Date(),
        stakeStatus: 'active' as const,
        },
      ];

      for (const rep of reputations) {
        await adapters.reputationStore.updateReputation(rep);
      }

      const highRep = await adapters.reputationStore.listReputationsByScore(0.6);
      expect(highRep).toHaveLength(2);
      expect(highRep[0].orgId).toBe('org-1'); // Highest first
      expect(highRep[1].orgId).toBe('org-3');

      const allRep = await adapters.reputationStore.listReputationsByScore(0.0);
      expect(allRep).toHaveLength(3);
    });

    it('should persist data across adapter instances', async () => {
      const adapters1 = createLocalTrustAdapters(testDataDir);
      
      const reputation: OrganizationReputation = {
        orgId: 'org-1',
        reputationScore: 0.8,
        stakePledge: 1000,
        contributionCount: 10,
        flaggedCount: 0,
        consistencyScore: 0.7,
        ageScore: 0.5,
        volumeScore: 0.4,
        lastUpdated: new Date('2024-01-01'),
        stakeStatus: 'active',
      };

      await adapters1.reputationStore.updateReputation(reputation);

      // Create new adapter instance
      const adapters2 = createLocalTrustAdapters(testDataDir);
      const retrieved = await adapters2.reputationStore.getReputation('org-1');
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.reputationScore).toBe(0.8);
    });
  });

  describe('File atomicity', () => {
    it('should handle sequential writes correctly', async () => {
      const adapters = createLocalTrustAdapters(testDataDir);
      
      // Create multiple identities sequentially
      const identities = Array.from({ length: 10 }, (_, i) => ({
        orgId: `org-${i}`,
        publicKey: `pubkey-${i}`,
        verificationMethod: 'github_org' as const,
        verifiedAt: new Date(),
        uniqueNonce: `nonce-${i}`,
      }));

      // Store sequentially to avoid race conditions
      for (const id of identities) {
        await adapters.identityStore.storeIdentity(id);
      }

      // Verify all identities were stored
      for (const identity of identities) {
        const retrieved = await adapters.identityStore.getIdentity(identity.orgId);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.orgId).toBe(identity.orgId);
      }
    });
  });
});
