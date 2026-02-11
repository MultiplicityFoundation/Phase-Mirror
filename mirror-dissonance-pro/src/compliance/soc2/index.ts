/**
 * SOC2 Starter Compliance Pack
 *
 * Pre-built rule bundle for SOC2 Type II audit readiness.
 * Maps Phase Mirror findings to SOC2 Trust Service Criteria.
 */

import type { RuleDefinition } from '../../rules/tier-b/index.js';

export interface CompliancePack {
  id: string;
  name: string;
  version: string;
  framework: string;
  description: string;
  rules: RuleDefinition[];
  mappings: ComplianceMapping[];
}

export interface ComplianceMapping {
  ruleId: string;
  controlId: string;
  controlName: string;
  description: string;
}

/**
 * SOC2 Trust Service Criteria mappings for Phase Mirror rules.
 *
 * CC6.1 — Logical and physical access controls
 * CC7.1 — System monitoring
 * CC8.1 — Change management
 */
export const soc2Mappings: ComplianceMapping[] = [
  {
    ruleId: 'MD-001',
    controlId: 'CC8.1',
    controlName: 'Change Management',
    description: 'Branch protection validates change-control gates exist for code merges',
  },
  {
    ruleId: 'MD-100',
    controlId: 'CC8.1',
    controlName: 'Change Management',
    description: 'Semantic job drift detects undocumented CI/CD pipeline changes',
  },
  {
    ruleId: 'MD-101',
    controlId: 'CC7.1',
    controlName: 'System Monitoring',
    description: 'Cross-repo protection gaps identify unmonitored dependency chains',
  },
  {
    ruleId: 'MD-102',
    controlId: 'CC6.1',
    controlName: 'Logical Access Controls',
    description: 'Runner trust chain validates compute environment attestation',
  },
];

export const soc2Pack: CompliancePack = {
  id: 'soc2-starter',
  name: 'SOC2 Starter Pack',
  version: '1.0.0',
  framework: 'SOC2 Type II',
  description: 'Maps Phase Mirror dissonance findings to SOC2 Trust Service Criteria for audit readiness',
  rules: [], // Populated at runtime from rule registry
  mappings: soc2Mappings,
};
