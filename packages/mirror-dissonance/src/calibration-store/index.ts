/**
 * Calibration Store with k-Anonymity Enforcement
 * Implements k-anonymity (k=10) per ADR-004
 * 
 * DynamoDB Table Requirements:
 * - Primary Key: id (String)
 * - Attributes: orgIdHash, ruleId, timestamp, context, isFalsePositive
 * - Global Secondary Index: 'rule-index' with ruleId as partition key
 * - TTL: Optional, configured separately for data retention
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { CalibrationResult, KAnonymityError } from '../../schemas/types.js';

export interface CalibrationStoreConfig {
  tableName: string;
  region?: string;
  kAnonymityThreshold?: number;
}

export interface ICalibrationStore {
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError>;
  getRuleFPRate(ruleId: string, startDate?: string, endDate?: string): Promise<CalibrationResult | KAnonymityError>;
  getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError>;
}

export class DynamoDBCalibrationStore implements ICalibrationStore {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private kThreshold: number;

  constructor(config: CalibrationStoreConfig) {
    const dynamoClient = new DynamoDBClient({ region: config.region || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(dynamoClient);
    this.tableName = config.tableName;
    this.kThreshold = config.kAnonymityThreshold || 10;
  }

  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'rule-index',
        KeyConditionExpression: 'ruleId = :ruleId',
        ExpressionAttributeValues: {
          ':ruleId': ruleId,
        },
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      const uniqueOrgs = new Set(items.map(item => item.orgIdHash));
      const orgCount = uniqueOrgs.size;

      if (orgCount < this.kThreshold) {
        return {
          error: 'INSUFFICIENT_K_ANONYMITY',
          message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
          requiredK: this.kThreshold,
          actualK: orgCount,
        };
      }

      const totalFPs = items.filter(item => item.context?.isFalsePositive === true).length;

      return {
        ruleId,
        totalFPs,
        orgCount,
        averageFPsPerOrg: orgCount > 0 ? totalFPs / orgCount : 0,
        meetsKAnonymity: true,
      };
    } catch (error) {
      console.error('Failed to aggregate FPs by rule:', error);
      throw error;
    }
  }

  async getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError> {
    try {
      let filterExpression = '';
      const expressionAttributeValues: Record<string, string | number | boolean> = {
        ':ruleId': ruleId,
      };

      if (startDate) {
        filterExpression = 'timestamp >= :startDate';
        expressionAttributeValues[':startDate'] = startDate;
      }

      if (endDate) {
        filterExpression += filterExpression ? ' AND timestamp <= :endDate' : 'timestamp <= :endDate';
        expressionAttributeValues[':endDate'] = endDate;
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'rule-index',
        KeyConditionExpression: 'ruleId = :ruleId',
        FilterExpression: filterExpression || undefined,
        ExpressionAttributeValues: expressionAttributeValues,
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      const uniqueOrgs = new Set(items.map(item => item.orgIdHash));
      const orgCount = uniqueOrgs.size;

      if (orgCount < this.kThreshold) {
        return {
          error: 'INSUFFICIENT_K_ANONYMITY',
          message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
          requiredK: this.kThreshold,
          actualK: orgCount,
        };
      }

      const totalFPs = items.filter(item => item.context?.isFalsePositive === true).length;

      return {
        ruleId,
        totalFPs,
        orgCount,
        averageFPsPerOrg: orgCount > 0 ? totalFPs / orgCount : 0,
        meetsKAnonymity: true,
      };
    } catch (error) {
      console.error('Failed to get rule FP rate:', error);
      throw error;
    }
  }

  async getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError> {
    try {
      const command = new ScanCommand({
        TableName: this.tableName,
      });

      const response = await this.client.send(command);
      const items = response.Items || [];

      const uniqueOrgs = new Set(items.map(item => item.orgIdHash));
      const orgCount = uniqueOrgs.size;

      if (orgCount < this.kThreshold) {
        return {
          error: 'INSUFFICIENT_K_ANONYMITY',
          message: `Insufficient data for privacy-preserving query. Requires at least ${this.kThreshold} organizations, found ${orgCount}.`,
          requiredK: this.kThreshold,
          actualK: orgCount,
        };
      }

      const ruleMap = new Map<string, { totalFPs: number; orgs: Set<string> }>();

      for (const item of items) {
        if (!ruleMap.has(item.ruleId)) {
          ruleMap.set(item.ruleId, { totalFPs: 0, orgs: new Set() });
        }

        const ruleData = ruleMap.get(item.ruleId)!;
        if (item.context?.isFalsePositive === true) {
          ruleData.totalFPs++;
        }
        ruleData.orgs.add(item.orgIdHash);
      }

      const results: CalibrationResult[] = [];

      for (const [ruleId, data] of ruleMap.entries()) {
        if (data.orgs.size >= this.kThreshold) {
          results.push({
            ruleId,
            totalFPs: data.totalFPs,
            orgCount: data.orgs.size,
            averageFPsPerOrg: data.totalFPs / data.orgs.size,
            meetsKAnonymity: true,
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to get all rule FP rates:', error);
      throw error;
    }
  }
}

export class NoOpCalibrationStore implements ICalibrationStore {
  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    return {
      error: 'INSUFFICIENT_K_ANONYMITY',
      message: 'NoOp store: No data available',
      requiredK: 10,
      actualK: 0,
    };
  }

  async getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError> {
    return {
      error: 'INSUFFICIENT_K_ANONYMITY',
      message: 'NoOp store: No data available',
      requiredK: 10,
      actualK: 0,
    };
  }

  async getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError> {
    return [];
  }
}

export function createCalibrationStore(config?: CalibrationStoreConfig): ICalibrationStore {
  if (config && config.tableName) {
    return new DynamoDBCalibrationStore(config);
  }
  return new NoOpCalibrationStore();
}
