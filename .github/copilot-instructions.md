# Phase Mirror — Copilot Instructions

## Project Context
Phase Mirror is an open-core AI governance framework (TypeScript/Node.js, pnpm monorepo).
It surfaces productive contradictions (dissonance) in code repositories via a 5-step PMD loop:
Extract → Map Tensions → Rank → Produce Output → Precision Question.

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

## Open-Core Boundary
- Apache 2.0: Rules MD-001–005, rule interface, schema, redaction, CLI, NoOp stores
- Proprietary: Semantic/cross-repo rules, compliance packs, DynamoDB/Redis impls, hosted SaaS, federation
