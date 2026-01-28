/**
 * Ingest Handler for Phase 2 FP Calibration Service
 * Orchestrates: consent check → anonymization → storage
 * Implements batching and timestamp randomization per ADR-004
 */
import { IConsentStore } from '../consent-store/index.js';
import { Anonymizer, NoOpAnonymizer } from '../anonymizer/index.js';
import { IFPStore } from '../fp-store/index.js';
import { IngestEvent, AnonymizedIngestEvent, FalsePositiveEvent } from '../../schemas/types.js';

export interface IngestHandlerConfig {
  consentStore: IConsentStore;
  anonymizer: Anonymizer | NoOpAnonymizer;
  fpStore: IFPStore;
  batchDelayMs?: number;
}

export interface IngestResult {
  success: boolean;
  reason?: string;
  processedAt?: string;
}

export class IngestHandler {
  private consentStore: IConsentStore;
  private anonymizer: Anonymizer | NoOpAnonymizer;
  private fpStore: IFPStore;
  private batchDelayMs: number;

  constructor(config: IngestHandlerConfig) {
    this.consentStore = config.consentStore;
    this.anonymizer = config.anonymizer;
    this.fpStore = config.fpStore;
    this.batchDelayMs = config.batchDelayMs || 3600000;
  }

  async ingest(event: IngestEvent): Promise<IngestResult> {
    const consent = await this.consentStore.checkConsent(event.orgId);
    
    if (consent === 'none') {
      return {
        success: false,
        reason: 'No consent granted for data collection',
      };
    }

    const orgIdHash = await this.anonymizer.anonymizeOrgId(event.orgId);

    const randomizedTimestamp = this.randomizeTimestamp(event.timestamp, this.batchDelayMs);

    const anonymizedEvent: AnonymizedIngestEvent = {
      orgIdHash,
      ruleId: event.ruleId,
      isFalsePositive: event.isFalsePositive,
      timestamp: randomizedTimestamp,
      consent,
    };

    await this.storeAnonymizedEvent(anonymizedEvent);

    return {
      success: true,
      processedAt: new Date().toISOString(),
    };
  }

  async ingestBatch(events: IngestEvent[]): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    for (const event of events) {
      try {
        const result = await this.ingest(event);
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  private randomizeTimestamp(timestamp: string, maxDelayMs: number): string {
    const originalTime = new Date(timestamp).getTime();
    
    if (isNaN(originalTime)) {
      throw new Error(`Invalid timestamp format: ${timestamp}`);
    }
    
    const randomDelay = Math.floor(Math.random() * maxDelayMs);
    const randomizedTime = new Date(originalTime + randomDelay);
    return randomizedTime.toISOString();
  }

  private async storeAnonymizedEvent(event: AnonymizedIngestEvent): Promise<void> {
    const fpEvent: FalsePositiveEvent = {
      id: this.generateId(),
      findingId: this.generateFindingId(event),
      ruleId: event.ruleId,
      timestamp: event.timestamp,
      resolvedBy: 'calibration-service',
      context: {
        isFalsePositive: event.isFalsePositive,
      },
      orgIdHash: event.orgIdHash,
      consent: event.consent,
    };

    await this.fpStore.recordFalsePositive(fpEvent);
  }

  private generateId(): string {
    return `fp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private generateFindingId(event: AnonymizedIngestEvent): string {
    return `finding-${event.ruleId}-${event.orgIdHash.slice(0, 8)}-${Date.now()}`;
  }
}

export function createIngestHandler(config: IngestHandlerConfig): IngestHandler {
  return new IngestHandler(config);
}
