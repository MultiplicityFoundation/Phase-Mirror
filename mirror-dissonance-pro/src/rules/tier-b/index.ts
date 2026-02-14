/**
 * Tier B Rule Registry
 *
 * Proprietary semantic analysis rules (MD-100+).
 * All rules implement the RuleDefinition interface from the OSS core.
 */

import { md100 } from './md-100.js';
import { md101 } from './md-101.js';
import { md102 } from './md-102.js';

export interface RuleDefinition {
  id: string;
  name: string;
  tier: 'A' | 'B';
  severity: 'block' | 'warn' | 'pass';
  version: string;
  evaluate: (context: AnalysisContext) => Promise<Finding[]>;
}

export interface AnalysisContext {
  repositoryName: string;
  owner?: string;
  commitSha?: string;
  branch?: string;
  workflows?: WorkflowFile[];
  protectionRules?: BranchProtection[];
  runnerGroups?: RunnerGroup[];
  repoGraph?: RepoDependencyEdge[];
}

export interface WorkflowFile {
  path: string;
  name: string;
  content: string;
  jobs: WorkflowJob[];
}

export interface WorkflowJob {
  id: string;
  name: string;
  steps: WorkflowStep[];
  runsOn?: string | string[];
  uses?: string;
}

export interface WorkflowStep {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
}

export interface BranchProtection {
  branch: string;
  requiredChecks: string[];
  enforceAdmins: boolean;
}

export interface RunnerGroup {
  id: string;
  name: string;
  labels: string[];
  isHosted: boolean;
  restrictedTo?: string[];
  attestationEnabled?: boolean;
  verificationSteps?: string[];
}

export interface RepoDependencyEdge {
  sourceRepo: string;
  targetRepo: string;
  triggerType: 'repository_dispatch' | 'workflow_call' | 'workflow_run' | 'submodule';
  protectionLevel?: 'none' | 'partial' | 'full';
}

export interface Finding {
  ruleId: string;
  title: string;
  severity: 'block' | 'warn' | 'pass';
  filePath?: string;
  lineRange?: { start: number; end: number };
  evidence: string;
  metadata?: Record<string, unknown>;
}

export const tierBRules: RuleDefinition[] = [md100, md101, md102];
export { md100 } from './md-100.js';
export { md101 } from './md-101.js';
export { md102 } from './md-102.js';
