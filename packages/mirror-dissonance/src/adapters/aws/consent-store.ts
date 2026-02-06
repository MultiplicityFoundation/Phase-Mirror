// AWS Consent Store Adapter - wraps DynamoDB operations

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import type { ConsentStoreAdapter } from "../types";
import type {
  OrganizationConsent,
  ConsentResource,
} from "../../consent-store/schema";

export class AWSConsentStore implements ConsentStoreAdapter {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string
  ) {}

  async grantConsent(
    orgId: string,
    resource: ConsentResource,
    grantedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    const now = new Date();
    
    // First, get existing consent record or create new
    const existingConsent = await this.getConsent(orgId);
    
    const consent: OrganizationConsent = existingConsent || {
      orgId,
      resources: {} as any,
      grantedBy,
      consentVersion: "1.0",
      history: [],
      updatedAt: now,
      createdAt: now,
    };

    // Update the specific resource
    consent.resources[resource] = {
      resource,
      state: "granted",
      grantedAt: now,
      expiresAt,
    };

    // Add history event
    consent.history.push({
      eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      eventType: "granted",
      resource,
      timestamp: now,
      actor: grantedBy,
      newState: "granted",
    });

    consent.updatedAt = now;

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(
          {
            pk: `org#${orgId}`,
            sk: "consent",
            ...consent,
            updatedAt: consent.updatedAt.toISOString(),
            createdAt: consent.createdAt.toISOString(),
            history: consent.history.map((h) => ({
              ...h,
              timestamp: h.timestamp.toISOString(),
            })),
            resources: Object.fromEntries(
              Object.entries(consent.resources).map(([key, val]) => [
                key,
                {
                  ...val,
                  grantedAt: val.grantedAt?.toISOString(),
                  expiresAt: val.expiresAt?.toISOString(),
                  revokedAt: val.revokedAt?.toISOString(),
                },
              ])
            ),
          },
          { removeUndefinedValues: true }
        ),
      })
    );
  }

  async revokeConsent(
    orgId: string,
    resource: ConsentResource,
    revokedBy: string
  ): Promise<void> {
    const consent = await this.getConsent(orgId);
    if (!consent) {
      throw new Error(`No consent record found for org ${orgId}`);
    }

    const now = new Date();
    
    // Update the specific resource
    consent.resources[resource] = {
      ...consent.resources[resource],
      state: "revoked",
      revokedAt: now,
    };

    // Add history event
    consent.history.push({
      eventId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      eventType: "revoked",
      resource,
      timestamp: now,
      actor: revokedBy,
      previousState: consent.resources[resource].state,
      newState: "revoked",
    });

    consent.updatedAt = now;

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(
          {
            pk: `org#${orgId}`,
            sk: "consent",
            ...consent,
            updatedAt: consent.updatedAt.toISOString(),
            createdAt: consent.createdAt.toISOString(),
            history: consent.history.map((h) => ({
              ...h,
              timestamp: h.timestamp.toISOString(),
            })),
            resources: Object.fromEntries(
              Object.entries(consent.resources).map(([key, val]) => [
                key,
                {
                  ...val,
                  grantedAt: val.grantedAt?.toISOString(),
                  expiresAt: val.expiresAt?.toISOString(),
                  revokedAt: val.revokedAt?.toISOString(),
                },
              ])
            ),
          },
          { removeUndefinedValues: true }
        ),
      })
    );
  }

  async hasConsent(orgId: string, resource: ConsentResource): Promise<boolean> {
    const consent = await this.getConsent(orgId);
    if (!consent) return false;

    const resourceStatus = consent.resources[resource];
    if (!resourceStatus) return false;

    // Check if granted and not expired
    if (resourceStatus.state !== "granted") return false;
    if (resourceStatus.expiresAt && new Date() > resourceStatus.expiresAt) {
      return false;
    }

    return true;
  }

  async getConsent(orgId: string): Promise<OrganizationConsent | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          pk: `org#${orgId}`,
          sk: "consent",
        }),
      })
    );

    if (!result.Item) return null;

    const raw = unmarshall(result.Item);
    
    return {
      orgId: raw.orgId,
      orgName: raw.orgName,
      resources: Object.fromEntries(
        Object.entries(raw.resources || {}).map(([key, val]: [string, any]) => [
          key,
          {
            ...val,
            grantedAt: val.grantedAt ? new Date(val.grantedAt) : undefined,
            expiresAt: val.expiresAt ? new Date(val.expiresAt) : undefined,
            revokedAt: val.revokedAt ? new Date(val.revokedAt) : undefined,
          },
        ])
      ),
      grantedBy: raw.grantedBy,
      consentVersion: raw.consentVersion,
      history: (raw.history || []).map((h: any) => ({
        ...h,
        timestamp: new Date(h.timestamp),
      })),
      updatedAt: new Date(raw.updatedAt),
      createdAt: new Date(raw.createdAt),
    };
  }
}
