/**
 * ADR (Architecture Decision Record) types and interfaces
 */

/**
 * Parsed ADR structure
 */
export interface ParsedADR {
  id: string; // "ADR-001"
  title: string;
  filePath: string;
  status: "approved" | "proposed" | "deprecated" | "superseded";
  date: string;
  tags: string[];
  context: string;
  decision: string;
  decisionRules: DecisionRule[];
  consequences: string;
  complianceChecks: string;
  relatedRules: string[]; // ["MD-001", "MD-002"]
  relatedADRs: string[]; // ["ADR-002"]
}

/**
 * Specific rule extracted from ADR decision section
 */
export interface DecisionRule {
  id: string; // "ADR-001-R1"
  text: string;
  type: "MUST" | "MUST_NOT" | "SHALL" | "SHALL_NOT" | "SHOULD" | "MAY";
  pattern?: RegExp; // For automated checking
}

/**
 * ADR violation detected during compliance check
 */
export interface ADRViolation {
  adrId: string;
  ruleId: string;
  file: string;
  line?: number;
  message: string;
  severity: "high" | "medium" | "low";
  remediation?: string;
}

/**
 * ADR compliance check result
 */
export interface ADRComplianceResult {
  compliant: boolean;
  adrsChecked: string[];
  violations: ADRViolation[];
  suggestions: string[];
  timestamp: string;
}

/**
 * File pattern for matching ADRs
 */
export interface FilePattern {
  pattern: RegExp;
  adrIds: string[];
  description: string;
}
