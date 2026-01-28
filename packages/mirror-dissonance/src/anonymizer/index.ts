/**
 * Anonymizer Service for Phase 2 FP Calibration Service
 * Implements HMAC-SHA256 anonymization per ADR-004
 */
import { createHmac } from 'crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export interface AnonymizerConfig {
  saltParameterName: string;
  region?: string;
}

export interface SaltConfig {
  value: string;
  loadedAt: string;
  rotationMonth: string;
}

export class Anonymizer {
  private saltConfig: SaltConfig | null = null;
  private ssmClient: SSMClient;
  private saltParameterName: string;

  constructor(config: AnonymizerConfig) {
    this.ssmClient = new SSMClient({ region: config.region || 'us-east-1' });
    this.saltParameterName = config.saltParameterName;
  }

  async loadSalt(): Promise<void> {
    try {
      const command = new GetParameterCommand({
        Name: this.saltParameterName,
        WithDecryption: true,
      });

      const response = await this.ssmClient.send(command);
      
      if (!response.Parameter?.Value) {
        throw new Error('Salt parameter not found or empty');
      }

      const salt = response.Parameter.Value;
      
      if (!this.isValidSalt(salt)) {
        throw new Error('Invalid salt format: must be 64-character hex string');
      }

      const now = new Date();
      this.saltConfig = {
        value: salt,
        loadedAt: now.toISOString(),
        rotationMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      };
    } catch (error) {
      console.error('Failed to load salt from SSM:', error);
      throw error;
    }
  }

  private isValidSalt(salt: string): boolean {
    return /^[0-9a-f]{64}$/i.test(salt);
  }

  async anonymizeOrgId(orgId: string): Promise<string> {
    if (!orgId || orgId.trim().length === 0) {
      throw new Error('Organization ID cannot be empty');
    }

    if (orgId.length > 255) {
      throw new Error('Organization ID exceeds maximum length of 255 characters');
    }

    if (!this.saltConfig) {
      await this.loadSalt();
    }

    if (!this.saltConfig) {
      throw new Error('Salt not loaded');
    }

    const hmac = createHmac('sha256', this.saltConfig.value);
    hmac.update(orgId);
    return hmac.digest('hex');
  }

  getSaltRotationMonth(): string | null {
    return this.saltConfig?.rotationMonth || null;
  }

  isSaltLoaded(): boolean {
    return this.saltConfig !== null;
  }
}

/**
 * NoOp Anonymizer for development/testing only.
 * WARNING: This implementation uses a hardcoded test salt and is NOT secure.
 * NEVER use this in production. Always use the full Anonymizer with AWS Secrets Manager.
 */
export class NoOpAnonymizer {
  async loadSalt(): Promise<void> {
    console.log('NoOp: Would load salt from SSM');
  }

  async anonymizeOrgId(orgId: string): Promise<string> {
    if (!orgId || orgId.trim().length === 0) {
      throw new Error('Organization ID cannot be empty');
    }
    
    // Using longer test salt to match expected format (64 hex chars)
    const testSalt = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const hmac = createHmac('sha256', testSalt);
    hmac.update(orgId);
    return hmac.digest('hex');
  }

  getSaltRotationMonth(): string | null {
    return new Date().toISOString().slice(0, 7);
  }

  isSaltLoaded(): boolean {
    return true;
  }
}

export function createAnonymizer(config?: AnonymizerConfig): Anonymizer | NoOpAnonymizer {
  if (config && config.saltParameterName) {
    return new Anonymizer(config);
  }
  return new NoOpAnonymizer();
}
