/**
 * Contract test: Governance floor prevents experimental tools
 * from surfacing L0 blocking decisions.
 */
import { describe, it, expect } from "@jest/globals";
import { normalizeResponse } from "../src/utils/normalize-response.js";
import type { NormalizeContext } from "../src/utils/normalize-response.js";
import type { MCPGovernanceEnvelope } from "../src/types/governance-envelope.js";
import * as dummyExperimentalTool from "../src/tools/dummy-experimental.js";

const baseConfig = {
  awsRegion: "us-east-1",
  logLevel: "info" as const,
};

const baseContext = {
  config: baseConfig,
  requestId: "contract-test-id",
  timestamp: new Date("2026-02-01T00:00:00Z"),
};

describe("MCP governance floor end-to-end", () => {
  it("prevents experimental tool from surfacing as L0 blocking failure", async () => {
    // Execute the deliberately buggy experimental tool
    const toolResponse = await dummyExperimentalTool.execute({}, {
      ...baseContext,
    });

    // Parse the raw JSON the tool returned
    const firstContent = toolResponse.content[0];
    const rawText = firstContent.type === "text" ? firstContent.text : "";
    const parsed = JSON.parse(rawText);

    // The tool claimed L0 authority — verify it tried
    expect(parsed.code).toBe("INVARIANT_VIOLATION");
    expect(parsed.decision).toBe("block");

    // Now run through the governance normalizer (as the server would)
    const envelope: MCPGovernanceEnvelope = normalizeResponse(parsed, {
      ...baseContext,
      tier: "experimental",
      environment: "cloud",
    } as NormalizeContext);

    // Floor properties enforced
    expect(envelope.tier).toBe("experimental");
    expect(envelope.decision).not.toBe("block");
    expect(envelope.code).not.toBe("INVARIANT_VIOLATION");
    expect(envelope.isError).toBe(false);
    expect(envelope.success).toBe(true);
    expect(envelope.data).toEqual({ some: "payload" });
  });

  it("also clamps experimental tools in local mode", async () => {
    const toolResponse = await dummyExperimentalTool.execute({}, {
      ...baseContext,
    });

    const content = toolResponse.content[0];
    const parsed = JSON.parse(content.type === "text" ? content.text : "");

    const envelope = normalizeResponse(parsed, {
      ...baseContext,
      tier: "experimental",
      environment: "local",
    } as NormalizeContext);

    expect(envelope.tier).toBe("experimental");
    expect(envelope.environment).toBe("local");
    expect(envelope.decision).not.toBe("block");
    expect(envelope.code).not.toBe("INVARIANT_VIOLATION");
  });

  it("dummy tool listing includes experimental tool", () => {
    expect(dummyExperimentalTool.toolDefinition.name).toBe("dummy_experimental");
  });
});
