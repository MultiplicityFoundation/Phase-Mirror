// AWS Consent Store Adapter
// Implements ConsentStoreAdapter using DynamoDB

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { ConsentStoreAdapter } from "../types.blueprint";
import type {
  CalibrationConsent,
  ConsentQuery,
} from "../../consent-store/types";

export class AWSConsentStore implements ConsentStoreAdapter {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async grantConsent(consent: CalibrationConsent): Promise<void> {
    const item = {
      orgId: consent.orgId,
      grantedBy: consent.grantedBy,
      grantedAt: consent.grantedAt.toISOString(),
      expiresAt: consent.expiresAt?.toISOString(),
      resources: consent.resources,
      updatedAt: new Date().toISOString(),
    };

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item, { removeUndefinedValues: true }),
      })
    );
  }

  async revokeConsent(orgId: string, revokedBy: string): Promise<void> {
    await this.client.send(
      new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ orgId }),
        UpdateExpression:
          "SET revokedBy = :revokedBy, revokedAt = :revokedAt, updatedAt = :updatedAt",
        ExpressionAttributeValues: marshall({
          ":revokedBy": revokedBy,
          ":revokedAt": new Date().toISOString(),
          ":updatedAt": new Date().toISOString(),
        }),
      })
    );
  }

  async hasConsent(query: ConsentQuery): Promise<boolean> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ orgId: query.orgId }),
      })
    );

    if (!result.Item) return false;

    const item = unmarshall(result.Item);

    // Check if revoked
    if (item.revokedAt) return false;

    // Check if expired
    if (item.expiresAt && new Date(item.expiresAt) < new Date()) return false;

    // If checking specific resource, verify it's in the resources list
    if (query.resource) {
      return item.resources && item.resources.includes(query.resource);
    }

    return true;
  }

  async getConsent(orgId: string): Promise<CalibrationConsent | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ orgId }),
      })
    );

    if (!result.Item) return null;

    const item = unmarshall(result.Item);

    return {
      orgId: item.orgId,
      grantedBy: item.grantedBy,
      grantedAt: new Date(item.grantedAt),
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
      resources: item.resources || [],
    };
  }
}
