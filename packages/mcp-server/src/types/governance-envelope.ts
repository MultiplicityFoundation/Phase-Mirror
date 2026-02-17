/**
 * Governance Envelope Types
 *
 * Defines the canonical response shape for all MCP tools.
 * Every tool response is normalized into this envelope before
 * being returned to the caller.
 */

export type GovernanceTier = "authoritative" | "experimental";
export type GovernanceEnvironment = "local" | "cloud";
export type GovernanceDecision = "block" | "warn" | "pass";

export interface MCPGovernanceEnvelope {
  // Core protocol
  success: boolean;
  code?: string;
  message?: string;
  isError?: boolean;

  // Governance semantics
  tier: GovernanceTier;
  environment: GovernanceEnvironment;
  decision?: GovernanceDecision;
  degradedMode?: boolean;

  // UI hints — rendered as badges / chips in client surfaces
  tierBadge: string;       // e.g. "🔒 Authoritative" or "🧪 Experimental"
  environmentBadge: string; // e.g. "☁️ Cloud (binding)" or "💻 Local (degraded)"
  decisionBadge?: string;   // e.g. "🛑 Block", "⚠️ Warn", "✅ Pass"

  // Traceability
  requestId: string;
  timestamp: string;

  // Tool-specific payload
  data?: unknown;
}
