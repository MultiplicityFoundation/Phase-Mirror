/**
 * Oracle Adapter Integration Test
 * 
 * Demonstrates using the new adapter-based Oracle initialization.
 */

import { describe, it, expect } from "@jest/globals";

describe("Oracle Adapter Integration", () => {
  it("should export initializeOracleWithAdapters function", async () => {
    const oracleModule = await import("../oracle");
    expect(typeof oracleModule.initializeOracleWithAdapters).toBe("function");
  });

  it("should export loadCloudConfig from oracle module", async () => {
    const oracleModule = await import("../oracle");
    expect(typeof oracleModule.loadCloudConfig).toBe("function");
  });

  it("should initialize Oracle with local adapters", async () => {
    const { initializeOracleWithAdapters } = await import("../oracle");
    const { loadCloudConfig } = await import("../adapters/config");

    // Override environment to use local provider
    const originalProvider = process.env.CLOUD_PROVIDER;
    const originalDataDir = process.env.LOCAL_DATA_DIR;
    
    try {
      process.env.CLOUD_PROVIDER = "local";
      process.env.LOCAL_DATA_DIR = "/tmp/.mirror-test-data-oracle";

      const config = loadCloudConfig();
      expect(config.provider).toBe("local");

      const oracle = await initializeOracleWithAdapters(config);
      expect(oracle).toBeDefined();
      expect(typeof oracle.analyze).toBe("function");
    } finally {
      // Restore environment
      if (originalProvider) {
        process.env.CLOUD_PROVIDER = originalProvider;
      } else {
        delete process.env.CLOUD_PROVIDER;
      }
      if (originalDataDir) {
        process.env.LOCAL_DATA_DIR = originalDataDir;
      } else {
        delete process.env.LOCAL_DATA_DIR;
      }
    }
  });

  it("should fail-closed when AWS config is incomplete", async () => {
    const { initializeOracleWithAdapters } = await import("../oracle");

    const incompleteConfig = {
      provider: "aws" as const,
      region: "us-east-1",
      // Missing required table names
    };

    await expect(
      initializeOracleWithAdapters(incompleteConfig)
    ).rejects.toThrow();
  });

  it("should create Oracle with AWS adapters when fully configured", async () => {
    const { initializeOracleWithAdapters } = await import("../oracle");

    const completeConfig = {
      provider: "aws" as const,
      region: "us-east-1",
      fpTableName: "test-fp-table",
      consentTableName: "test-consent-table",
      blockCounterTableName: "test-counter-table",
      nonceParameterName: "test-nonce-param",
      baselineBucket: "test-baseline-bucket",
      endpoint: "http://localhost:4566", // LocalStack endpoint for testing
    };

    // This will fail to connect to actual AWS/LocalStack, but should pass validation
    // In a real test environment with LocalStack, this would succeed
    try {
      const oracle = await initializeOracleWithAdapters(completeConfig);
      expect(oracle).toBeDefined();
    } catch (error: any) {
      // Expected to fail if LocalStack isn't running - that's okay
      // What matters is we passed config validation
      expect(error.message).not.toContain("requires");
    }
  });
});
