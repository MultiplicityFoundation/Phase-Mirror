/**
 * AWS Adapter Blueprint Tests
 * 
 * Validates that the AWS adapter implementation matches the blueprint specification.
 */

import { describe, it, expect } from "@jest/globals";
import type { FPStoreAdapter, ConsentStoreAdapter, BlockCounterAdapter, SecretStoreAdapter, BaselineStoreAdapter } from "../types";

describe("AWS Adapter Blueprint Compliance", () => {
  it("should export FPStoreAdapter interface", () => {
    // Type-only test - if this compiles, the interface exists
    const _typeCheck: FPStoreAdapter | null = null;
    expect(true).toBe(true);
  });

  it("should export ConsentStoreAdapter interface", () => {
    const _typeCheck: ConsentStoreAdapter | null = null;
    expect(true).toBe(true);
  });

  it("should export BlockCounterAdapter interface", () => {
    const _typeCheck: BlockCounterAdapter | null = null;
    expect(true).toBe(true);
  });

  it("should export SecretStoreAdapter interface", () => {
    const _typeCheck: SecretStoreAdapter | null = null;
    expect(true).toBe(true);
  });

  it("should export BaselineStoreAdapter interface", () => {
    const _typeCheck: BaselineStoreAdapter | null = null;
    expect(true).toBe(true);
  });

  it("should have createAWSAdapters factory function", async () => {
    const awsModule = await import("../aws/index");
    expect(typeof awsModule.createAWSAdapters).toBe("function");
  });

  it("should fail-closed when required config is missing", async () => {
    const awsModule = await import("../aws/index");
    const config = {
      provider: "aws" as const,
      region: "us-east-1",
      // Missing required table names - should throw
    };

    await expect(awsModule.createAWSAdapters(config)).rejects.toThrow("FP_TABLE_NAME");
  });

  it("should validate all required AWS configuration", async () => {
    const awsModule = await import("../aws/index");
    
    // Missing FP_TABLE_NAME
    await expect(
      awsModule.createAWSAdapters({
        provider: "aws",
        region: "us-east-1",
      })
    ).rejects.toThrow("FP_TABLE_NAME");

    // Missing CONSENT_TABLE_NAME
    await expect(
      awsModule.createAWSAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
      })
    ).rejects.toThrow("CONSENT_TABLE_NAME");

    // Missing BLOCK_COUNTER_TABLE_NAME
    await expect(
      awsModule.createAWSAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
        consentTableName: "test-consent",
      })
    ).rejects.toThrow("BLOCK_COUNTER_TABLE_NAME");

    // Missing NONCE_PARAMETER_NAME
    await expect(
      awsModule.createAWSAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
        consentTableName: "test-consent",
        blockCounterTableName: "test-counter",
      })
    ).rejects.toThrow("NONCE_PARAMETER_NAME");
  });
});
