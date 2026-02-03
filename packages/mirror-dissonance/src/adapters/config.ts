/**
 * Cloud Configuration for Adapter Factory
 */

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'local';

export interface CloudConfig {
  provider: CloudProvider;
  region?: string;
  endpoint?: string; // For LocalStack/testing
  
  // Table/bucket names
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  calibrationTableName?: string;
  baselineBucket?: string;
  reportBucket?: string;
  
  // Secret parameter names
  nonceParameterName?: string;
  saltParameterPrefix?: string;
}

export interface AWSConfig extends CloudConfig {
  provider: 'aws';
  region: string;
  
  // AWS-specific settings
  dynamodbEndpoint?: string;
  s3Endpoint?: string;
  ssmEndpoint?: string;
}

export interface LocalConfig extends CloudConfig {
  provider: 'local';
  
  // Local storage paths (optional)
  dataDir?: string;
}

/**
 * Load cloud configuration from environment variables
 */
export function loadCloudConfig(): CloudConfig {
  const provider = (process.env.CLOUD_PROVIDER || 'aws') as CloudProvider;
  
  const baseConfig: CloudConfig = {
    provider,
    region: process.env.AWS_REGION || process.env.REGION || 'us-east-1',
    endpoint: process.env.AWS_ENDPOINT,
    
    fpTableName: process.env.FP_TABLE_NAME || 'phase-mirror-fp-events',
    consentTableName: process.env.CONSENT_TABLE_NAME || 'phase-mirror-consents',
    blockCounterTableName: process.env.BLOCK_COUNTER_TABLE_NAME || 'phase-mirror-block-counter',
    calibrationTableName: process.env.CALIBRATION_TABLE_NAME || 'phase-mirror-calibration',
    baselineBucket: process.env.BASELINE_BUCKET || 'phase-mirror-baselines',
    reportBucket: process.env.REPORT_BUCKET || 'phase-mirror-reports',
    
    nonceParameterName: process.env.NONCE_PARAMETER_NAME || '/phase-mirror/redaction-nonce',
    saltParameterPrefix: process.env.SALT_PARAMETER_PREFIX || '/phase-mirror/salts/',
  };
  
  if (provider === 'aws') {
    return {
      ...baseConfig,
      provider: 'aws',
      region: baseConfig.region!,
      dynamodbEndpoint: process.env.DYNAMODB_ENDPOINT,
      s3Endpoint: process.env.S3_ENDPOINT,
      ssmEndpoint: process.env.SSM_ENDPOINT,
    } as AWSConfig;
  }
  
  if (provider === 'local') {
    return {
      ...baseConfig,
      provider: 'local',
      dataDir: process.env.LOCAL_DATA_DIR || '/tmp/phase-mirror-local',
    } as LocalConfig;
  }
  
  return baseConfig;
}
