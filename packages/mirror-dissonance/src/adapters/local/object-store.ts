/**
 * Local In-Memory Object Store Adapter
 */

import {
  ObjectStoreAdapter,
  BaselineMetadata,
  BaselineVersion,
} from '../types.js';

interface StoredBaseline {
  content: Record<string, unknown>;
  metadata: BaselineMetadata;
  timestamp: Date;
  versionId: string;
}

export class LocalObjectStoreAdapter implements ObjectStoreAdapter {
  private baselines: Map<string, StoredBaseline[]> = new Map(); // repoId -> versions
  private reports: Map<string, Record<string, unknown>> = new Map(); // repoId#runId -> report

  async storeBaseline(
    repoId: string,
    baseline: Record<string, unknown>,
    metadata?: BaselineMetadata
  ): Promise<void> {
    const versions = this.baselines.get(repoId) || [];
    const versionId = `v${versions.length + 1}`;

    versions.push({
      content: baseline,
      metadata: metadata || {},
      timestamp: new Date(),
      versionId,
    });

    this.baselines.set(repoId, versions);
  }

  async getBaseline(repoId: string): Promise<Record<string, unknown> | null> {
    const versions = this.baselines.get(repoId);
    if (!versions || versions.length === 0) {
      return null;
    }

    // Return the most recent version
    return versions[versions.length - 1].content;
  }

  async listBaselineVersions(repoId: string, limit: number = 10): Promise<BaselineVersion[]> {
    const versions = this.baselines.get(repoId) || [];

    return versions
      .slice(-limit) // Get last N versions
      .reverse() // Most recent first
      .map((v) => ({
        versionId: v.versionId,
        lastModified: v.timestamp,
        commitSha: v.metadata.commitSha, // Optional: undefined if not provided
        size: JSON.stringify(v.content).length,
      }));
  }

  async storeReport(
    repoId: string,
    runId: string,
    report: Record<string, unknown>
  ): Promise<void> {
    const key = `${repoId}#${runId}`;
    this.reports.set(key, report);
  }

  async getReport(repoId: string, runId: string): Promise<Record<string, unknown> | null> {
    const key = `${repoId}#${runId}`;
    return this.reports.get(key) || null;
  }

  // Testing utility
  clear(): void {
    this.baselines.clear();
    this.reports.clear();
  }
}
