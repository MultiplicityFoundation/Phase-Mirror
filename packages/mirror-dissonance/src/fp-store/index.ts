// Legacy exports from store.ts (Phase 1)
export { IFPStore, NoOpFPStore, createFPStore, FPStoreConfig as LegacyFPStoreConfig } from './store.js';

// Enhanced exports for Phase 2 FP Calibration Service
export { FPEvent, FPWindow, FPStoreConfig, FPStore } from './types.js';
export { FPStoreError } from './dynamodb-store.js';

// FP Store Query exports
export {
  FPStoreQuery,
  createFPStoreQuery,
  FPRateResult,
  FPPattern,
  FPTrendPoint,
} from './query.js';

// Nonce Validation exports
export {
  FPStoreWithNonceValidation,
  createFPStoreWithNonceValidation,
  FPSubmissionWithNonce,
  NonceValidationError,
} from './nonce-validation.js';
