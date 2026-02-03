/**
 * Adapter Factory
 * Creates cloud adapters based on configuration
 */

import { CloudAdapters } from './types.js';
import { CloudConfig, loadCloudConfig } from './config.js';
import { createAWSAdapters } from './aws/index.js';
import { createLocalAdapters } from './local/index.js';

/**
 * Create adapters based on cloud configuration
 * @param config Cloud configuration (auto-loaded if not provided)
 */
export async function createAdapters(config?: CloudConfig): Promise<CloudAdapters> {
  const finalConfig = config || loadCloudConfig();

  switch (finalConfig.provider) {
    case 'aws':
      return createAWSAdapters(finalConfig as any);
    
    case 'local':
      return createLocalAdapters();
    
    case 'gcp':
      throw new Error('GCP adapters not yet implemented');
    
    case 'azure':
      throw new Error('Azure adapters not yet implemented');
    
    default:
      throw new Error(`Unknown cloud provider: ${finalConfig.provider}`);
  }
}

// Re-export types and utilities
export * from './types.js';
export * from './config.js';
export { createAWSAdapters } from './aws/index.js';
export { createLocalAdapters } from './local/index.js';
