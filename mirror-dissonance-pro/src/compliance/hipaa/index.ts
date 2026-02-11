/**
 * HIPAA Starter Compliance Pack
 *
 * Pre-built rule bundle for HIPAA Security Rule readiness.
 * Maps Phase Mirror findings to HIPAA Administrative/Technical Safeguards.
 */

import type { RuleDefinition } from '../../rules/tier-b/index.js';
import type { CompliancePack, ComplianceMapping } from '../soc2/index.js';

/**
 * HIPAA Security Rule safeguard mappings for Phase Mirror rules.
 *
 * §164.312(a)(1) — Access Control
 * §164.312(c)(1) — Integrity
 * §164.312(d)    — Authentication
 * §164.308(a)(5) — Security Awareness & Training
 */
export const hipaaMappings: ComplianceMapping[] = [
  {
    ruleId: 'MD-001',
    controlId: '§164.312(c)(1)',
    controlName: 'Integrity Controls',
    description: 'Branch protection enforces integrity controls for code change management',
  },
  {
    ruleId: 'MD-100',
    controlId: '§164.308(a)(5)',
    controlName: 'Security Awareness',
    description: 'Semantic job drift detection surfaces undisclosed pipeline mutations',
  },
  {
    ruleId: 'MD-101',
    controlId: '§164.312(a)(1)',
    controlName: 'Access Control',
    description: 'Cross-repo protection gap identifies uncontrolled data-flow paths',
  },
  {
    ruleId: 'MD-102',
    controlId: '§164.312(d)',
    controlName: 'Entity Authentication',
    description: 'Runner trust chain validates compute-environment identity and attestation',
  },
];

export const hipaaPack: CompliancePack = {
  id: 'hipaa-starter',
  name: 'HIPAA Starter Pack',
  version: '1.0.0',
  framework: 'HIPAA Security Rule',
  description: 'Maps Phase Mirror dissonance findings to HIPAA Administrative and Technical Safeguards',
  rules: [], // Populated at runtime from rule registry
  mappings: hipaaMappings,
};
