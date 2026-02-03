/**
 * Local In-Memory False Positive Store Adapter
 */

import { randomUUID } from 'crypto';
import { FPStoreAdapter, FPQuery } from '../types.js';
import { FalsePositiveEvent } from '../../../schemas/types.js';

export class LocalFPStoreAdapter implements FPStoreAdapter {
  private events: Map<string, FalsePositiveEvent> = new Map();
  private findingIndex: Map<string, string> = new Map(); // findingId -> id

  async record(event: Omit<FalsePositiveEvent, 'id'> & { id?: string }): Promise<string> {
    const id = event.id || randomUUID();
    const timestamp = event.timestamp || new Date().toISOString();

    const fpEvent: FalsePositiveEvent = {
      id,
      findingId: event.findingId,
      ruleId: event.ruleId,
      timestamp,
      resolvedBy: event.resolvedBy,
      context: event.context,
      orgIdHash: event.orgIdHash,
      consent: event.consent,
    };

    this.events.set(id, fpEvent);
    this.findingIndex.set(event.findingId, id);

    return id;
  }

  async markAsFP(findingId: string, resolvedBy: string): Promise<void> {
    const id = this.findingIndex.get(findingId);
    if (!id) {
      throw new Error(`Finding ${findingId} not found`);
    }

    const event = this.events.get(id);
    if (event) {
      event.resolvedBy = resolvedBy;
      this.events.set(id, event);
    }
  }

  async isFalsePositive(findingId: string): Promise<boolean> {
    return this.findingIndex.has(findingId);
  }

  async query(query: FPQuery): Promise<FalsePositiveEvent[]> {
    let results = Array.from(this.events.values());

    // Filter by orgId
    if (query.orgId) {
      results = results.filter((e) => e.orgIdHash === query.orgId);
    }

    // Filter by repoId
    if (query.repoId) {
      results = results.filter((e) => e.context?.repoId === query.repoId);
    }

    // Filter by ruleId
    if (query.ruleId) {
      results = results.filter((e) => e.ruleId === query.ruleId);
    }

    // Filter by time range
    if (query.startTime || query.endTime) {
      results = results.filter((e) => {
        const eventTime = new Date(e.timestamp);
        if (query.startTime && eventTime < query.startTime) return false;
        if (query.endTime && eventTime > query.endTime) return false;
        return true;
      });
    }

    // Sort by timestamp (most recent first)
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit
    if (query.limit) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  // Testing utility
  clear(): void {
    this.events.clear();
    this.findingIndex.clear();
  }
}
