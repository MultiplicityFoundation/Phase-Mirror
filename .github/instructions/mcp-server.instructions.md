---
applyTo: "packages/mcp-server/**"
---
# MCP Server — Copilot Instructions

## Governance Tier System

Every MCP tool belongs to exactly one governance tier:

| Tier | Tools | Can block? | Can emit L0 codes? |
|------|-------|------------|---------------------|
| **Authoritative** (🔒) | `analyze_dissonance`, `validate_l0_invariants`, `check_adr_compliance`, `check_consent_requirements` | Yes (cloud only) | Yes |
| **Experimental** (🧪) | `query_fp_store`, `dummy_experimental` | Never | Never |

### Enforcement Floor (normalizeResponse)
- **Floor 1 — Experimental cap:** `decision:"block"` → `"warn"`, L0 codes (`INVARIANT_VIOLATION`, `CONSENT_REQUIRED`) → stripped.
- **Floor 2 — Local degradation:** Authoritative + local → `degradedMode:true`, `decision:"block"` → `"warn"`.

Only authoritative tools running in cloud environment can emit binding `"block"` decisions.

## Environment Detection
- **Cloud:** `fpTableName` AND `consentTableName` are set in config.
- **Local:** Everything else. Local is the default — zero cloud credentials needed.

## MCPGovernanceEnvelope

Every tool response is wrapped in `MCPGovernanceEnvelope` before being returned:
```typescript
{
  success, code, message, isError,
  tier, environment, decision, degradedMode,
  tierBadge, environmentBadge, decisionBadge,
  requestId, timestamp,
  data   // tool-specific payload
}
```

Badge fields (`tierBadge`, `environmentBadge`, `decisionBadge`) are for UI rendering — never parse them programmatically.

## Adding a New Tool

1. Implement in `src/tools/<name>.ts` — export `{ name, description, inputSchema, handler }`.
2. Add tier in `TOOL_TIERS` map in `src/index.ts`.
3. Add decision derivation in `wrapWithGovernance()` if the tool emits structured decisions.
4. Add entry in `policy/mcp-tools.policy.json` with correct `x-tier` and `x-adr`.
5. Re-export from `src/tools/index.ts`.
6. Register in `src/tool-registry.ts`.
7. Write a contract test in `test/<name>.contract.test.ts` proving governance floors.
8. Run `pnpm --filter mcp-server build:contract` and commit updated `mcp-contract.json`.

### Contract Test Pattern
```typescript
import { normalizeResponse } from "../src/utils/normalize-response.js";

it("Floor 1: experimental block → warn", () => {
  const result = normalizeResponse(
    { success: true, decision: "block" },
    { tier: "experimental", environment: "cloud", requestId: "r", timestamp: new Date() }
  );
  expect(result.decision).toBe("warn");
  expect(result.tierBadge).toBe("🧪 Experimental");
});
```

## Decision Derivation

Tools that don't set `decision` explicitly need derivation logic in `wrapWithGovernance()`:

| Tool | Source field | block | warn | pass |
|------|-------------|-------|------|------|
| `validate_l0_invariants` | `validation.allPassed` | `false` | — | `true` |
| `check_adr_compliance` | `compliance.compliant` | `false` | — | `true` |
| `check_consent_requirements` | `canProceed` / `validation.allValid` | `canProceed:false` | `allValid:false` | `true` |
| `analyze_dissonance` | `analysis.decision.action` | `"block"` | `"warn"` | other |
| `query_fp_store` | `success` | — | `false` | `true` |

## Testing

```bash
# Run all MCP server tests
cd packages/mcp-server
node --experimental-vm-modules node_modules/jest/bin/jest.js

# Run only contract tests
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="contract"
```

ESM mode is required — always use `--experimental-vm-modules`. Import jest from `@jest/globals`.

## Files & Layout

```
src/
  index.ts            — MCP server entry, wrapWithGovernance()
  tool-registry.ts    — Centralized tool definitions
  tools/              — Individual tool implementations
  types/              — GovernanceEnvelope, config, context
  utils/              — normalizeResponse, error handling
policy/
  mcp-tools.policy.json  — Tier + ADR assignments
  policy-schema.json     — JSON Schema for policy
scripts/
  build-contract.ts      — Generates mcp-contract.json
test/
  *.contract.test.ts     — Governance floor contract tests
  *.test.ts              — Unit tests
```

## Key Invariants
- Open-core code (`packages/`) NEVER imports from `proprietary/`.
- `normalizeResponse()` is the single enforcement boundary — all governance floor logic lives there.
- Every authoritative tool must have an ADR reference in `mcp-tools.policy.json`.
- `mcp-contract.json` must be regenerated and committed when tools change.
