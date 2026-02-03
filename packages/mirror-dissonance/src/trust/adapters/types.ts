/**
 * Trust Store Adapter Interfaces
 * 
 * Adapter interfaces for persisting identity and reputation data.
 * Follows the same pattern as existing adapters in mirror-dissonance.
 */

import { OrganizationIdentity } from '../identity/types.js';
import { OrganizationReputation, StakePledge } from '../reputation/types.js';
import { NonceBinding } from '../identity/nonce-binding.js';

export interface IIdentityStoreAdapter {
  getIdentity(orgId: string): Promise<OrganizationIdentity | null>;
  storeIdentity(identity: OrganizationIdentity): Promise<void>;
  revokeIdentity(orgId: string, reason: string): Promise<void>;
  getNonceUsageCount(nonce: string): Promise<number>;
  
  /**
   * Find identity by Stripe customer ID.
   * Prevents duplicate verifications for same Stripe customer.
   */
  getIdentityByStripeCustomerId(stripeCustomerId: string): Promise<OrganizationIdentity | null>;
  
  /**
   * Retrieve all identities verified via Stripe.
   * Used for revenue analysis and anti-fraud auditing.
   */
  listStripeVerifiedIdentities(): Promise<OrganizationIdentity[]>;
  
  /**
   * Get nonce binding for an organization.
   * Returns the current binding (revoked or active).
   */
  getNonceBinding(orgId: string): Promise<NonceBinding | null>;
  
  /**
   * Store or update a nonce binding.
   */
  storeNonceBinding(binding: NonceBinding): Promise<void>;
  
  /**
   * Get nonce binding by nonce value (for rotation history lookup).
   */
  getNonceBindingByNonce(nonce: string): Promise<NonceBinding | null>;
}

export interface IReputationStoreAdapter {
  getReputation(orgId: string): Promise<OrganizationReputation | null>;
  updateReputation(reputation: OrganizationReputation): Promise<void>;
  getStakePledge(orgId: string): Promise<StakePledge | null>;
  updateStakePledge(pledge: StakePledge): Promise<void>;
  listReputationsByScore(minScore: number): Promise<OrganizationReputation[]>;
}
