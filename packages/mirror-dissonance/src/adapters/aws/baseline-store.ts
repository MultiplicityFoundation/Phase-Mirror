// AWS Baseline Store Adapter - wraps S3 operations

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { BaselineStoreAdapter } from "../types";

export class AWSBaselineStore implements BaselineStoreAdapter {
  constructor(
    private readonly client: S3Client,
    private readonly bucketName: string
  ) {}

  async getBaseline(key: string): Promise<string | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        })
      );

      if (!result.Body) {
        return null;
      }

      // Convert stream to string
      const chunks: Uint8Array[] = [];
      for await (const chunk of result.Body as any) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks).toString("utf-8");
    } catch (error: any) {
      if (error.name === "NoSuchKey") {
        return null;
      }
      throw error;
    }
  }

  async putBaseline(key: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: "application/json",
      })
    );
  }
}
