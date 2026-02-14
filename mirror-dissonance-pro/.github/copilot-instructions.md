---
applyTo: "**"
---
# mirror-dissonance-pro Repository Instructions

This is the PROPRIETARY companion to the open-core MultiplicityFoundation/Phase-Mirror repository.

## What belongs here (NOT in the OSS repo)
- Tier B semantic rules (MD-100+)
- Compliance packs (SOC2, HIPAA, PCI-DSS, AI Act)
- DynamoDB/Redis production store implementations
- FP calibration aggregator (cross-customer pooling)
- Hosted SaaS oracle API
- Federation (multi-repo rollup, cross-repo rules)

## What NEVER belongs here
- L0 invariants (always OSS)
- Core rules MD-001–005 (always OSS)
- Rule interface/schema definitions (shared, OSS-canonical)
- Redaction/anonymizer/nonce (always OSS)
- CLI (always free)

## Schema Sync Rule
- The `dissonance-report.schema.json` in THIS repo must EXACTLY match the OSS version
- Schema changes ALWAYS originate in OSS, then propagate here via CI
- If you need a Pro-only field, add it as an OPTIONAL extension in the shared schema (propose via ADR in OSS first)
- Never create proprietary schema extensions — this breaks interoperability

## Dependency
- This package declares `@phase-mirror/mirror-dissonance` as a peerDependency
- Pro rules implement the same `RuleDefinition` interface from the OSS package
- Pro stores implement the same adapter interfaces (`FPStoreAdapter`, `ConsentStoreAdapter`, etc.)
