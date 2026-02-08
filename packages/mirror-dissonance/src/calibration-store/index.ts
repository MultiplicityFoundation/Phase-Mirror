/**
 * Calibration Store with k-Anonymity Enforcement and Byzantine Filtering
 *
 * @deprecated The DynamoDBCalibrationStore class has been superseded by the
 *   adapter layer. Use the adapter factory for cloud-backed stores.
 *
 * Cloud-agnostic exports (ICalibrationStore, NoOpCalibrationStore) remain here.
 */
import { CalibrationResult, KAnonymityError } from '../schemas/types.js';

export interface CalibrationStoreConfig {
  tableName: string;
  region?: string;
  kAnonymityThreshold?: number;
}

export interface ICalibrationStore {
  aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError>;
  getRuleFPRate(ruleId: string, startDate?: string, endDate?: string): Promise<CalibrationResult | KAnonymityError>;
  getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError>;
}

export class NoOpCalibrationStore implements ICalibrationStore {
  async aggregateFPsByRule(ruleId: string): Promise<CalibrationResult | KAnonymityError> {
    return {
      error: 'INSUFFICIENT_K_ANONYMITY',
      message: 'NoOp store: No data available',
      requiredK: 10,
      actualK: 0,
    };
  }

  async getRuleFPRate(
    ruleId: string,
    startDate?: string,
    endDate?: string
  ): Promise<CalibrationResult | KAnonymityError> {
    return {
      error: 'INSUFFICIENT_K_ANONYMITY',
      message: 'NoOp store: No data available',
      requiredK: 10,
      actualK: 0,
    };
  }

  async getAllRuleFPRates(): Promise<CalibrationResult[] | KAnonymityError> {
    return [];
  }
}

/**
 * @deprecated Use the adapter factory (`createAdapters`) for cloud-backed stores.
 * This function now only returns a NoOpCalibrationStore.
 */
export function createCalibrationStore(config?: CalibrationStoreConfig): ICalibrationStore {
  return new NoOpCalibrationStore();
}

// New Byzantine filtering implementation
export {
  CalibrationStore as ByzantineCalibrationStore,
  ICalibrationStore as IByzantineCalibrationStore,
} from './calibration-store.js';

export {
  ICalibrationStoreAdapter,
  NoOpCalibrationStoreAdapter,
  InMemoryCalibrationStoreAdapter,
} from './adapter-types.js';

// Export types
export type {
  CalibrationResultExtended,
  CalibrationConfidence,
  ByzantineFilterSummary,
} from '../trust/reputation/types.js';
