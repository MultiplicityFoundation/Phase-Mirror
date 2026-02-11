# ADR-008: Single-Repo Dual-License Architecture

## Status
Accepted

## Date
2026-02-10

## Context
Phase Mirror's original plan called for a separate private repository
(mirror-dissonance-pro) for proprietary Tier B rules, compliance packs,
and production infrastructure implementations.

Analysis revealed this dual-repo approach creates:
- Schema sync tax (daily CI to detect drift between repos)
- Copilot context fragmentation (can't see both OSS and Pro code simultaneously)
- Double maintenance burden for a solo founder
- No benefit until multiple contributors require access separation

GitLab, Sentry, and Open Core Ventures portfolio companies have demonstrated
that single-repo dual-license is the industry standard for early-stage
open-core projects.

## Decision
Keep all code in the PhaseMirror/Phase-Mirror public repository.
- packages/ → Phase Mirror License v1.0 (open-core, free use, no managed service)
- proprietary/ → Phase Mirror Pro License v1.0 (source-available, requires paid license)
- Root LICENSE explains the boundary

## Consequences
### Positive
- Zero schema sync cost (shared files by definition)
- Copilot has full context across open-core and Pro code
- Single CI pipeline tests everything
- Extraction to separate repo remains a mechanical operation if needed later

### Negative
- Proprietary code is source-visible to the public
- Requires clear licensing at directory level to avoid confusion
- CODEOWNERS must prevent accidental Pro code in open-core paths

### Governance
- L0 invariant: open-core code NEVER imports from proprietary/
- L0 invariant: Security fixes always land in packages/ first
- Schema definitions always canonical in packages/mirror-dissonance/schemas/
