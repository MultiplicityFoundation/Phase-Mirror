/**
 * Oracle wrapper for Phase Mirror CLI
 * Provides a simplified interface to the @mirror-dissonance/core oracle
 */
import type { Config } from '../types/cli.js';
import { resolveSchemaPath, resolveRulesDir } from '../paths.js';
import { computeFileHash, fileExists } from '../utils/hash.js';

export interface DriftChange {
  file: string;
  type: 'modified' | 'added' | 'removed';
  oldHash?: string;
  newHash?: string;
}

export interface DriftResult {
  driftDetected: boolean;
  magnitude: number;
  changes: DriftChange[];
}

export interface BaselineEntry {
  path: string;
  hash: string;
  exists: boolean;
}

export interface Baseline {
  version: string;
  createdAt: string;
  files: BaselineEntry[];
  metadata?: Record<string, unknown>;
}

export class PhaseOracle {
  private config: Config;
  private schemaPath: string | undefined;
  private rulesDir: string | undefined;

  constructor(config?: Config) {
    this.config = config || this.getDefaultConfig();
  }

  async initialize(): Promise<void> {
    // Resolve paths relative to package root, not CWD.
    // Works for monorepo dev, global install, and npx.
    this.schemaPath = resolveSchemaPath();
    this.rulesDir = resolveRulesDir();
  }

  async analyze(params: {
    files: string[];
    mode: string;
    baseline?: string;
    context?: any;
  }): Promise<any> {
    // This would call the actual oracle analyze method
    // For now, return a mock structure
    return {
      decision: 'PASS',
      findings: [],
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0
    };
  }

  async validateL0(params: {
    workflowsDir: string;
    strict: boolean;
  }): Promise<any> {
    return {
      valid: true,
      violations: []
    };
  }

  async checkDrift(params: {
    baseline: Baseline;
    threshold: number;
  }): Promise<DriftResult> {
    const changes: DriftChange[] = [];
    const baselineFiles = params.baseline.files || [];

    // Check each file in the baseline
    for (const entry of baselineFiles) {
      const exists = fileExists(entry.path);

      if (!exists && entry.exists) {
        // File was in baseline but is now missing
        changes.push({
          file: entry.path,
          type: 'removed',
          oldHash: entry.hash,
        });
      } else if (exists && entry.exists && entry.hash) {
        // File exists in both — compare hashes
        const currentHash = await computeFileHash(entry.path);
        if (currentHash && currentHash !== entry.hash) {
          changes.push({
            file: entry.path,
            type: 'modified',
            oldHash: entry.hash,
            newHash: currentHash,
          });
        }
      } else if (exists && !entry.exists) {
        // File did not exist in baseline but exists now
        const currentHash = await computeFileHash(entry.path);
        changes.push({
          file: entry.path,
          type: 'added',
          newHash: currentHash,
        });
      }
    }

    // magnitude = proportion of tracked files that changed
    const trackedCount = baselineFiles.length || 1;
    const magnitude = changes.length / trackedCount;
    const driftDetected = magnitude > params.threshold;

    return { driftDetected, magnitude, changes };
  }

  async generateBaseline(): Promise<any> {
    return {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      files: []
    };
  }

  async markFalsePositive(params: {
    findingId: string;
    reason: string;
    createPattern: boolean;
  }): Promise<void> {
    // Mark finding as false positive
  }

  async listFalsePositives(params: {
    ruleId?: string;
  }): Promise<any[]> {
    return [];
  }

  async exportFalsePositives(params: {
    anonymize: boolean;
  }): Promise<any> {
    return {
      count: 0,
      patterns: []
    };
  }

  async importFalsePositives(data: any): Promise<void> {
    // Import FP patterns
  }

  private getDefaultConfig(): Config {
    return {
      version: '1',
      rules: {
        enabled: ['MD-001', 'MD-002', 'MD-003', 'MD-004', 'MD-005']
      },
      l0_invariants: {
        enabled: true,
        strict: false
      },
      drift: {
        enabled: true,
        threshold: 0.15
      }
    };
  }
}
