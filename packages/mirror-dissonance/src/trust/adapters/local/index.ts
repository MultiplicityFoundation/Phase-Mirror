/**
 * Local File-Based Trust Adapters
 * 
 * Implements identity and reputation adapters using local JSON file storage.
 * Follows the same pattern as other local adapters in mirror-dissonance.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { OrganizationIdentity } from '../../identity/types.js';
import { OrganizationReputation, StakePledge } from '../../reputation/types.js';
import { IIdentityStoreAdapter, IReputationStoreAdapter } from '../types.js';

/**
 * Utility class for atomic JSON file operations
 * Reused from existing local adapter pattern
 */
class JsonFileStore<T> {
  constructor(
    private dataDir: string,
    private filename: string
  ) {}

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
    const tempPath = `${filePath}.tmp`;

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
    const items = await this.read();
    const id = idGetter(item);
    const index = items.findIndex((i) => idGetter(i) === id);

    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }

    await this.write(items);
  }

  async deleteOne(predicate: (item: T) => boolean): Promise<void> {
    const items = await this.read();
    const filtered = items.filter((item) => !predicate(item));
    await this.write(filtered);
  }
}

/**
 * Local Identity Store
 */
class LocalIdentityStore implements IIdentityStoreAdapter {
  private store: JsonFileStore<OrganizationIdentity>;

  constructor(dataDir: string) {
    this.store = new JsonFileStore(dataDir, 'identities.json');
  }

  async getIdentity(orgId: string): Promise<OrganizationIdentity | null> {
    const identity = await this.store.readOne((i) => i.orgId === orgId);
    
    if (!identity) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...identity,
      verifiedAt: new Date(identity.verifiedAt),
    };
  }

  async storeIdentity(identity: OrganizationIdentity): Promise<void> {
    await this.store.writeOne(identity, (i) => i.orgId);
  }

  async revokeIdentity(orgId: string, reason: string): Promise<void> {
    // In local implementation, we just delete the identity
    // In production, you might want to keep a revocation record
    await this.store.deleteOne((i) => i.orgId === orgId);
  }

  async getNonceUsageCount(nonce: string): Promise<number> {
    const identities = await this.store.read();
    return identities.filter((i) => i.uniqueNonce === nonce).length;
  }

  async getIdentityByStripeCustomerId(
    stripeCustomerId: string
  ): Promise<OrganizationIdentity | null> {
    const identity = await this.store.readOne(
      (i) => i.stripeCustomerId === stripeCustomerId
    );
    
    if (!identity) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...identity,
      verifiedAt: new Date(identity.verifiedAt),
    };
  }

  async listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]> {
    const identities = await this.store.read();
    
    return identities
      .filter((i) => i.verificationMethod === 'stripe_customer')
      .map((i) => ({
        ...i,
        verifiedAt: new Date(i.verifiedAt),
      }));
  }
}

/**
 * Local Reputation Store
 */
class LocalReputationStore implements IReputationStoreAdapter {
  private reputationStore: JsonFileStore<OrganizationReputation>;
  private pledgeStore: JsonFileStore<StakePledge>;

  constructor(dataDir: string) {
    this.reputationStore = new JsonFileStore(dataDir, 'reputations.json');
    this.pledgeStore = new JsonFileStore(dataDir, 'pledges.json');
  }

  async getReputation(orgId: string): Promise<OrganizationReputation | null> {
    const reputation = await this.reputationStore.readOne((r) => r.orgId === orgId);
    
    if (!reputation) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...reputation,
      lastUpdated: new Date(reputation.lastUpdated),
    };
  }

  async updateReputation(reputation: OrganizationReputation): Promise<void> {
    await this.reputationStore.writeOne(reputation, (r) => r.orgId);
  }

  async getStakePledge(orgId: string): Promise<StakePledge | null> {
    const pledge = await this.pledgeStore.readOne((p) => p.orgId === orgId);
    
    if (!pledge) {
      return null;
    }

    // Convert date strings back to Date objects
    return {
      ...pledge,
      pledgedAt: new Date(pledge.pledgedAt),
    };
  }

  async updateStakePledge(pledge: StakePledge): Promise<void> {
    await this.pledgeStore.writeOne(pledge, (p) => p.orgId);
  }

  async listReputationsByScore(minScore: number): Promise<OrganizationReputation[]> {
    const reputations = await this.reputationStore.read();
    
    return reputations
      .filter((r) => r.reputationScore >= minScore)
      .map((r) => ({
        ...r,
        lastUpdated: new Date(r.lastUpdated),
      }))
      .sort((a, b) => b.reputationScore - a.reputationScore);
  }
}

/**
 * Trust adapters container
 */
export interface TrustAdapters {
  identityStore: IIdentityStoreAdapter;
  reputationStore: IReputationStoreAdapter;
}

/**
 * Create local trust adapters
 */
export function createLocalTrustAdapters(dataDir: string = '.test-data'): TrustAdapters {
  return {
    identityStore: new LocalIdentityStore(dataDir),
    reputationStore: new LocalReputationStore(dataDir),
  };
}
