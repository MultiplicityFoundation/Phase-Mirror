/**
 * Cloud Configuration Loader
 * 
 * Reads cloud provider configuration from environment variables
 */

import { CloudConfig } from './types.js';

/**
 * Load cloud configuration from environment variables
 * 
 * Environment variables:
 * - CLOUD_PROVIDER: 'aws' | 'gcp' | 'local' (default: 'local')
 * - CLOUD_REGION: AWS region or GCP region (default: 'us-east-1' for AWS, 'us-central1' for GCP)
 * - GCP_PROJECT_ID: GCP project ID (required for GCP)
 * - LOCAL_DATA_DIR: Local data directory (default: '.test-data')
 */
export function loadCloudConfig(): CloudConfig {
  const provider = (process.env.CLOUD_PROVIDER || 'local') as 'aws' | 'gcp' | 'local';

  if (!['aws', 'gcp', 'local'].includes(provider)) {
    throw new Error(
      `Invalid CLOUD_PROVIDER: ${provider}. Must be 'aws', 'gcp', or 'local'.`
    );
  }

  const config: CloudConfig = {
    provider,
  };

  // Provider-specific configuration
  switch (provider) {
    case 'aws':
      config.region = process.env.CLOUD_REGION || process.env.AWS_REGION || 'us-east-1';
      break;

    case 'gcp':
      config.region = process.env.CLOUD_REGION || process.env.GCP_REGION || 'us-central1';
      config.projectId = process.env.GCP_PROJECT_ID;
      
      if (!config.projectId) {
        throw new Error(
          'GCP_PROJECT_ID environment variable is required when CLOUD_PROVIDER=gcp'
        );
      }
      break;

    case 'local':
      config.localDataDir = process.env.LOCAL_DATA_DIR || '.test-data';
      break;
  }

  return config;
}

/**
 * Validate cloud configuration
 */
export function validateCloudConfig(config: CloudConfig): void {
  if (!config.provider) {
    throw new Error('Cloud provider is required');
  }

  if (config.provider === 'gcp' && !config.projectId) {
    throw new Error('GCP project ID is required for GCP provider');
  }

  if (config.provider === 'local' && !config.localDataDir) {
    throw new Error('Local data directory is required for local provider');
  }
}
