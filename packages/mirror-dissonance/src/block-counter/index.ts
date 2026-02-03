// Re-export interfaces and implementations
// Note: MemoryBlockCounter is the legacy implementation with hourly bucketing
// InMemoryBlockCounter is the new implementation with custom TTL support
export { IBlockCounter, MemoryBlockCounter, BlockCounterConfig, DynamoDBBlockCounter, InMemoryBlockCounter } from './counter.js';
