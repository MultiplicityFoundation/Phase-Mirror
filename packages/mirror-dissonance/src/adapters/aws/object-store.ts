/**
 * AWS S3 Object Store Adapter
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import {
  ObjectStoreAdapter,
  BaselineMetadata,
  BaselineVersion,
} from '../types.js';
import { AWSConfig } from '../config.js';

export class AWSObjectStoreAdapter implements ObjectStoreAdapter {
  private client: S3Client;
  private baselineBucket: string;
  private reportBucket: string;

  constructor(config: AWSConfig) {
    const clientConfig: any = { region: config.region };
    if (config.s3Endpoint || config.endpoint) {
      clientConfig.endpoint = config.s3Endpoint || config.endpoint;
      clientConfig.forcePathStyle = true; // Required for LocalStack
    }
    
    this.client = new S3Client(clientConfig);
    this.baselineBucket = config.baselineBucket || 'phase-mirror-baselines';
    this.reportBucket = config.reportBucket || 'phase-mirror-reports';
  }

  async storeBaseline(
    repoId: string,
    baseline: Record<string, unknown>,
    metadata?: BaselineMetadata
  ): Promise<void> {
    try {
      const key = `baselines/${repoId}/current.json`;
      const metadataObj: Record<string, string> = {};
      
      if (metadata?.commitSha) {
        metadataObj.commitSha = metadata.commitSha;
      }
      if (metadata?.author) {
        metadataObj.author = metadata.author;
      }
      if (metadata?.timestamp) {
        metadataObj.timestamp = metadata.timestamp;
      }

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.baselineBucket,
          Key: key,
          Body: JSON.stringify(baseline, null, 2),
          ContentType: 'application/json',
          Metadata: metadataObj,
        })
      );
    } catch (error) {
      console.error('Failed to store baseline:', error);
      throw error;
    }
  }

  async getBaseline(repoId: string): Promise<Record<string, unknown> | null> {
    try {
      const key = `baselines/${repoId}/current.json`;

      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.baselineBucket,
          Key: key,
        })
      );

      if (!result.Body) return null;

      const content = await result.Body.transformToString();
      return JSON.parse(content);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      console.error('Failed to get baseline:', error);
      throw error;
    }
  }

  async listBaselineVersions(repoId: string, limit: number = 10): Promise<BaselineVersion[]> {
    try {
      const key = `baselines/${repoId}/current.json`;

      const result = await this.client.send(
        new ListObjectVersionsCommand({
          Bucket: this.baselineBucket,
          Prefix: key,
          MaxKeys: limit,
        })
      );

      if (!result.Versions) return [];

      return result.Versions.map((v) => ({
        versionId: v.VersionId || 'unknown',
        lastModified: v.LastModified || new Date(),
        commitSha: undefined, // Would need HeadObject call to get metadata
        size: v.Size || 0,
      }));
    } catch (error) {
      console.error('Failed to list baseline versions:', error);
      return [];
    }
  }

  async storeReport(
    repoId: string,
    runId: string,
    report: Record<string, unknown>
  ): Promise<void> {
    try {
      const key = `reports/${repoId}/${runId}.json`;

      await this.client.send(
        new PutObjectCommand({
          Bucket: this.reportBucket,
          Key: key,
          Body: JSON.stringify(report, null, 2),
          ContentType: 'application/json',
          Metadata: {
            repoId,
            runId,
            timestamp: new Date().toISOString(),
          },
        })
      );
    } catch (error) {
      console.error('Failed to store report:', error);
      throw error;
    }
  }

  async getReport(repoId: string, runId: string): Promise<Record<string, unknown> | null> {
    try {
      const key = `reports/${repoId}/${runId}.json`;

      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.reportBucket,
          Key: key,
        })
      );

      if (!result.Body) return null;

      const content = await result.Body.transformToString();
      return JSON.parse(content);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      console.error('Failed to get report:', error);
      throw error;
    }
  }
}
