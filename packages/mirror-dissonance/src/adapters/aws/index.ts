/**
 * AWS Cloud Adapters
 * 
 * Wraps existing AWS implementations to conform to cloud adapter interfaces.
 * This allows the core logic to depend on interfaces rather than concrete AWS types.
 */

import {
  CloudConfig,
  CloudAdapters,
  IFPStoreAdapter,
  IConsentStoreAdapter,
  IBlockCounterAdapter,
  ISecretStoreAdapter,
  IBaselineStorageAdapter,
  ICalibrationStoreAdapter,
  NonceConfig,
  BaselineVersion,
  CalibrationResult,
  KAnonymityError,
} from '../types.js';

// Import existing AWS implementations
import { DynamoDBFPStore, IFPStore } from '../../fp-store/store.js';
import { ConsentStore, ConsentStoreConfig } from '../../consent-store/store.js';
import { BlockCounter, BlockCounterConfig } from '../../block-counter/counter.js';
import { NonceLoader } from '../../nonce/loader.js';
import { DynamoDBCalibrationStore, ICalibrationStore } from '../../calibration-store/index.js';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { FalsePositiveEvent } from '../../../schemas/types.js';
import { OrganizationConsent, ConsentResource, ConsentCheckResult, MultiResourceConsentResult } from '../../consent-store/schema.js';

/**
 * AWS FP Store Adapter
 */
class AwsFPStoreAdapter implements IFPStoreAdapter {
  constructor(private store: IFPStore) {}

  async recordFalsePositive(event: FalsePositiveEvent): Promise<void> {
    return this.store.recordFalsePositive(event);
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    return this.store.isFalsePositive(findingId);
  }

  async getFalsePositivesByRule(ruleId: string): Promise<FalsePositiveEvent[]> {
    return this.store.getFalsePositivesByRule(ruleId);
  }
}

/**
 * AWS Consent Store Adapter
 */
class AwsConsentStoreAdapter implements IConsentStoreAdapter {
  constructor(private store: ConsentStore) {}

  async checkResourceConsent(orgId: string, resource: ConsentResource): Promise<ConsentCheckResult> {
    return this.store.checkResourceConsent(orgId, resource);
  }

  async checkMultipleResources(orgId: string, resources: ConsentResource[]): Promise<MultiResourceConsentResult> {
    return this.store.checkMultipleResources(orgId, resources);
  }

  async getConsentSummary(orgId: string): Promise<OrganizationConsent | null> {
    return this.store.getConsentSummary(orgId);
  }

  async grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    return this.store.grantConsent(orgId, resource, grantedBy, expiresAt);
  }

  async revokeConsent(orgId: string, resource: ConsentResource, revokedBy: string): Promise<void> {
    return this.store.revokeConsent(orgId, resource, revokedBy);
  }

  async checkConsent(orgId: string): Promise<'explicit' | 'implicit' | 'none'> {
    return this.store.checkConsent(orgId);
  }

  async hasValidConsent(orgId: string): Promise<boolean> {
    return this.store.hasValidConsent(orgId);
  }
}

/**
 * AWS Block Counter Adapter
 */
class AwsBlockCounterAdapter implements IBlockCounterAdapter {
  constructor(private counter: BlockCounter) {}

  async increment(ruleId: string): Promise<number> {
    return this.counter.increment(ruleId);
  }

  async getCount(ruleId: string): Promise<number> {
    return this.counter.getCount(ruleId);
  }
}

/**
 * AWS Secret Store Adapter
 */
class AwsSecretStoreAdapter implements ISecretStoreAdapter {
  constructor(
    private loader: NonceLoader,
    private parameterName: string = 'guardian/redaction_nonce'
  ) {}

  async getNonce(): Promise<NonceConfig | null> {
    try {
      return await this.loader.loadNonce(this.parameterName);
    } catch (error) {
      console.error('Failed to load nonce from SSM:', error);
      return null; // Fail-closed
    }
  }

  async rotateNonce(newValue: string): Promise<void> {
    // AWS SSM doesn't have a built-in rotation API
    // In practice, rotation is done via Terraform or AWS Console
    // This is a placeholder that throws to prevent accidental use
    throw new Error(
      'Nonce rotation for AWS SSM must be done via Terraform, AWS Console, or AWS CLI. ' +
      'Use `aws ssm put-parameter --name ${parameterName} --value ${newValue} --overwrite`'
    );
  }
}

/**
 * AWS Baseline Storage Adapter (S3)
 */
class AwsBaselineStorageAdapter implements IBaselineStorageAdapter {
  private client: S3Client;
  private bucketName: string;

  constructor(region: string, bucketName: string) {
    this.client = new S3Client({ region });
    this.bucketName = bucketName;
  }

  async storeBaseline(key: string, content: string | Buffer, contentType?: string): Promise<void> {
    const body = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8');

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType || 'application/json',
    });

    await this.client.send(command);
  }

  async getBaseline(key: string): Promise<string | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.client.send(command);
      
      if (!response.Body) {
        return null;
      }

      // Convert stream to string
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks).toString('utf-8');
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async listBaselines(): Promise<BaselineVersion[]> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
    });

    const response = await this.client.send(command);
    
    if (!response.Contents) {
      return [];
    }

    return response.Contents
      .filter((obj) => obj.Key)
      .map((obj) => ({
        version: obj.Key!,
        uploadedAt: obj.LastModified || new Date(),
        size: obj.Size || 0,
      }))
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }

  async deleteBaseline(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);
  }
}

/**
 * AWS Calibration Store Adapter
 */
class AwsCalibrationStoreAdapter implements ICalibrationStoreAdapter {
  constructor(private store: ICalibrationStore) {}

  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    return this.store.aggregateFPsByRule(ruleId);
  }

  async getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError> {
    return this.store.getRuleFPRate(ruleId, startDate, endDate);
  }

  async getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError> {
    return this.store.getAllRuleFPRates();
  }
}

/**
 * Create AWS adapters from configuration
 */
export function createAwsAdapters(config: CloudConfig): CloudAdapters {
  const region = config.region || process.env.AWS_REGION || 'us-east-1';

  // Table names from environment variables or defaults
  const fpTableName = process.env.FP_STORE_TABLE || 'phase-mirror-fp-events';
  const consentTableName = process.env.CONSENT_STORE_TABLE || 'phase-mirror-consent';
  const blockCounterTableName = process.env.BLOCK_COUNTER_TABLE || 'phase-mirror-block-counter';
  const baselineBucket = process.env.BASELINE_BUCKET || 'phase-mirror-baselines';
  const nonceParameter = process.env.NONCE_PARAMETER || 'guardian/redaction_nonce';

  // Create AWS service instances
  const fpStore = new DynamoDBFPStore({
    tableName: fpTableName,
    region,
  });

  const consentStore = new ConsentStore({
    tableName: consentTableName,
    region,
  });

  const blockCounter = new BlockCounter({
    tableName: blockCounterTableName,
    region,
  });

  const nonceLoader = new NonceLoader(region);

  const baselineStorage = new AwsBaselineStorageAdapter(region, baselineBucket);

  const calibrationStore = new DynamoDBCalibrationStore({
    tableName: fpTableName, // Uses same table as FP store
    region,
  });

  // Return adapters
  return {
    fpStore: new AwsFPStoreAdapter(fpStore),
    consentStore: new AwsConsentStoreAdapter(consentStore),
    blockCounter: new AwsBlockCounterAdapter(blockCounter),
    secretStore: new AwsSecretStoreAdapter(nonceLoader, nonceParameter),
    baselineStorage,
    calibrationStore: new AwsCalibrationStoreAdapter(calibrationStore),
  };
}
