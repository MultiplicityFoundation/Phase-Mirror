/**
 * DynamoDB Block Counter - Re-exports from adapters
 * @deprecated Import from '../adapters' instead
 */

// Re-export from adapters for backward compatibility
export { IBlockCounter as BlockCounter } from '../adapters/types.js';
export { DynamoDBBlockCounter } from '../adapters/aws/block-counter.js';
export { InMemoryBlockCounter } from '../adapters/local/index.js';
