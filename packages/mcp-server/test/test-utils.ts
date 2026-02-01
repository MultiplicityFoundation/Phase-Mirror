import { ToolContext, MCPServerConfig } from "../src/types/index.js";

export function createMockContext(overrides?: Partial<MCPServerConfig>): ToolContext {
  const config: MCPServerConfig = {
    awsRegion: "us-east-1",
    fpTableName: "test-fp-store",
    consentTableName: "test-consent-store",
    nonceParameterName: "test-nonce",
    logLevel: "error", // Suppress logs in tests
    ...overrides,
  };

  return {
    config,
    requestId: "test-request-id",
    timestamp: new Date("2026-02-01T00:00:00Z"),
  };
}

export function createMockDissonanceReport() {
  return {
    machineDecision: {
      outcome: "warn" as const,
      reasons: ["Test reason"],
      metadata: {
        timestamp: new Date("2026-02-01T00:00:00Z").toISOString(),
        mode: "pull_request",
        rulesEvaluated: ["MD-001"],
      },
    },
    violations: [
      {
        ruleId: "MD-001",
        severity: "high" as const,
        message: "Test finding",
        context: {},
      },
    ],
    summary: "Test summary",
    report: {
      rulesChecked: 5,
      violationsFound: 1,
      criticalIssues: 0,
    },
  };
}
