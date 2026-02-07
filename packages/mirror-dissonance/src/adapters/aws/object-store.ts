/**
 * AWS S3 Object Store Adapter
 *
 * Wraps S3 GetObject, PutObject, and ListObjectVersions operations
 * behind the ObjectStoreAdapter interface for baseline storage.
 *
 * Preserves existing S3 call patterns from the test harness and
 * adapters/aws/index.ts — no behavior change.
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import { ObjectStoreAdapter, CloudConfig } from '../types.js';

export class AwsObjectStore implements ObjectStoreAdapter {
  private client: S3Client;
  private bucketName: string;

  constructor(config: CloudConfig) {
    this.client = new S3Client({ region: config.region || 'us-east-1' });
    this.bucketName = config.baselineBucket || 'phase-mirror-baselines';
  }

  async getBaseline(repoId: string): Promise<any | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: `baselines/${repoId}.json`,
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

      const content = Buffer.concat(chunks).toString('utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  async putBaseline(repoId: string, baseline: any): Promise<void> {
    const body = JSON.stringify(baseline);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: `baselines/${repoId}.json`,
      Body: Buffer.from(body, 'utf-8'),
      ContentType: 'application/json',
    });

    await this.client.send(command);
  }

  async listBaselineVersions(
    repoId: string,
  ): Promise<Array<{ versionId: string; lastModified: Date }>> {
    try {
      const command = new ListObjectVersionsCommand({
        Bucket: this.bucketName,
        Prefix: `baselines/${repoId}.json`,
      });

      const response = await this.client.send(command);

      if (!response.Versions) {
        return [];
      }

      return response.Versions.filter((v) => v.VersionId)
        .map((v) => ({
          versionId: v.VersionId!,
          lastModified: v.LastModified || new Date(),
        }))
        .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    } catch (error: any) {
      console.error('Failed to list baseline versions:', error);
      return [];
    }
  }
}
