# AI Agents & MCP — Documentation Index

This directory contains governance specifications and guidance for AI coding agents operating within the Phase Mirror repository.

## Documents

| Document | Description |
|----------|-------------|
| [phase-mirror-coding-agent.md](phase-mirror-coding-agent.md) | **Canonical governance spec** — L0/L1/L2 rules, naming patterns, adapter parameters, circuit breaker rules, ADR references, and self-check protocol. |

## Related Files

| File | Description |
|------|-------------|
| [`packages/mcp-server/src/config/systemPrompt.ts`](../../packages/mcp-server/src/config/systemPrompt.ts) | Runtime system prompt injected into MCP tool context. Must stay in sync with the governance spec. |
| [`packages/mcp-server/README.md`](../../packages/mcp-server/README.md) | MCP server setup, usage, and tool reference. |
| [`docs/AGENT-GOVERNANCE.md`](../AGENT-GOVERNANCE.md) | Short-form quick reference for agent governance. |

## Enforcement

- **CI:** `.github/workflows/agent-governance.yml` validates that the governance spec and system prompt stay in sync.
- **CODEOWNERS:** Changes to `docs/agents/` and `packages/mcp-server/src/config/` require explicit reviewer approval.
- **MCP runtime:** The system prompt is loaded automatically when the MCP server starts — connected agents inherit the rules without manual configuration.
