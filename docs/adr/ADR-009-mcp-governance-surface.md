# ADR-009: MCP as Phase Mirror's Canonical Governance Surface

**Status:** Accepted  
**Date:** 2026-02-17  
**Owner:** Governance Council

## Context

Phase Mirror provides governance analysis for AI systems through the Mirror Dissonance Protocol. As agents (GitHub Copilot, custom AI agents) become primary consumers, we need a canonical, enforced interface that guarantees governance semantics cannot be bypassed by badly prompted or malicious tools.

## Decision

The **Model Context Protocol (MCP) server** is Phase Mirror's only sanctioned governance interface for agents. All governance-relevant tools MUST be exposed through MCP, and MCP's response normalization layer is the non-negotiable enforcement boundary.

### Key Principles

1. **MCP overrides prompts**: Schema and runtime behavior at the MCP layer define authority; prompts can only restrict, never expand.
2. **Visible multiplicity**: Tier (authoritative vs experimental) and environment (local vs cloud) are surfaced in every response envelope.
3. **Policy leads code**: Tools cannot ship without corresponding policy manifest entries.

### Response Envelope

All tools return `MCPGovernanceEnvelope`:

```typescript
{
  success: boolean;           // Tool-level outcome
  tier: "authoritative" | "experimental";
  environment: "local" | "cloud";
  decision?: "block" | "warn" | "pass";
  degradedMode?: boolean;
  requestId: string;
  timestamp: string;
  data?: unknown;
}
```

### Enforcement Floor

- **Experimental tools** cannot emit `decision:"block"` or L0-only codes (`INVARIANT_VIOLATION`, `CONSENT_REQUIRED`).
- **Authoritative tools in local mode** are marked `degradedMode:true` and cannot emit binding blocks.
- Normalization happens at the MCP server boundary via `normalizeResponse()`.

### Proof Artifacts

- Unit test: `packages/mcp-server/test/normalize-response.test.ts`
- Contract test: `packages/mcp-server/test/experimental-floor.contract.test.ts`
- CI enforcement: `.github/workflows/mcp-contract.yml`

## Consequences

### Positive

- Agents cannot bypass governance, even if misprompted.
- Clear distinction between binding (authoritative + cloud) and advisory outputs.
- Enforcement is structural, not social.

### Negative

- Additional build/CI complexity (manifest sync, contract generation).
- Developers must understand tier semantics to add tools.

## References

- ADR-010: MCP Tool Tier Policy
- `packages/mcp-server/policy/mcp-tools.policy.json`
