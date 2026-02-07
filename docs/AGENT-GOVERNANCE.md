# Agent Governance — Quick Reference

> **Canonical spec:** [`docs/agents/phase-mirror-coding-agent.md`](agents/phase-mirror-coding-agent.md)
> **Runtime prompt:** [`packages/mcp-server/src/config/systemPrompt.ts`](../packages/mcp-server/src/config/systemPrompt.ts)

## TL;DR

All AI / MCP agents operating on the Phase Mirror codebase **must**:

1. **Respect L0 invariants** — schema hash, permission bits, drift magnitude, nonce freshness, contraction witness. These are non-negotiable, fail-closed, ≤ 100 ns p99.
2. **Use the adapter interface** — `CLOUD_PROVIDER=aws|gcp|local`. Never hardcode SDK calls.
3. **Follow ADR-001 … ADR-005** — architectural decisions are enforceable constraints, not suggestions.
4. **Run the PMD self-check loop** before submitting code.
5. **Name dissonance** — if a shortcut would hide a governance tension, surface it explicitly.

## Files That Matter

| File | Role |
|------|------|
| `docs/agents/phase-mirror-coding-agent.md` | Full governance spec (source of truth) |
| `packages/mcp-server/src/config/systemPrompt.ts` | Runtime system prompt (must stay in sync) |
| `.github/workflows/agent-governance.yml` | CI job that enforces spec ↔ prompt sync |
| `.github/ISSUE_TEMPLATE/agent-governance.md` | Template for filing agent-governance violations |

## Changing the Rules

1. Edit `docs/agents/phase-mirror-coding-agent.md`.
2. Update `packages/mcp-server/src/config/systemPrompt.ts` to match.
3. CI will fail if they diverge (line-count + hash check).
4. Changes require CODEOWNERS approval.

## Reporting a Violation

If an AI agent produces code that violates the governance spec, file an issue using the **Agent Governance Violation** template in this repo.
