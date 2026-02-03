/**
 * False Positive Store - Re-exports from adapters
 * @deprecated Import from '../adapters' instead
 */

// Re-export from adapters for backward compatibility
export { IFPStore } from '../adapters/types.js';
export { 
  DynamoDBFPStore, 
  FPStoreConfig 
} from '../adapters/aws/fp-store.js';
export { NoOpFPStore } from '../adapters/local/index.js';

// Factory function for backward compatibility
import { IFPStore } from '../adapters/types.js';
import { DynamoDBFPStore, FPStoreConfig } from '../adapters/aws/fp-store.js';
import { NoOpFPStore } from '../adapters/local/index.js';

export function createFPStore(config?: FPStoreConfig): IFPStore {
  if (config && config.tableName) {
    return new DynamoDBFPStore(config);
  }
  return new NoOpFPStore();
}
