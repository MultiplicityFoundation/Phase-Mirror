/**
 * Public API for adapter layer
 * 
 * Barrel export for clean imports across the codebase.
 */

export { createAdapters, createDefaultAdapters } from "./factory";
export { loadCloudConfig } from "./config";
export type {
  CloudConfig,
  CloudProvider,
  Adapters,
  FPStoreAdapter,
  ConsentStoreAdapter,
  BlockCounterAdapter,
  SecretStoreAdapter,
  BaselineStoreAdapter,
} from "./types";
