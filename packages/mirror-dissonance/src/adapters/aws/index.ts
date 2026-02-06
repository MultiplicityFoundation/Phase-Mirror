// AWS adapter — wraps existing DynamoDB + SSM implementations
// behind cloud-agnostic interfaces.
//
// This file is the ONLY place in the codebase that should import
// from @aws-sdk/*. The dynamic import in factory.ts ensures these
// dependencies don't bloat the bundle for non-AWS users.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SSMClient } from "@aws-sdk/client-ssm";
import { S3Client } from "@aws-sdk/client-s3";
import type { Adapters } from "../types";
import type { CloudConfig } from "../types";
import { AWSFPStore } from "./fp-store";
import { AWSConsentStore } from "./consent-store";
import { AWSBlockCounter } from "./block-counter";
import { AWSSecretStore } from "./secret-store";
import { AWSBaselineStore } from "./baseline-store";

export async function createAWSAdapters(config: CloudConfig): Promise<Adapters> {
  const clientConfig = {
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
  };

  const dynamodb = new DynamoDBClient(clientConfig);
  const ssm = new SSMClient(clientConfig);
  const s3 = new S3Client(clientConfig);

  // Validate required config — fail-closed, not silent fallback
  if (!config.fpTableName) {
    throw new Error(
      "AWS adapter requires FP_TABLE_NAME. " +
        "Set CLOUD_PROVIDER=local for development without AWS."
    );
  }
  if (!config.consentTableName) {
    throw new Error("AWS adapter requires CONSENT_TABLE_NAME.");
  }
  if (!config.blockCounterTableName) {
    throw new Error("AWS adapter requires BLOCK_COUNTER_TABLE_NAME.");
  }
  if (!config.nonceParameterName) {
    throw new Error("AWS adapter requires NONCE_PARAMETER_NAME.");
  }

  return {
    fpStore: new AWSFPStore(dynamodb, config.fpTableName),
    consentStore: new AWSConsentStore(dynamodb, config.consentTableName),
    blockCounter: new AWSBlockCounter(dynamodb, config.blockCounterTableName),
    secretStore: new AWSSecretStore(ssm),
    baselineStore: new AWSBaselineStore(s3, config.baselineBucket || ""),
    provider: "aws",
  };
}

// Re-export for backward compatibility
export { createAWSAdapters as createAwsAdapters };
