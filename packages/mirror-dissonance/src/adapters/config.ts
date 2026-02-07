// packages/mirror-dissonance/src/adapters/config.ts

import { CloudConfig } from './types.js';

export function loadCloudConfig(): CloudConfig {
  const provider = (process.env.CLOUD_PROVIDER || 'local') as CloudConfig['provider'];

  const base: CloudConfig = { provider };

  switch (provider) {
    case 'aws':
      return {
        ...base,
        region: process.env.AWS_REGION || process.env.CLOUD_REGION || 'us-east-1',
        fpTableName: process.env.FP_TABLE_NAME,
        consentTableName: process.env.CONSENT_TABLE_NAME,
        blockCounterTableName: process.env.BLOCK_COUNTER_TABLE_NAME,
        nonceParameterName: process.env.NONCE_PARAMETER_NAME,
        baselineBucket: process.env.BASELINE_BUCKET,
      };

    case 'gcp':
      if (!process.env.GCP_PROJECT_ID) {
        throw new Error(
          'GCP_PROJECT_ID is required when CLOUD_PROVIDER=gcp'
        );
      }
      return {
        ...base,
        gcpProjectId: process.env.GCP_PROJECT_ID,
        region: process.env.GCP_REGION || 'us-central1',
      };

    case 'local':
      return {
        ...base,
        localDataDir: process.env.LOCAL_DATA_DIR || '.phase-mirror-data',
      };

    default:
      throw new Error(
        `Unknown CLOUD_PROVIDER: "${provider}". Must be aws, gcp, or local.`
      );
  }
}
