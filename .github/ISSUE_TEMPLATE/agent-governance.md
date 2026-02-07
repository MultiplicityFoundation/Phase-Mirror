---
name: Agent Governance Violation
about: Report an AI/MCP agent action that violates Phase Mirror governance rules
title: "[agent-governance] "
labels: agent-governance, needs-triage
assignees: ''
---

## Violation Summary

<!-- One sentence describing what the agent did wrong. -->

## Governance Rule Violated

<!-- Check all that apply. -->

- [ ] **L0 Invariant** — which one? (L0-001 … L0-005)
- [ ] **ADR Violation** — which ADR? (ADR-001 … ADR-005)
- [ ] **Adapter bypass** — hardcoded SDK call instead of using adapter interface
- [ ] **Circuit breaker suppressed** — degraded mode silently hidden
- [ ] **Consent / privacy violation** — FP data transmitted without `hasValidConsent()`
- [ ] **Naming convention violation** — resource name doesn't follow the spec
- [ ] **Error handling** — fail-open behaviour on a critical path
- [ ] **Other** — describe below

## Evidence

<!-- Paste the relevant code, PR link, or MCP tool output. -->

```text
(paste here)
```

## Expected Behaviour

<!-- What should the agent have done instead, per docs/agents/phase-mirror-coding-agent.md? -->

## Spec Reference

**Canonical spec:** [`docs/agents/phase-mirror-coding-agent.md`](../../docs/agents/phase-mirror-coding-agent.md)
**Runtime prompt:** [`packages/mcp-server/src/config/systemPrompt.ts`](../../packages/mcp-server/src/config/systemPrompt.ts)

## Environment

- **Agent:** (e.g., GitHub Copilot, Claude, custom MCP client)
- **MCP Server version:** (e.g., 0.1.0)
- **Date/time of violation:**
