/**
 * E2E Test Setup
 * Loads configuration from deployed staging infrastructure
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SSMClient } from '@aws-sdk/client-ssm';
import { S3Client } from '@aws-sdk/client-s3';
import { CloudWatchClient } from '@aws-sdk/client-cloudwatch';

const REGION = process.env.AWS_REGION || 'us-east-1';
const ENVIRONMENT = process.env.ENVIRONMENT || 'staging';

export const config = {
  region: REGION,
  environment: ENVIRONMENT,
  
  // DynamoDB tables (from Terraform outputs)
  tables: {
    fpEvents: `mirror-dissonance-${ENVIRONMENT}-fp-events`,
    consent: `mirror-dissonance-${ENVIRONMENT}-consent`,
    blockCounter: `mirror-dissonance-${ENVIRONMENT}-block-counter`
  },
  
  // SSM parameters
  parameters: {
    nonceV1: `/guardian/${ENVIRONMENT}/redaction_nonce_v1`
  },
  
  // S3 buckets
  buckets: {
    baselines: `mirror-dissonance-${ENVIRONMENT}-baselines`
  },
  
  // CloudWatch
  cloudwatch: {
    namespace: `mirror-dissonance/${ENVIRONMENT}`,
    logGroup: `/aws/github-actions/mirror-dissonance-${ENVIRONMENT}`
  }
};

// AWS clients
export const clients = {
  dynamodb: new DynamoDBClient({ region: REGION }),
  ssm: new SSMClient({ region: REGION }),
  s3: new S3Client({ region: REGION }),
  cloudwatch: new CloudWatchClient({ region: REGION })
};

// Test helpers
export function generateTestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

export function createTestTimestamp(): string {
  return new Date().toISOString();
}

// Cleanup helper
export async function cleanupTestData(testIds: string[]): Promise<void> {
  // Implementation will delete test records from DynamoDB, S3, etc.
  console.log(`Cleaning up ${testIds.length} test records...`);
}

// Verify infrastructure is available
export async function verifyInfrastructure(): Promise<boolean> {
  try {
    // Check DynamoDB tables exist
    const { DescribeTableCommand } = await import('@aws-sdk/client-dynamodb');
    
    await clients.dynamodb.send(new DescribeTableCommand({
      TableName: config.tables.fpEvents
    }));
    
    // Check SSM parameter exists
    const { GetParameterCommand } = await import('@aws-sdk/client-ssm');
    
    await clients.ssm.send(new GetParameterCommand({
      Name: config.parameters.nonceV1
    }));
    
    // Check S3 bucket exists
    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    
    await clients.s3.send(new HeadBucketCommand({
      Bucket: config.buckets.baselines
    }));
    
    console.log('✓ Infrastructure verification passed');
    return true;
  } catch (error: any) {
    console.error('✗ Infrastructure verification failed:', error.message);
    return false;
  }
}
