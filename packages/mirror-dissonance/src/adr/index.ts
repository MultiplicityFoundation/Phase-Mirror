/**
 * ADR (Architecture Decision Record) module
 * 
 * This module provides functionality for parsing, matching, and validating
 * code against Architecture Decision Records.
 */

import { ADRParser as ADRParserClass } from "./parser.js";

// Export classes and functions
export { ADRParser, createADRParser } from "./parser.js";
export { ADRMatcher, createADRMatcher } from "./matcher.js";
export { ADRValidator, createADRValidator } from "./validator.js";

// Export types
export type {
  ParsedADR,
  DecisionRule,
  ADRViolation,
  ADRComplianceResult,
  FilePattern,
} from "./types.js";

// Convenience: Export parseADRs as an alias
export async function parseADRs(adrPath: string) {
  const parser = new ADRParserClass();
  return parser.parseADRDirectory(adrPath);
}

// For backward compatibility, also export with ADRComplianceValidator alias
export { ADRValidator as ADRComplianceValidator } from "./validator.js";

// Export report type with alias
export type { ADRComplianceResult as ADRComplianceReport } from "./types.js";
