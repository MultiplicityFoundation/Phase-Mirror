/**
 * MD-002: Compliance and Autonomy Tension Detection
 * Identifies conflicts between agent autonomy and compliance requirements
 */
import { RuleViolation, OracleInput } from '../schemas/types.js';

export async function checkMD002(input: OracleInput): Promise<RuleViolation[]> {
  const violations: RuleViolation[] = [];

  // Check for autonomy-compliance tensions
  // This rule identifies when autonomous agent actions might conflict with compliance

  // Example checks:
  // - Autonomous decisions in regulated contexts
  // - Missing human-in-the-loop for high-risk operations
  // - Insufficient audit trails for compliance

  if (input.mode === 'pull_request') {
    // Check for patterns that indicate autonomy-compliance tension
    // In a real implementation, this would analyze PR content, code changes, etc.
    
    // Placeholder: warn about autonomous operations
    const hasAutonomousOperations = input.context.branch?.includes('auto') || 
                                   input.context.branch?.includes('agent');
    
    if (hasAutonomousOperations) {
      violations.push({
        ruleId: 'MD-002',
        severity: 'medium',
        message: 'Autonomous operations detected - ensure compliance review process is followed',
        context: { 
          branch: input.context.branch,
          requiresReview: true,
        },
      });
    }
  }

  return violations;
}
