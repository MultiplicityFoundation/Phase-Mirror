/**
 * Type definitions for Phase Mirror CLI
 */

export interface Config {
  version: string;
  rules?: {
    enabled?: string[];
    severity?: Record<string, string>;
  };
  l0_invariants?: {
    enabled: boolean;
    strict: boolean;
  };
  drift?: {
    enabled: boolean;
    threshold?: number;
  };
  fail_on?: string;
  circuit_breaker?: {
    enabled: boolean;
    max_execution_time_ms: number;
  };
  false_positives?: {
    enabled: boolean;
    storage: string;
  };
}

export interface AnalyzeOptions {
  mode: string;
  strict: boolean;
  dryRun: boolean;
  baseline?: string;
  output?: string;
  format?: string;
  config?: string;
}

export interface ValidateOptions {
  workflowsDir: string;
  strict: boolean;
  output?: string;
  format?: string;
}

export interface DriftOptions {
  baseline: string;
  threshold?: number;
  output?: string;
  format?: string;
}

export interface FPMarkOptions {
  reason: string;
  pattern: boolean;
}

export interface FPListOptions {
  rule?: string;
  output: string;
}

export interface FPExportOptions {
  output: string;
}

export interface InitOptions {
  template?: string;
  force: boolean;
}

export interface GitContext {
  repositoryName?: string;
  prNumber?: number;
  commitSha?: string;
  branch?: string;
  author?: string;
}
