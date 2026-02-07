/**
 * Analysis Orchestrator - Reusable analysis coordination layer
 * 
 * This module provides a reusable orchestrator that wraps Phase Mirror's
 * Oracle logic for use by CLI, MCP server, and other integrations.
 * 
 * Key features:
 * - File artifact processing (read, categorize, hash)
 * - Component initialization via adapter factory (Oracle, FP store, consent store, block counter)
 * - ADR reference extraction (future enhancement)
 * - Reusable by multiple interfaces
 */

import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { Oracle } from '../oracle.js';
import { createAdapters, loadCloudConfig } from '../adapters/index.js';
import type { CloudAdapters } from '../adapters/types.js';
import { OracleInput, OracleOutput } from '../../schemas/types.js';

/**
 * Configuration for analysis orchestrator
 */
export interface AnalysisOrchestratorConfig {
  /** AWS region for DynamoDB/SSM (optional) */
  awsRegion?: string;
  /** DynamoDB table name for FP store (optional) */
  fpTableName?: string;
  /** DynamoDB table name for consent store (optional) */
  consentTableName?: string;
  /** DynamoDB table name for block counter (optional) */
  blockCounterTableName?: string;
  /** SSM parameter name for nonce (optional) */
  nonceParameterName?: string;
  /** Path to ADRs directory (optional, for future use) */
  adrPath?: string;
}

/**
 * File artifact metadata
 */
export interface FileArtifact {
  /** File path relative to repository root */
  path: string;
  /** File content */
  content: string;
  /** SHA-256 hash of content */
  hash: string;
  /** Detected file type */
  type: 'workflow' | 'config' | 'source';
}

/**
 * Repository context for analysis
 */
export interface RepositoryContext {
  /** Repository owner */
  owner: string;
  /** Repository name */
  name: string;
  /** Branch name (optional) */
  branch?: string;
}

/**
 * Input for analysis
 */
export interface AnalysisInput {
  /** File paths to analyze (absolute or relative) */
  files: string[];
  /** Repository context */
  repository: RepositoryContext;
  /** Analysis mode */
  mode: 'pull_request' | 'merge_group' | 'drift' | 'calibration';
  /** Optional context (issue description, PR body, etc.) */
  context?: string;
  /** Optional commit SHA */
  commitSha?: string;
  /** Optional PR number */
  prNumber?: number;
  /** Optional author */
  author?: string;
  /** Enable strict mode */
  strict?: boolean;
  /** Dry run (warn-only) */
  dryRun?: boolean;
  /** Baseline file for drift detection */
  baselineFile?: string;
}

/**
 * Enhanced output with artifact information
 */
export interface AnalysisOutput extends OracleOutput {
  /** Processed file artifacts */
  artifacts: FileArtifact[];
  /** ADR references (future enhancement) */
  adrReferences?: Array<{
    id: string;
    title: string;
    relevantRules: string[];
  }>;
}

/**
 * Analysis orchestrator - coordinates all Phase Mirror components
 * Reusable by CLI, MCP server, and other integrations
 */
export class AnalysisOrchestrator {
  private oracle!: Oracle;
  private adapters!: CloudAdapters;
  private config: AnalysisOrchestratorConfig;
  private initialized: boolean = false;

  constructor(config: AnalysisOrchestratorConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize all components via adapter factory
   * Must be called before analyze()
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Initialize adapters via factory (provider-agnostic)
    const cloudConfig = loadCloudConfig();
    this.adapters = await createAdapters(cloudConfig);

    // Initialize Oracle with adapter-backed components
    this.oracle = new Oracle({
      fpStore: this.adapters.fpStore,
      consentStore: this.adapters.consentStore,
      blockCounter: this.adapters.blockCounter,
      secretStore: this.adapters.secretStore,
    });

    this.initialized = true;
  }

  /**
   * Run analysis on provided files
   * 
   * @param input Analysis input with files and context
   * @returns Enhanced analysis output with artifacts
   */
  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    if (!this.initialized) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    // Build artifacts from file paths
    const artifacts = await this.buildArtifacts(input.files);

    // Create Oracle input from analysis input
    const oracleInput: OracleInput = {
      mode: input.mode,
      strict: input.strict,
      dryRun: input.dryRun,
      baselineFile: input.baselineFile,
      context: {
        repositoryName: `${input.repository.owner}/${input.repository.name}`,
        prNumber: input.prNumber,
        commitSha: input.commitSha,
        branch: input.repository.branch,
        author: input.author,
      },
    };

    // Execute Oracle evaluation
    const oracleOutput = await this.oracle.analyze(oracleInput);

    // Build enhanced output
    const output: AnalysisOutput = {
      ...oracleOutput,
      artifacts,
    };

    // Extract ADR references if configured (future enhancement)
    if (this.config.adrPath) {
      output.adrReferences = await this.extractADRReferences(
        oracleOutput.violations.map(v => v.ruleId)
      );
    }

    return output;
  }

  /**
   * Build file artifacts from file paths
   * Reads files, detects types, and hashes content
   * 
   * @param filePaths Array of file paths (absolute or relative)
   * @returns Array of file artifacts
   */
  private async buildArtifacts(filePaths: string[]): Promise<FileArtifact[]> {
    const artifacts: FileArtifact[] = [];

    for (const filePath of filePaths) {
      try {
        // Resolve to absolute path
        const absolutePath = resolve(filePath);
        
        // Read file content
        const content = await readFile(absolutePath, 'utf-8');
        
        // Detect file type
        const type = this.detectFileType(filePath);
        
        // Hash content
        const hash = this.hashContent(content);

        artifacts.push({
          path: filePath,
          content,
          hash,
          type,
        });
      } catch (error) {
        console.warn(`Failed to read file ${filePath}:`, error);
        // Continue processing other files
      }
    }

    return artifacts;
  }

  /**
   * Detect file type from path
   * 
   * @param filePath File path to analyze
   * @returns Detected file type
   */
  private detectFileType(filePath: string): 'workflow' | 'config' | 'source' {
    // GitHub Actions workflows
    if (filePath.includes('.github/workflows/')) {
      return 'workflow';
    }

    // Configuration files
    if (
      filePath.endsWith('.json') ||
      filePath.endsWith('.yaml') ||
      filePath.endsWith('.yml') ||
      filePath.endsWith('.toml') ||
      filePath.endsWith('.ini') ||
      filePath.endsWith('.conf') ||
      filePath.includes('package.json') ||
      filePath.includes('tsconfig.json') ||
      filePath.includes('Dockerfile')
    ) {
      return 'config';
    }

    // Source code files
    return 'source';
  }

  /**
   * Hash content for fingerprinting
   * Uses SHA-256 for consistent hashing
   * 
   * @param content Content to hash
   * @returns Hex-encoded SHA-256 hash
   */
  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Extract relevant ADR references from rule violations
   * This is a placeholder for future enhancement
   * 
   * @param ruleIds Rule IDs that were violated
   * @returns Array of relevant ADRs
   */
  private async extractADRReferences(
    ruleIds: string[]
  ): Promise<Array<{ id: string; title: string; relevantRules: string[] }>> {
    // Future enhancement: scan ADR directory and match rules
    // For now, return empty array
    return [];
  }

  /**
   * Get initialized status
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

/**
 * Factory function to create and initialize an orchestrator
 * 
 * @param config Orchestrator configuration
 * @returns Initialized orchestrator instance
 */
export async function createOrchestrator(
  config: AnalysisOrchestratorConfig = {}
): Promise<AnalysisOrchestrator> {
  const orchestrator = new AnalysisOrchestrator(config);
  await orchestrator.initialize();
  return orchestrator;
}
