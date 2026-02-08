/**
 * False Positive Store interfaces and NoOp implementation
 *
 * @deprecated The DynamoDBFPStore class that lived here has moved to
 *   `src/adapters/aws/fp-store.ts`.  Use the adapter factory instead:
 *
 *     import { createAdapters } from '../adapters/index.js';
 *
 * Cloud-agnostic exports (IFPStore, NoOpFPStore, createFPStore) remain here.
 */
import { FalsePositiveEvent } from '../schemas/types.js';

export interface FPStoreConfig {
  tableName: string;
  region?: string;
}

export interface IFPStore {
  recordFalsePositive(event: FalsePositiveEvent): Promise<void>;
  isFalsePositive(findingId: string): Promise<boolean>;
  getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]>;
}

export class NoOpFPStore implements IFPStore {
  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    console.log('NoOp: Would record false positive:', event.id);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    return false;
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    return [];
  }
}

/**
 * @deprecated Use the adapter factory (`createAdapters`) for cloud-backed stores.
 * This function now only returns a NoOpFPStore.
 */
export function createFPStore(config?: FPStoreConfig): IFPStore {
  return new NoOpFPStore();
}
