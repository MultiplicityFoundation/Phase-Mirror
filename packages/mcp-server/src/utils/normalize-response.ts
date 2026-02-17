/**
 * Governance Response Normalizer
 *
 * Enforces the governance floor on every MCP tool response:
 *
 * Floor 1 — Experimental tools may never emit binding outcomes:
 *   • decision:"block" → downgraded to "warn"
 *   • L0-only codes (INVARIANT_VIOLATION, CONSENT_REQUIRED) → stripped
 *
 * Floor 2 — Authoritative tools in local mode are always degraded:
 *   • degradedMode = true
 *   • decision:"block" → downgraded to "warn"
 */

import type {
  MCPGovernanceEnvelope,
  GovernanceTier,
  GovernanceEnvironment,
} from "../types/governance-envelope.js";
import type { ToolContext } from "../types/index.js";

type RawToolResult = {
  success: boolean;
  code?: string;
  message?: string;
  isError?: boolean;
  decision?: "block" | "warn" | "pass" | string;
  degradedMode?: boolean;
  data?: unknown;
};

export interface NormalizeContext extends ToolContext {
  tier: GovernanceTier;
  environment: GovernanceEnvironment;
}

const L0_ONLY_CODES = new Set([
  "INVARIANT_VIOLATION",
  "CONSENT_REQUIRED",
]);

export function normalizeResponse(
  raw: RawToolResult,
  context: NormalizeContext,
): MCPGovernanceEnvelope {
  const { tier, environment, requestId, timestamp } = context;

  let { success, code, message, isError, decision, degradedMode, data } = raw;

  let l0CodeStripped = false;
  let blockDowngraded = false;

  // Floor 1: experimental tools can never express binding outcomes
  if (tier === "experimental") {
    if (decision === "block") {
      decision = "warn";
      blockDowngraded = true;
    }
    if (code && L0_ONLY_CODES.has(code)) {
      code = undefined;
      l0CodeStripped = true;
    }

    // Governance clamps should not be treated as hard errors by default
    if ((l0CodeStripped || blockDowngraded) && typeof isError === "undefined") {
      isError = false;
    }
  }

  // Floor 2: authoritative tools in local mode are always degraded + non-blocking
  if (tier === "authoritative" && environment === "local") {
    degradedMode = true;
    if (decision === "block") {
      decision = "warn";
    }
    if (typeof isError === "undefined") {
      isError = false;
    }
  }

  const finalDecision = (decision as MCPGovernanceEnvelope["decision"]) ?? undefined;

  // Compute UI badges
  const tierBadge = tier === "authoritative" ? "🔒 Authoritative" : "🧪 Experimental";
  const environmentBadge = environment === "cloud"
    ? "☁️ Cloud (binding)"
    : "💻 Local (degraded)";
  const decisionBadge = finalDecision === "block"
    ? "🛑 Block"
    : finalDecision === "warn"
      ? "⚠️ Warn"
      : finalDecision === "pass"
        ? "✅ Pass"
        : undefined;

  const envelope: MCPGovernanceEnvelope = {
    success,
    code,
    message,
    isError,
    tier,
    environment,
    decision: finalDecision,
    degradedMode,
    tierBadge,
    environmentBadge,
    decisionBadge,
    requestId,
    timestamp: timestamp.toISOString(),
    data,
  };

  return envelope;
}
