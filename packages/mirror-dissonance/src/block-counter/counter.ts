/**
 * Block counter - Re-exports from adapters
 * @deprecated Import from '../adapters' instead
 */

// Re-export from adapters for backward compatibility
export { IBlockCounter, BlockCounterConfig } from '../adapters/types.js';
export { DynamoDBBlockCounter } from '../adapters/aws/block-counter.js';
export { InMemoryBlockCounter, MemoryBlockCounter } from '../adapters/local/index.js';

// Legacy exports for backward compatibility
export { BlockCounterEntry } from '../../schemas/types.js';

// Note: The original BlockCounter class has been replaced by DynamoDBBlockCounter
// The original MemoryBlockCounter class is still exported from local adapters
