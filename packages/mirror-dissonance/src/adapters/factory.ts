/**
 * Cloud Adapter Factory
 * 
 * Dynamically imports and creates adapters based on the cloud provider.
 * Uses dynamic imports so unused provider SDKs don't bloat the bundle.
 */

import type { CloudConfig, Adapters } from './types.js';

/**
 * Create cloud adapters based on configuration
 * 
 * Uses dynamic imports to avoid loading unused cloud provider SDKs.
 * This keeps the bundle size small and allows optional peer dependencies.
 * 
 * @param config Cloud configuration
 * @returns Promise resolving to cloud adapters
 */
export async function createAdapters(config: CloudConfig): Promise<Adapters> {
  switch (config.provider) {
    case 'aws': {
      const awsModule = await import('./aws/index.js');
      return awsModule.createAWSAdapters(config);
    }

    case 'gcp': {
      const gcpModule = await import('./gcp/index.js');
      return gcpModule.createGcpAdapters(config);
    }

    case 'local': {
      const localModule = await import('./local/index.js');
      return localModule.createLocalAdapters(config);
    }

    default:
      throw new Error(`Unsupported cloud provider: ${config.provider}`);
  }
}

/**
 * Create adapters with default configuration
 * 
 * Loads configuration from environment variables and creates adapters.
 * This is a convenience function for the most common use case.
 */
export async function createDefaultAdapters(): Promise<Adapters> {
  const { loadCloudConfig } = await import('./config.js');
  const config = loadCloudConfig();
  return createAdapters(config);
}
