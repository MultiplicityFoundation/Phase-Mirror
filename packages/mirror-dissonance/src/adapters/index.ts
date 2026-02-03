/**
 * Adapter layer for cloud provider abstraction
 * Consolidates AWS SDK usage behind stable interfaces
 */

// Types
export * from './types.js';

// Factory
export { createAdapters } from './factory.js';

// AWS implementations
export * from './aws/index.js';

// Local/test implementations
export * from './local/index.js';
