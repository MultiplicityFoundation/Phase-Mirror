/**
 * Calibration Store Adapter Types
 * 
 * Interfaces for persisting calibration results.
 */

import { CalibrationResultExtended } from '../trust/reputation/types.js';

/**
 * Adapter interface for storing calibration results.
 */
export interface ICalibrationStoreAdapter {
  /**
   * Store a calibration result.
   */
  storeCalibrationResult(result: CalibrationResultExtended): Promise<void>;
  
  /**
   * Get a stored calibration result.
   */
  getCalibrationResult(ruleId: string): Promise<CalibrationResultExtended | null>;
  
  /**
   * Get all stored calibration results.
   */
  getAllCalibrationResults(): Promise<CalibrationResultExtended[]>;
}

/**
 * No-op adapter for testing or when persistence is not needed.
 */
export class NoOpCalibrationStoreAdapter implements ICalibrationStoreAdapter {
  async storeCalibrationResult(result: CalibrationResultExtended): Promise<void> {
    // No-op
  }
  
  async getCalibrationResult(ruleId: string): Promise<CalibrationResultExtended | null> {
    return null;
  }
  
  async getAllCalibrationResults(): Promise<CalibrationResultExtended[]> {
    return [];
  }
}

/**
 * In-memory adapter for testing.
 */
export class InMemoryCalibrationStoreAdapter implements ICalibrationStoreAdapter {
  private results: Map<string, CalibrationResultExtended> = new Map();
  
  async storeCalibrationResult(result: CalibrationResultExtended): Promise<void> {
    this.results.set(result.ruleId, result);
  }
  
  async getCalibrationResult(ruleId: string): Promise<CalibrationResultExtended | null> {
    return this.results.get(ruleId) || null;
  }
  
  async getAllCalibrationResults(): Promise<CalibrationResultExtended[]> {
    return Array.from(this.results.values());
  }
  
  clear(): void {
    this.results.clear();
  }
}
