/**
 * Mirror Dissonance Core Library
 * 
 * Main export file for the Phase Mirror governance library
 */

// Core Oracle
export { Oracle } from "./oracle.js";

// ADR Compliance
export {
  ADRParser,
  parseADRs,
  ADRComplianceValidator,
  ADRValidator,
  ADRMatcher,
  createADRParser,
  createADRMatcher,
  createADRValidator,
} from "./adr/index.js";

export type {
  ParsedADR,
  DecisionRule,
  ADRViolation,
  ADRComplianceReport,
  ADRComplianceResult,
  FilePattern,
} from "./adr/index.js";

// FP Store
export {
  createFPStore,
  DynamoDBFPStore,
  NoOpFPStore,
} from "./fp-store/store.js";

export type {
  IFPStore,
  FPStoreConfig,
} from "./fp-store/store.js";

// Re-export commonly used types
export type { FalsePositiveEvent } from "../schemas/types.js";
