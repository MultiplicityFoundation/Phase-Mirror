// Reads cloud provider configuration from environment.
// Single source of truth for all adapter wiring decisions.

export type CloudProvider = "aws" | "gcp" | "local";

export interface CloudConfig {
  provider: CloudProvider;
  region: string;

  // AWS-specific
  fpTableName?: string;
  consentTableName?: string;
  blockCounterTableName?: string;
  nonceParameterName?: string;
  baselineBucket?: string;

  // GCP-specific
  gcpProjectId?: string;

  // Local-specific (JSON file paths)
  localDataDir?: string;

  // Override endpoint for LocalStack / emulators
  endpoint?: string;
}

export function loadCloudConfig(): CloudConfig {
  const provider = (process.env.CLOUD_PROVIDER || "local") as CloudProvider;

  if (!["aws", "gcp", "local"].includes(provider)) {
    throw new Error(
      `Invalid CLOUD_PROVIDER: "${provider}". Must be aws | gcp | local.`
    );
  }

  return {
    provider,
    region: process.env.AWS_REGION || process.env.GCP_REGION || "us-east-1",

    // AWS
    fpTableName: process.env.FP_TABLE_NAME,
    consentTableName: process.env.CONSENT_TABLE_NAME,
    blockCounterTableName: process.env.BLOCK_COUNTER_TABLE_NAME,
    nonceParameterName: process.env.NONCE_PARAMETER_NAME,
    baselineBucket: process.env.BASELINE_BUCKET,

    // GCP
    gcpProjectId: process.env.GCP_PROJECT_ID,

    // Local
    localDataDir: process.env.LOCAL_DATA_DIR || ".mirror-data",

    // Endpoint override (LocalStack, DynamoDB Local, etc.)
    endpoint: process.env.CLOUD_ENDPOINT,
  };
}
