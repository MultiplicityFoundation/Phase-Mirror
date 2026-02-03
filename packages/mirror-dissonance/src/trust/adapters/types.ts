/**
 * Trust Store Adapter Interfaces
 * 
 * Adapter interfaces for persisting identity and reputation data.
 * Follows the same pattern as existing adapters in mirror-dissonance.
 */

import { OrganizationIdentity } from '../identity/types.js';
import { OrganizationReputation, StakePledge } from '../reputation/types.js';

export interface IIdentityStoreAdapter {
  getIdentity(orgId: string): Promise<OrganizationIdentity | null>;
  storeIdentity(identity: OrganizationIdentity): Promise<void>;
  revokeIdentity(orgId: string, reason: string): Promise<void>;
  getNonceUsageCount(nonce: string): Promise<number>;
}

export interface IReputationStoreAdapter {
  getReputation(orgId: string): Promise<OrganizationReputation | null>;
  updateReputation(reputation: OrganizationReputation): Promise<void>;
  getStakePledge(orgId: string): Promise<StakePledge | null>;
  updateStakePledge(pledge: StakePledge): Promise<void>;
  listReputationsByScore(minScore: number): Promise<OrganizationReputation[]>;
}
