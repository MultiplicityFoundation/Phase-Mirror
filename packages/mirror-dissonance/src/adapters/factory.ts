// packages/mirror-dissonance/src/adapters/factory.ts

import { CloudAdapters, CloudConfig } from './types.js';

export async function createAdapters(config: CloudConfig): Promise<CloudAdapters> {
  switch (config.provider) {
    case 'aws': {
      // Dynamic import: aws-sdk only loaded when CLOUD_PROVIDER=aws
      const { createAWSAdapters } = await import('./aws/index.js');
      return createAWSAdapters(config);
    }

    case 'gcp': {
      // Dynamic import: @google-cloud/* only loaded when CLOUD_PROVIDER=gcp
      const { createGcpAdapters } = await import('./gcp/index.js');
      return createGcpAdapters(config);
    }

    case 'local': {
      const { createLocalAdapters } = await import('./local/index.js');
      return createLocalAdapters(config);
    }

    default:
      throw new Error(`Unsupported cloud provider: ${config.provider}`);
  }
}
