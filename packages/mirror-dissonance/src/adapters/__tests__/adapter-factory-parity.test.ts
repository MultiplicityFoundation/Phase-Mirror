/**
 * Adapter Parity Tests - Day 10
 * 
 * Validates that local and AWS adapters have identical behavior.
 * Tests the adapter factory and ensures proper fail-closed behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { createAdapters } from "../factory";
import type { Adapters } from "../types";
import { randomUUID } from "crypto";
import { rmSync } from "fs";

describe("Adapter parity: local", () => {
  let adapters: Adapters;
  const testDir = ".mirror-data-test-" + Date.now();

  beforeAll(async () => {
    adapters = await createAdapters({
      provider: "local",
      region: "us-east-1",
      localDataDir: testDir,
    });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reports provider as local", () => {
    expect(adapters.provider).toBe("local");
  });

  it("fp store: record and retrieve events", async () => {
    const event = {
      eventId: randomUUID(),
      ruleId: "MD-001",
      ruleVersion: "1.0.0",
      findingId: `finding-${randomUUID()}`,
      outcome: "block" as const,
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: "test-repo",
        branch: "main",
        eventType: "pull_request" as const,
      },
    };

    await adapters.fpStore.recordEvent(event);
    const window = await adapters.fpStore.getWindowByCount("MD-001", 50);
    expect(window.events.length).toBeGreaterThanOrEqual(1);
    expect(window.statistics.observedFPR).toBe(0);
  });

  it("fp store: rejects duplicate events", async () => {
    const event = {
      eventId: "dup-test-id",
      ruleId: "MD-002",
      ruleVersion: "1.0.0",
      findingId: "dup-finding",
      outcome: "warn" as const,
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: "test",
        branch: "main",
        eventType: "pull_request" as const,
      },
    };

    await adapters.fpStore.recordEvent(event);
    await expect(adapters.fpStore.recordEvent(event)).rejects.toThrow();
  });

  it("consent store: grant, check, revoke cycle", async () => {
    const orgId = `test-org-${randomUUID()}`;

    await adapters.consentStore.grantConsent(
      orgId,
      "fp_patterns",
      "test-user",
      undefined
    );

    expect(await adapters.consentStore.hasConsent(orgId, "fp_patterns")).toBe(true);

    await adapters.consentStore.revokeConsent(orgId, "fp_patterns", "admin");
    expect(await adapters.consentStore.hasConsent(orgId, "fp_patterns")).toBe(false);
  });

  it("block counter: increment and get", async () => {
    const key = `test-key-${Date.now()}`;
    const count1 = await adapters.blockCounter.increment(key, 3600);
    expect(count1).toBe(1);
    const count2 = await adapters.blockCounter.increment(key, 3600);
    expect(count2).toBe(2);
    expect(await adapters.blockCounter.get(key)).toBe(2);
  });

  it("secret store: auto-generates dev nonce", async () => {
    const nonce = await adapters.secretStore.getNonce("any-param");
    expect(nonce).toBeTruthy();
    expect(nonce.length).toBe(64); // 32 bytes hex
  });

  it("secret store: is always reachable locally", async () => {
    expect(await adapters.secretStore.isReachable()).toBe(true);
  });

  it("baseline store: put and get", async () => {
    await adapters.baselineStore.putBaseline("test-baseline", '{"version": 1}');
    const content = await adapters.baselineStore.getBaseline("test-baseline");
    expect(JSON.parse(content!)).toEqual({ version: 1 });
  });

  it("baseline store: returns null for missing baseline", async () => {
    const result = await adapters.baselineStore.getBaseline("nonexistent-" + randomUUID());
    expect(result).toBeNull();
  });

  it("fp store: markFalsePositive updates record", async () => {
    const findingId = `finding-fp-${randomUUID()}`;
    const event = {
      eventId: randomUUID(),
      ruleId: "MD-003",
      ruleVersion: "1.0.0",
      findingId,
      outcome: "block" as const,
      isFalsePositive: false,
      timestamp: new Date(),
      context: {
        repo: "test",
        branch: "main",
        eventType: "pull_request" as const,
      },
    };

    await adapters.fpStore.recordEvent(event);
    expect(await adapters.fpStore.isFalsePositive(findingId)).toBe(false);

    await adapters.fpStore.markFalsePositive(findingId, "reviewer", "TICKET-123");
    expect(await adapters.fpStore.isFalsePositive(findingId)).toBe(true);
  });
});

describe("Factory: invalid provider", () => {
  it("throws on unknown provider", async () => {
    await expect(
      createAdapters({ provider: "azure" as any, region: "us-east-1" })
    ).rejects.toThrow(/provider/i);
  });
});

describe("Factory: AWS without required config", () => {
  it("throws when FP_TABLE_NAME missing", async () => {
    await expect(
      createAdapters({ provider: "aws", region: "us-east-1" })
    ).rejects.toThrow(/FP_TABLE_NAME/);
  });

  it("throws when CONSENT_TABLE_NAME missing", async () => {
    await expect(
      createAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
      })
    ).rejects.toThrow(/CONSENT_TABLE_NAME/);
  });

  it("throws when BLOCK_COUNTER_TABLE_NAME missing", async () => {
    await expect(
      createAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
        consentTableName: "test-consent",
      })
    ).rejects.toThrow(/BLOCK_COUNTER_TABLE_NAME/);
  });

  it("throws when NONCE_PARAMETER_NAME missing", async () => {
    await expect(
      createAdapters({
        provider: "aws",
        region: "us-east-1",
        fpTableName: "test-fp",
        consentTableName: "test-consent",
        blockCounterTableName: "test-counter",
      })
    ).rejects.toThrow(/NONCE_PARAMETER_NAME/);
  });
});

describe("Adapter interface consistency", () => {
  let adapters: Adapters;
  const testDir = ".mirror-data-test-interface-" + Date.now();

  beforeAll(async () => {
    adapters = await createAdapters({
      provider: "local",
      region: "us-east-1",
      localDataDir: testDir,
    });
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("fpStore has all required methods", () => {
    expect(typeof adapters.fpStore.recordEvent).toBe("function");
    expect(typeof adapters.fpStore.markFalsePositive).toBe("function");
    expect(typeof adapters.fpStore.getWindowByCount).toBe("function");
    expect(typeof adapters.fpStore.getWindowBySince).toBe("function");
    expect(typeof adapters.fpStore.isFalsePositive).toBe("function");
  });

  it("consentStore has all required methods", () => {
    expect(typeof adapters.consentStore.grantConsent).toBe("function");
    expect(typeof adapters.consentStore.revokeConsent).toBe("function");
    expect(typeof adapters.consentStore.hasConsent).toBe("function");
    expect(typeof adapters.consentStore.getConsent).toBe("function");
  });

  it("blockCounter has all required methods", () => {
    expect(typeof adapters.blockCounter.increment).toBe("function");
    expect(typeof adapters.blockCounter.get).toBe("function");
  });

  it("secretStore has all required methods", () => {
    expect(typeof adapters.secretStore.getNonce).toBe("function");
    expect(typeof adapters.secretStore.getNonceWithVersion).toBe("function");
    expect(typeof adapters.secretStore.isReachable).toBe("function");
  });

  it("baselineStore has all required methods", () => {
    expect(typeof adapters.baselineStore.getBaseline).toBe("function");
    expect(typeof adapters.baselineStore.putBaseline).toBe("function");
  });
});
