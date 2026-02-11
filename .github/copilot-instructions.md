---
applyTo: "**"
---
# Phase Mirror — Copilot Instructions

## Repository Architecture: Single-Repo / Dual-License

| Directory | License | Can import from | Cannot import from |
|-----------|---------|-----------------|-------------------|
| `packages/` | Phase Mirror License v1.0 | `packages/` only | `proprietary/` ❌ |
| `proprietary/` | Phase Mirror Pro License v1.0 | `packages/` ✅ AND `proprietary/` | N/A |
| `infra/` | Phase Mirror License v1.0 | N/A | `proprietary/` ❌ |
| `docs/` | Phase Mirror License v1.0 | N/A | N/A |

### The One Rule That Must Never Be Broken
**Open-core code (packages/) NEVER imports from proprietary/.** This is an L0
invariant enforced by CI. Pro code always imports FROM open-core — the
dependency flows one direction only.

### How Pro Code Stays In Sync With Core
- proprietary/package.json declares "@mirror-dissonance/core": "workspace:*"
- pnpm resolves this to the local packages/mirror-dissonance/ source
- When you change a type/interface/schema in core, Pro sees it immediately
- TypeScript project references provide compile-time checking
- If a core change breaks Pro code, pnpm build catches it instantly

### When Adding a Feature, Ask:
1. Does it work without cross-org data? → packages/ (open-core)
2. Does it require network effects, compliance mapping, or hosted infra? → proprietary/
3. Is it a production store implementation (DynamoDB, Redis)? → proprietary/infra/
4. Is it a security fix? → ALWAYS packages/ first, then update Pro if needed

### Schemas
- All schemas live in packages/mirror-dissonance/schemas/ — single source of truth
- Pro code references schemas via import, never duplicates them

### License Gate Pattern
Every Pro feature must call requirePro(context, 'feature-name') before executing:

```typescript
import { requirePro } from '../license-gate';
import type { RuleDefinition } from '@mirror-dissonance/core';

export const rule: RuleDefinition = {
  id: 'MD-100',
  tier: 'B',
  evaluate: async (context) => {
    requirePro(context, 'MD-100: Semantic Job Drift');
    // ... proprietary detection logic
  }
};
```

## Architecture (Three Planes)
- **Plane A (Compute):** L0 invariants (<100ns p99), L1 rule evaluation (<1ms), L2 deep analysis (<100ms)
- **Plane B (Persistence):** FP store, consent store, block counter — accessed via adapter interfaces
- **Plane C (Network Trust):** 6-layer defense for FP calibration (identity, economic, crypto, BFT, privacy, monitoring)

## Non-Negotiable Rules (L0 Invariants)
- L0 checks MUST pass before any higher-layer analysis proceeds
- FP store errors MUST throw (fail-closed), never return empty arrays silently
- Rule evaluation errors MUST produce a synthetic `block` finding, never a silent pass
- All cloud SDK calls MUST go through the adapter factory (`createAdapters`)
- Nonces MUST be cryptographically bound to verified identities (NonceBindingService)

## Code Patterns
- Use adapter interfaces (`FPStoreAdapter`, `ConsentStoreAdapter`, etc.) — never instantiate cloud clients directly
- Import `jest` from `@jest/globals` in all test files (ESM mode)
- Use valid 64-char hex strings for public keys in test fixtures
- Chalk v4 (CommonJS) — not v5 (ESM)
- `CLOUD_PROVIDER=local` is the default path; zero cloud credentials needed for `pnpm test`

## Trust Module (`src/trust/`)
- `trust/identity/` — GitHub verifier, Stripe verifier, nonce binding
- `trust/reputation/` — ReputationEngine, weight calculator
- `trust/adapters/` — Local (JSON) and AWS (DynamoDB) stores
- 31+ existing trust tests; follow patterns in `trust/tests/`

## Commit Conventions
- Open-core changes: `feat:`, `fix:`, `docs:`, `test:`, `ci:`
- Pro changes: `pro(feat):`, `pro(fix):`, `pro(test):`
- License/governance: `legal:`, `governance:`
- Cross-cutting: `build:`, `chore:`
