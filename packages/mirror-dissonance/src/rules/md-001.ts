/**
 * MD-001: Branch Protection Validation
 * Ensures branch protection contexts match workflow job names
 */
import { RuleViolation, OracleInput } from '../schemas/types.js';

export interface BranchProtectionConfig {
  requiredContexts: string[];
  workflowJobs: string[];
}

export async function checkMD001(input: OracleInput): Promise<RuleViolation[]> {
  const violations: RuleViolation[] = [];

  // This would normally check GitHub API for branch protection settings
  // For now, we'll provide a stub implementation
  
  // Example: Check if required contexts are defined
  const expectedContexts = [
    'ci/oracle-check',
    'ci/build',
    'ci/test',
  ];

  // In a real implementation, we would:
  // 1. Fetch branch protection rules via GitHub API
  // 2. Validate that required status checks match workflow job names
  // 3. Report any mismatches

  // Placeholder validation
  if (input.mode === 'merge_group' && !input.strict) {
    violations.push({
      ruleId: 'MD-001',
      severity: 'high',
      message: 'Branch protection should be enabled with strict mode for merge queue',
      context: { mode: input.mode, strict: input.strict || false },
    });
  }

  return violations;
}
