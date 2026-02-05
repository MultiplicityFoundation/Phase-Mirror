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

// FP Store - export from fp-store/index which has all the exports
export {
  createFPStore,
  NoOpFPStore,
  FPStoreQuery,
  createFPStoreQuery,
  LegacyDynamoDBFPStore as DynamoDBFPStore,
} from "./fp-store/index.js";

export type {
  IFPStore,
  LegacyFPStoreConfig as FPStoreConfig,
  FPRateResult,
  FPPattern,
  FPTrendPoint,
} from "./fp-store/index.js";

// Consent Store
export {
  createConsentStore,
  DynamoDBConsentStore,
  NoOpConsentStore,
} from "./consent-store/index.js";

export type {
  IConsentStore,
  ConsentStoreConfig,
} from "./consent-store/index.js";

// Re-export commonly used types
export type { FalsePositiveEvent } from "../schemas/types.js";

// Calibration Store
export {
  createCalibrationStore,
  DynamoDBCalibrationStore,
  NoOpCalibrationStore,
  ByzantineCalibrationStore as CalibrationStore,
  InMemoryCalibrationStoreAdapter,
  NoOpCalibrationStoreAdapter,
} from "./calibration-store/index.js";

export type {
  ICalibrationStore,
  ICalibrationStoreAdapter,
  CalibrationResultExtended,
} from "./calibration-store/index.js";

// Trust Module
export {
  NonceBindingService,
  ReputationEngine,
  createLocalTrustAdapters,
} from "./trust/index.js";

export type {
  NonceBinding,
  OrganizationReputation,
  ContributionWeight,
} from "./trust/index.js";

